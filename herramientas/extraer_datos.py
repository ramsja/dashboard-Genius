#!/usr/bin/env python3
"""Extraer IPs, emails, URLs, hashes y secretos de evidencias propias."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

REPORT_DIR = "/mnt/c/Users/Riesgos/kali-lab/reportes"
DEFAULT = "/mnt/c/Users/Riesgos/kali-lab/evidencias"

RE = {
    "ipv4": re.compile(
        r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
    ),
    "email": re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    "url": re.compile(r"https?://[^\s\"'<>\\]+", re.I),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"),
    "bcrypt": re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"),
    "aws": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "privkey": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
    "sha256": re.compile(r"\b[a-fA-F0-9]{64}\b"),
    "sha1": re.compile(r"\b[a-fA-F0-9]{40}\b"),
    "md5": re.compile(r"\b[a-fA-F0-9]{32}\b"),
    "ntlm": re.compile(r"\b[a-fA-F0-9]{32}:[a-fA-F0-9]{32}\b"),
}

SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".zip", ".gz", ".xz", ".exe", ".dll", ".pyc"}
MAX_FILE = 6_000_000


def paso(n: str, cmd: str) -> None:
    print()
    print("-" * 60)
    print(f">>> {n}")
    print(f">>> {cmd}")
    print("-" * 60)


def unique(seq):
    seen = OrderedDict()
    for x in seq:
        if x not in seen:
            seen[x] = True
    return list(seen.keys())


def collect(args: list[str]) -> list[Path]:
    raw = args or [DEFAULT]
    files: list[Path] = []
    for a in raw:
        p = Path(a)
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file() and f.suffix.lower() not in SKIP_EXT:
                    files.append(f)
        else:
            print(f"  no existe: {a}")
    return files


def extract_text(text: str) -> dict[str, list[str]]:
    found = {k: [] for k in RE}
    for k, rx in RE.items():
        found[k] = unique(rx.findall(text))
    # hashes: drop overlaps (sha256 contains md5-looking chunks; ntlm is two md5)
    sha256 = set(found["sha256"])
    ntlm = set(found["ntlm"])
    found["sha1"] = [x for x in found["sha1"] if not any(x in s for s in sha256)]
    found["md5"] = [
        x
        for x in found["md5"]
        if not any(x in s for s in sha256)
        and not any(x in n for n in ntlm)
        and x not in found["sha1"]
    ]
    return found


def tshark_pcap(path: Path) -> dict[str, list[str]]:
    if not path.suffix.lower() in {".pcap", ".pcapng", ".cap"}:
        return {}
    cmd = [
        "tshark", "-r", str(path), "-T", "fields",
        "-e", "ip.src", "-e", "ip.dst", "-e", "http.host", "-e", "dns.qry.name",
        "-e", "http.request.uri",
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30, errors="replace")
    except Exception as e:
        print(f"  tshark error: {e}")
        return {}
    ips, hosts, uris = [], [], []
    for ln in p.stdout.splitlines():
        parts = ln.split("\t")
        for i, bucket in enumerate((ips, ips, hosts, hosts, uris)):
            if i < len(parts) and parts[i].strip():
                bucket.append(parts[i].strip())
    return {
        "ipv4": unique(ips)[:80],
        "host-pcap": unique(hosts)[:80],
        "uri-pcap": unique(uris)[:80],
    }


def print_bucket(title: str, items: list[str], limit: int = 40) -> None:
    print(f"  {title}: {len(items)}")
    for x in items[:limit]:
        print(f"    {x[:180]}")
    if len(items) > limit:
        print(f"    ... +{len(items)-limit} mas")


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    print("=" * 60)
    print("  EXTRAER DATOS  (IPs, emails, URLs, hashes, secretos)")
    print("  Solo evidencias que TU poseas.")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    files = collect(args)
    paso("Archivos", f"{len(files)}")
    if not files:
        print("  Pasa un archivo/carpeta o pon dumps en evidencias\\")
        return 1
    for f in files:
        print(f"  - {f}  ({f.stat().st_size if f.exists() else 0} bytes)")

    merged: dict[str, list[str]] = {}

    paso("Extraccion regex + tshark (pcap)", "IPv4 email url jwt hash aws key")
    for f in files:
        extra = {}
        if f.suffix.lower() in {".pcap", ".pcapng", ".cap"}:
            extra = tshark_pcap(f)
            print(f"  pcap {f.name}: { {k: len(v) for k, v in extra.items()} }")
        try:
            if f.stat().st_size > MAX_FILE:
                print(f"  skip grande: {f.name}")
                text = ""
            else:
                text = f.read_text(errors="replace")
        except Exception:
            text = ""
        found = extract_text(text) if text else {k: [] for k in RE}
        for k, vals in list(found.items()) + list(extra.items()):
            merged.setdefault(k, [])
            merged[k].extend(vals)

    for k in list(merged):
        merged[k] = unique(merged[k])

    print_bucket("IPv4", merged.get("ipv4", []))
    print_bucket("Emails", merged.get("email", []))
    print_bucket("URLs", merged.get("url", []), 25)
    print_bucket("JWT", merged.get("jwt", []), 10)
    print_bucket("bcrypt", merged.get("bcrypt", []), 10)
    print_bucket("MD5", merged.get("md5", []), 15)
    print_bucket("SHA1", merged.get("sha1", []), 10)
    print_bucket("SHA256", merged.get("sha256", []), 10)
    print_bucket("NTLM", merged.get("ntlm", []), 10)
    print_bucket("AWS key id", merged.get("aws", []), 10)
    print_bucket("Private keys", merged.get("privkey", []), 5)

    paso("Resumen", "conteo")
    order = [
        "ipv4", "email", "url", "jwt", "bcrypt", "md5", "sha1", "sha256",
        "ntlm", "aws", "privkey",
    ]
    for k in order:
        print(f"  {k:<12} {len(merged.get(k, []))}")

    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = os.path.join(REPORT_DIR, f"datos-{stamp}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("EXTRAER DATOS\n")
        for k in order:
            f.write(f"\n[{k}] {len(merged.get(k, []))}\n")
            for x in merged.get(k, []):
                f.write(x + "\n")
    print()
    print("=" * 60)
    print("  FIN EXTRAER DATOS")
    print(f"  Reporte: {path.replace('/mnt/c/Users/Riesgos/', 'C:/Users/Riesgos/')}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
