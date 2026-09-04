#!/usr/bin/env python3
"""Localizar IP / dominio: DNS, reverse, WHOIS, geo, ASN. Solo lectura."""
from __future__ import annotations

import json
import os
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

IPV4 = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
)
REPORT_DIR = "/mnt/c/Users/Riesgos/kali-lab/reportes"


def paso(n: str, cmd: str) -> None:
    print()
    print("-" * 60)
    print(f">>> {n}")
    print(f">>> {cmd}")
    print("-" * 60)


def run(cmd: list[str], timeout: int = 15) -> str:
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, errors="replace"
        )
        return (p.stdout or "") + (p.stderr or "")
    except Exception as e:
        return f"(error: {e})"


def is_ip(s: str) -> bool:
    try:
        socket.inet_pton(socket.AF_INET, s)
        return True
    except OSError:
        try:
            socket.inet_pton(socket.AF_INET6, s)
            return True
        except OSError:
            return False


def dns_records(host: str) -> dict:
    out = {"A": [], "AAAA": [], "canon": "", "rev": []}
    try:
        out["canon"] = socket.getfqdn(host)
    except Exception:
        pass
    try:
        for fam, key in ((socket.AF_INET, "A"), (socket.AF_INET6, "AAAA")):
            seen = set()
            try:
                for item in socket.getaddrinfo(host, None, fam):
                    ip = item[4][0]
                    if ip not in seen:
                        seen.add(ip)
                        out[key].append(ip)
            except socket.gaierror:
                pass
    except Exception as e:
        out["err"] = str(e)
    if is_ip(host):
        try:
            name, aliases, _ = socket.gethostbyaddr(host)
            out["rev"] = [name] + [a for a in aliases if a != name]
        except Exception:
            out["rev"] = []
    bits = []
    for rr in ("A", "AAAA", "CNAME", "MX", "NS"):
        chunk = run(["dig", "+short", rr, host], 6)
        for ln in chunk.splitlines():
            s = ln.strip()
            if s and not s.lower().startswith(";;"):
                bits.append(f"{rr} {s}")
    out["dig"] = "\n".join(bits[:20])
    return out


def whois_text(target: str) -> str:
    raw = run(["whois", target], 18)
    keep = (
        "orgname",
        "org-name",
        "organization",
        "netname",
        "descr",
        "country",
        "origin",
        "originas",
        "cidr",
        "inetnum",
        "netrange",
        "abuse",
        "email",
        "address",
        "city",
        "stateprov",
        "nserver",
        "registrar",
        "name server",
        "creation",
        "updated",
        "expir",
        "status",
        "role",
        "person",
    )
    lines = []
    for ln in raw.splitlines():
        s = ln.strip()
        if not s or s.startswith("%") or s.startswith("#") or s.startswith(">>>") :
            continue
        low = s.lower()
        if any(k in low for k in keep):
            lines.append(s[:160])
        if len(lines) >= 40:
            break
    if not lines:
        lines = [ln.strip()[:160] for ln in raw.splitlines() if ln.strip()][:25]
    return "\n".join("  " + x for x in lines) if lines else "  (sin whois o timeout)"


def geo_one(ip: str) -> dict:
    url = f"http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,proxy,hosting,query"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KaliLab/localizar-ip"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return data if isinstance(data, dict) else {"status": "fail", "message": "json"}
    except Exception as e:
        return {"status": "fail", "message": str(e)}


def geo_batch(ips: list[str]) -> dict[str, dict]:
    ips = ips[:15]
    if not ips:
        return {}
    if len(ips) == 1:
        return {ips[0]: geo_one(ips[0])}
    body = json.dumps(ips).encode()
    url = "http://ip-api.com/batch?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,proxy,hosting,query"
    try:
        req = urllib.request.Request(
            url, data=body, headers={"User-Agent": "KaliLab/localizar-ip", "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            arr = json.loads(r.read().decode("utf-8", "replace"))
        out = {}
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, dict) and item.get("query"):
                    out[item["query"]] = item
        return out
    except Exception:
        return {ip: geo_one(ip) for ip in ips}


def print_geo(ip: str, g: dict) -> None:
    if g.get("status") != "success":
        print(f"  {ip}  geo: {g.get('message', 'sin datos')}")
        return
    flags = []
    if g.get("proxy"):
        flags.append("proxy/VPN")
    if g.get("hosting"):
        flags.append("hosting/datacenter")
    extra = ("  [" + ", ".join(flags) + "]") if flags else ""
    print(f"  {ip}")
    print(f"    pais     : {g.get('country','')} / {g.get('regionName','')} / {g.get('city','')}")
    print(f"    coords   : {g.get('lat','')} , {g.get('lon','')}   tz={g.get('timezone','')}")
    print(f"    ISP/org  : {g.get('isp','')}  |  {g.get('org','')}")
    print(f"    ASN      : {g.get('as','')}  {g.get('asname','')}")
    print(f"    reverse  : {g.get('reverse','') or '(ninguno)'}{extra}")


def extract_ips(path: str) -> list[str]:
    text = ""
    try:
        with open(path, "r", errors="replace") as f:
            text = f.read(2_000_000)
    except Exception as e:
        print(f"  no se pudo leer {path}: {e}")
        return []
    seen = []
    for ip in IPV4.findall(text):
        if ip.startswith(("0.", "127.", "255.")) or ip.endswith(".0") or ip.endswith(".255"):
            continue
        if ip not in seen:
            seen.append(ip)
    return seen


def save_report(name: str, lines: list[str]) -> str:
    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = os.path.join(REPORT_DIR, f"ip-{name}-{stamp}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path


def locate_one(target: str, collected: list[str]) -> None:
    paso(f"Objetivo {target}", "DNS + reverse")
    info = dns_records(target)
    collected.append(f"OBJETIVO {target}")
    if info.get("canon"):
        print(f"  canon : {info['canon']}")
        collected.append(f"canon {info['canon']}")
    if info["A"]:
        print("  A     :", ", ".join(info["A"]))
        collected.append("A " + ", ".join(info["A"]))
    if info["AAAA"]:
        print("  AAAA  :", ", ".join(info["AAAA"]))
    if info["rev"]:
        print("  PTR   :", ", ".join(info["rev"]))
        collected.append("PTR " + ", ".join(info["rev"]))
    if info.get("dig"):
        print("  dig   :")
        for ln in info["dig"].splitlines()[:12]:
            print("   ", ln)

    who_target = info["A"][0] if (not is_ip(target) and info["A"]) else target
    paso("WHOIS", f"whois {who_target}")
    w = whois_text(who_target)
    print(w)
    collected.append(w)

    ips = []
    if is_ip(target):
        ips = [target]
    else:
        ips = list(info["A"])
    paso("Geolocalizacion / ASN", "ip-api.com (solo lectura)")
    geo = geo_batch(ips)
    for ip in ips:
        print_geo(ip, geo.get(ip, {}))
        g = geo.get(ip, {})
        collected.append(
            f"{ip} | {g.get('country','')} {g.get('city','')} | {g.get('isp','')} | {g.get('as','')}"
        )


def main() -> int:
    args = [a for a in sys.argv[1:] if a and not a.startswith("-")]
    print("=" * 60)
    print("  LOCALIZAR IP  (DNS, WHOIS, geo, ASN)")
    print("  Solo lectura. No escanea puertos ni ataca.")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    if not args:
        print("Uso: localizar-ip.sh <IP|dominio|archivo>")
        print("Ej:  localizar-ip.sh 1.1.1.1")
        print("     localizar-ip.sh www.example.com")
        return 1

    collected: list[str] = []
    target = args[0]
    if os.path.isfile(target):
        paso("Archivo", target)
        ips = extract_ips(target)
        print(f"  IPs unicas: {len(ips)}")
        for ip in ips[:40]:
            print("   -", ip)
        if not ips:
            print("  no hay IPv4 en el archivo")
            return 0
        geo = geo_batch(ips[:15])
        paso("Geolocalizacion de IPs del archivo (max 15)", "ip-api batch")
        for ip in ips[:15]:
            print_geo(ip, geo.get(ip, {}))
            g = geo.get(ip, {})
            collected.append(
                f"{ip} | {g.get('country','')} {g.get('city','')} | {g.get('isp','')} | {g.get('as','')}"
            )
        if len(ips) > 15:
            print(f"  ... +{len(ips)-15} IPs no geolocalizadas (limite API)")
        tag = os.path.basename(target)
    else:
        locate_one(target, collected)
        tag = re.sub(r"[^A-Za-z0-9._-]+", "_", target)[:40]
        for extra in args[1:]:
            if os.path.isfile(extra):
                continue
            locate_one(extra, collected)

    path = save_report(tag, collected)
    print()
    print("=" * 60)
    print("  FIN LOCALIZAR IP")
    print(f"  Reporte: {path.replace('/mnt/c/Users/Riesgos/', 'C:/Users/Riesgos/')}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
