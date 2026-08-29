#!/usr/bin/env python3
"""Detectar ataques de fuerza bruta y password spray en logs propios."""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPORT_DIR = "/mnt/c/Users/Riesgos/kali-lab/reportes"
DEFAULT_DIRS = [
    "/mnt/c/Users/Riesgos/kali-lab/evidencias",
    "/var/log",
]

SSH_FAIL = re.compile(
    r"Failed password for (?:invalid user )?(\S+) from (\d{1,3}(?:\.\d{1,3}){3})"
)
SSH_INVALID = re.compile(
    r"Invalid user (\S+) from (\d{1,3}(?:\.\d{1,3}){3})"
)
SSH_AUTHFAIL = re.compile(
    r"authentication failure.*(?:rhost=(\d{1,3}(?:\.\d{1,3}){3})).*(?:user=(\S+))?",
    re.I,
)
COMBINED = re.compile(
    r'(?P<ip>\d{1,3}(?:\.\d{1,3}){3}) - .* \[(?P<ts>[^\]]+)\] '
    r'"(?P<m>GET|POST|PUT|PATCH|HEAD)\s+(?P<path>\S+)[^"]*" (?P<code>\d{3})'
)
UA_LINE = re.compile(r'"([^"]*)"\s*$')
ATTACK_UA = re.compile(
    r"(hydra|medusa|ncrack|patator|nikto|sqlmap|gobuster|ffuf|dirbuster|wpscan|masscan|zgrab|nmap)",
    re.I,
)
WP = re.compile(r"(wp-login\.php|xmlrpc\.php|/admin|/login|/signin|/api/auth|/wp-admin)", re.I)
TS_SYSLOG = re.compile(r"^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})")

SKIP_IP = re.compile(r"^(127\.|0\.|255\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)")


class Hit:
    __slots__ = ("ip", "user", "kind", "path", "ua", "when", "score")

    def __init__(self, ip, user="", kind="", path="", ua="", when="", score=1):
        self.ip = ip
        self.user = user
        self.kind = kind
        self.path = path
        self.ua = ua
        self.when = when
        self.score = score


def paso(n: str, cmd: str) -> None:
    print()
    print("-" * 60)
    print(f">>> {n}")
    print(f">>> {cmd}")
    print("-" * 60)


def collect_files(args: list[str]) -> list[Path]:
    paths: list[Path] = []
    if args:
        raw = args
    else:
        raw = DEFAULT_DIRS
    for a in raw:
        p = Path(a)
        if p.is_file():
            paths.append(p)
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if not f.is_file():
                    continue
                if f.suffix.lower() in {".png", ".jpg", ".zip", ".gz", ".pcap", ".exe"}:
                    continue
                if f.stat().st_size > 8_000_000:
                    continue
                name = f.name.lower()
                if any(x in name for x in ("auth", "secure", "access", "nginx", "apache", "login", "ssh", "fail", "log", ".txt")):
                    paths.append(f)
        else:
            print(f"  no existe: {a}")
    # unique
    seen = set()
    out = []
    for p in paths:
        s = str(p)
        if s not in seen:
            seen.add(s)
            out.append(p)
    return out


def parse_file(path: Path) -> list[Hit]:
    hits: list[Hit] = []
    try:
        text = path.read_text(errors="replace")
    except Exception as e:
        print(f"  no se pudo leer {path}: {e}")
        return hits
    for ln in text.splitlines():
        when = ""
        mts = TS_SYSLOG.search(ln)
        if mts:
            when = mts.group(1)
        m = SSH_FAIL.search(ln)
        if m:
            hits.append(Hit(m.group(2), m.group(1), "ssh-fail", "/ssh", when=when, score=3))
            continue
        m = SSH_INVALID.search(ln)
        if m:
            hits.append(Hit(m.group(2), m.group(1), "ssh-invalid", "/ssh", when=when, score=2))
            continue
        m = COMBINED.search(ln)
        if m:
            code = int(m.group("code"))
            path_u = m.group("path")
            ip = m.group("ip")
            ua = ""
            um = UA_LINE.search(ln)
            if um:
                ua = um.group(1)
            loginish = bool(WP.search(path_u)) or code in (401, 403)
            if not loginish and not ATTACK_UA.search(ua):
                continue
            score = 1
            kind = f"http-{code}"
            if ATTACK_UA.search(ua):
                score += 8
                kind = "http-tool"
            if WP.search(path_u):
                score += 2
            if code in (401, 403):
                score += 2
            hits.append(
                Hit(ip, "", kind, path_u[:80], ua[:80], when=m.group("ts"), score=score)
            )
    return hits


def geo_batch(ips: list[str]) -> dict:
    ips = [i for i in ips if not SKIP_IP.match(i)][:12]
    if not ips:
        return {}
    url = "http://ip-api.com/batch?fields=status,country,city,isp,org,as,proxy,hosting,query"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(ips).encode(),
            headers={"User-Agent": "KaliLab/fuerza-bruta", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=12) as r:
            arr = json.loads(r.read().decode("utf-8", "replace"))
        return {x["query"]: x for x in arr if isinstance(x, dict) and x.get("query")}
    except Exception as e:
        print(f"  geo no disponible: {e}")
        return {}


def summarize(hits: list[Hit]) -> dict:
    by_ip: dict[str, dict] = defaultdict(lambda: {
        "score": 0, "n": 0, "users": set(), "kinds": set(), "paths": set(),
        "ua": set(), "first": "", "last": "",
    })
    for h in hits:
        d = by_ip[h.ip]
        d["score"] += h.score
        d["n"] += 1
        if h.user and h.user not in ("*", "unknown"):
            d["users"].add(h.user)
        d["kinds"].add(h.kind)
        if h.path:
            d["paths"].add(h.path)
        if h.ua:
            d["ua"].add(h.ua)
        if h.when:
            if not d["first"]:
                d["first"] = h.when
            d["last"] = h.when
    return by_ip


def nivel(d: dict) -> str:
    users = len(d["users"])
    if d["score"] >= 40 or d["n"] >= 20 or users >= 8:
        return "ALTO"
    if d["score"] >= 12 or d["n"] >= 6 or users >= 3:
        return "MEDIO"
    return "BAJO"


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    print("=" * 60)
    print("  DETECTAR FUERZA BRUTA  (logs propios)")
    print("  No lanza ataques. Solo localiza IPs y patrones en evidencias.")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    files = collect_files(args)
    paso("Archivos", f"{len(files)} log(s)")
    if not files:
        print("  Pon un .log en evidencias\\ o pasa la ruta del archivo.")
        return 1
    for f in files:
        print(f"  - {f}")

    hits: list[Hit] = []
    paso("Parseo", "sshd + Combined Log (401/403/login) + user-agents")
    for f in files:
        part = parse_file(f)
        print(f"  {f.name}: {len(part)} eventos")
        hits.extend(part)
    print(f"  TOTAL eventos: {len(hits)}")
    if not hits:
        print("  No hay fallos de autenticacion en estos archivos.")
        print("  Formatos que entiende: auth.log / syslog sshd, access.log nginx/apache.")
        return 0

    by_ip = summarize(hits)
    ranked = sorted(by_ip.items(), key=lambda kv: (-kv[1]["score"], -kv[1]["n"]))

    paso("Ranking de IPs atacantes", "score = fallos + tools + spray de usuarios")
    print(f"  {'IP':<18} {'Evt':>4} {'Niv':<6} {'Users':>5}  primer -> ultimo")
    print("  " + "-" * 70)
    lines_out = []
    for ip, d in ranked[:40]:
        lv = nivel(d)
        users = ",".join(sorted(d["users"])[:6])
        print(f"  {ip:<18} {d['n']:>4} {lv:<6} {len(d['users']):>5}  {d['first'] or '-'} -> {d['last'] or '-'}")
        if users:
            print(f"      usuarios: {users}")
        if d["kinds"]:
            print(f"      tipos   : {', '.join(sorted(d['kinds']))}")
        tool_ua = [u for u in d["ua"] if ATTACK_UA.search(u)]
        if tool_ua:
            print(f"      tool    : {tool_ua[0][:70]}")
        lines_out.append(
            f"{lv:6} {ip:18} evt={d['n']} users={len(d['users'])} {users} {d['first']}->{d['last']}"
        )

    altos = [(ip, d) for ip, d in ranked if nivel(d) in ("ALTO", "MEDIO")]
    paso("Geolocalizar IPs de riesgo", "ip-api (max 12)")
    geo = geo_batch([ip for ip, _ in altos[:12]])
    for ip, d in altos[:12]:
        g = geo.get(ip, {})
        flags = []
        if g.get("proxy"):
            flags.append("proxy/VPN")
        if g.get("hosting"):
            flags.append("datacenter")
        extra = (" [" + ", ".join(flags) + "]") if flags else ""
        if g:
            print(f"  {ip}  {g.get('country','')} / {g.get('city','')}  | {g.get('isp','')} | {g.get('as','')}{extra}")
        else:
            print(f"  {ip}  (sin geo; puede ser privada)")

    spray = [ip for ip, d in ranked if len(d["users"]) >= 5]
    paso("Hallazgos", "resumen operativo")
    print(f"  IPs distintas     : {len(by_ip)}")
    print(f"  Nivel ALTO/MEDIO  : {len(altos)}")
    print(f"  Password spray    : {len(spray)} IP(s) probaron muchos usuarios")
    print("  Accion sugerida   : bloquear las IP ALTO en firewall / fail2ban")
    print("                      NO atacar esas IP; solo defender y documentar")

    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = os.path.join(REPORT_DIR, f"fuerza-bruta-{stamp}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("DETECTAR FUERZA BRUTA\n")
        f.write("\n".join(lines_out) + "\n")
    print()
    print("=" * 60)
    print("  FIN DETECTAR FUERZA BRUTA")
    print(f"  Reporte: {path.replace('/mnt/c/Users/Riesgos/', 'C:/Users/Riesgos/')}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
