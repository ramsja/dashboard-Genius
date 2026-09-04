#!/bin/bash
# Analisis sencillo de https://www.geniusbet.sv/  (solo lectura)
set -u
URL='https://www.geniusbet.sv/'
HOST='www.geniusbet.sv'
OUT='/mnt/c/Users/Riesgos/kali-lab/analisis-www'
mkdir -p "$OUT"

echo "============================================================"
echo "  ANALISIS SENCILLO"
echo "  $URL"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"
echo

echo "[1] DNS"
getent ahostsv4 "$HOST" | awk '{print "  A  "$1}' | sort -u
python3 - <<PY
import socket
print("  CNAME/canon:", socket.getfqdn("$HOST"))
try:
    print("  IPv6:", ", ".join(sorted({x[4][0] for x in socket.getaddrinfo("$HOST", 443, socket.AF_INET6)})) or "(ninguna)")
except Exception:
    print("  IPv6: (sin AAAA o error)")
PY
echo

echo "[2] TLS (certificado en vivo)"
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -brief 2>/dev/null | sed 's/^/  /'
echo
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null \
  | sed 's/^/  /'
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -out "$OUT/live.pem" -outform PEM 2>/dev/null
if command -v python3 >/dev/null; then
python3 - <<'PY'
from datetime import datetime, timezone
import subprocess, os
pem = "/mnt/c/Users/Riesgos/kali-lab/analisis-www/live.pem"
if os.path.exists(pem):
    out = subprocess.check_output(["openssl","x509","-in",pem,"-noout","-enddate"], text=True)
    # notAfter=Oct 16 04:38:57 2026 GMT
    s = out.split("=",1)[1].strip()
    try:
        dt = datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.strptime(s.replace(" GMT",""), "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
    days = (dt - datetime.now(timezone.utc)).days
    print(f"  Estado: {'VIGENTE' if days>=0 else 'VENCIDO'}  ({days} dias)")
PY
fi
echo

echo "[3] Cabeceras HTTPS (URL exacta)"
curl -sI --max-time 20 -A 'KaliLab/analisis-sencillo' "$URL" | tee "$OUT/headers-https.txt" | sed 's/^/  /'
echo

echo "[4] Cabeceras HTTP (comparacion, misma ruta)"
curl -sI --max-time 20 -A 'KaliLab/analisis-sencillo' "http://www.geniusbet.sv/" | tee "$OUT/headers-http.txt" | sed 's/^/  /'
echo

echo "[5] Cabeceras de seguridad (checklist)"
python3 - <<'PY'
from pathlib import Path
hdr = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https.txt").read_text(errors="replace")
low = hdr.lower()
checks = [
    ("Strict-Transport-Security", "HSTS (fuerza HTTPS)"),
    ("Content-Security-Policy", "CSP"),
    ("X-Frame-Options", "clickjacking"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "referrer"),
    ("Permissions-Policy", "permisos del navegador"),
    ("Cross-Origin-Opener-Policy", "COOP"),
    ("Set-Cookie", "cookies"),
]
print("  Cabecera                     Presente")
print("  ---------------------------- --------")
for name, _ in checks:
    present = name.lower() in low
    print(f"  {name:<28} {'SI' if present else 'NO'}")
PY
echo

echo "[6] Cuerpo de la pagina (metadatos, sin crawler)"
curl -sL --max-time 25 -A 'KaliLab/analisis-sencillo' -o "$OUT/page.html" -w "  http=%{http_code}  size=%{size_download}  time=%{time_total}s  redirs=%{num_redirects}  ip=%{remote_ip}  http_version=%{http_version}\n" "$URL"
python3 - <<'PY'
from pathlib import Path
import re
html = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/page.html").read_text(errors="replace")
print(f"  bytes_html={len(html)}")
def grab(pat, flags=re.I|re.S):
    m = re.search(pat, html, flags)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:180] if m else "(no)"
print("  title     :", grab(r"<title[^>]*>(.*?)</title>"))
print("  generator :", grab(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)'))
print("  viewport  :", grab(r'<meta[^>]+name=["\']viewport["\'][^>]+content=["\']([^"\']+)'))
print("  canonical :", grab(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)'))
# scripts / cdn hints
hosts = sorted(set(re.findall(r"https?://([^/\"'\s]+)", html, re.I)))
print("  hosts en HTML:")
for h in hosts[:25]:
    print("   -", h)
if len(hosts) > 25:
    print(f"   ... +{len(hosts)-25} mas")
# cookies from headers
hdr = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https.txt").read_text(errors="replace")
cks = [l.strip() for l in hdr.splitlines() if l.lower().startswith("set-cookie:")]
print("  cookies:", len(cks))
for c in cks[:8]:
    print("   ", c[:160])
PY
echo

echo "[7] Resumen corto"
python3 - <<'PY'
from pathlib import Path
https = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https.txt").read_text(errors="replace")
http = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-http.txt").read_text(errors="replace")
def status(t):
    for line in t.splitlines():
        if line.upper().startswith("HTTP/"):
            return line.strip()
    return "?"
def hdr(t, name):
    for line in t.splitlines():
        if line.lower().startswith(name.lower()+":"):
            return line.split(":",1)[1].strip()
    return None
print("  HTTPS status :", status(https))
print("  HTTP  status :", status(http))
print("  Server HTTPS :", hdr(https,"server") or "(oculto)")
print("  Server HTTP  :", hdr(http,"server") or "(oculto)")
print("  HTTP redirige a HTTPS:", "SI" if "location:" in http.lower() and "https://" in http.lower() else "NO")
print("  HSTS                 :", "SI" if hdr(https,"strict-transport-security") else "NO")
print("  Archivos             : /mnt/c/Users/Riesgos/kali-lab/analisis-www/")
PY
echo DONE
