#!/bin/bash
# Analisis sencillo visible paso a paso: https://www.geniusbet.sv/
set -u
URL='https://www.geniusbet.sv/'
HOST='www.geniusbet.sv'
OUT='/mnt/c/Users/Riesgos/kali-lab/analisis-www'
mkdir -p "$OUT"

paso() {
  echo
  echo "------------------------------------------------------------"
  echo ">>> $1"
  echo ">>> comando: $2"
  echo "------------------------------------------------------------"
}

echo "============================================================"
echo "  ANALISIS SENCILLO  (visible en esta consola)"
echo "  URL : $URL"
echo "  Fecha: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

paso "[1/6] DNS — a que IP y CDN apunta www" "getent / python socket"
getent ahostsv4 "$HOST" | awk '{print "  A  "$1}' | sort -u
python3 - <<PY
import socket
print("  CNAME/canon:", socket.getfqdn("$HOST"))
try:
    v6 = sorted({x[4][0] for x in socket.getaddrinfo("$HOST", 443, socket.AF_INET6)})
    print("  IPv6:", ", ".join(v6) if v6 else "(ninguna)")
except Exception:
    print("  IPv6: (sin AAAA o error)")
PY

paso "[2/6] TLS — certificado HTTPS en vivo" "openssl s_client + x509"
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -brief 2>/dev/null | sed 's/^/  /'
echo
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null \
  | sed 's/^/  /'
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -out "$OUT/live.pem" -outform PEM 2>/dev/null
python3 - <<'PY'
from datetime import datetime, timezone
import subprocess, os
pem = "/mnt/c/Users/Riesgos/kali-lab/analisis-www/live.pem"
if os.path.exists(pem):
    out = subprocess.check_output(["openssl","x509","-in",pem,"-noout","-enddate"], text=True)
    s = out.split("=",1)[1].strip()
    try:
        dt = datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.strptime(s.replace(" GMT",""), "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
    days = (dt - datetime.now(timezone.utc)).days
    print(f"  Estado: {'VIGENTE' if days>=0 else 'VENCIDO'}  ({days} dias)")
PY

paso "[3/6] Cabeceras HTTPS de la URL" "curl -sI https://www.geniusbet.sv/"
curl -sI --max-time 15 -A 'KaliLab/analisis-sencillo' "$URL" | tee "$OUT/headers-https.txt" | sed 's/^/  /'

paso "[4/6] Cabeceras HTTP (sin candado) para comparar" "curl -sI http://www.geniusbet.sv/"
curl -sI --max-time 8 -A 'KaliLab/analisis-sencillo' "http://www.geniusbet.sv/" | tee "$OUT/headers-http.txt" | sed 's/^/  /'

paso "[5/6] Checklist de cabeceras de seguridad" "lectura de headers-https.txt"
python3 - <<'PY'
from pathlib import Path
hdr = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https.txt").read_text(errors="replace")
low = hdr.lower()
checks = [
    ("Strict-Transport-Security", "fuerza HTTPS"),
    ("Content-Security-Policy", "CSP"),
    ("X-Frame-Options", "clickjacking"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "referrer"),
    ("Permissions-Policy", "permisos"),
    ("X-Powered-By", "revela tecnologia"),
    ("Set-Cookie", "cookies"),
]
print("  Cabecera                     Presente  Nota")
print("  ---------------------------- --------  ----")
for name, note in checks:
    present = name.lower() in low
    print(f"  {name:<28} {'SI' if present else 'NO':<8}  {note}")
PY

paso "[6/6] Pagina: titulo, tamano, terceros" "curl HTML + parseo"
curl -sL --max-time 20 -A 'KaliLab/analisis-sencillo' -o "$OUT/page.html" \
  -w "  http=%{http_code}  size=%{size_download}  time=%{time_total}s  ip=%{remote_ip}  http=%{http_version}\n" "$URL"
python3 - <<'PY'
from pathlib import Path
import re
html = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/page.html").read_text(errors="replace")
print(f"  bytes_html={len(html)}")
def grab(pat):
    m = re.search(pat, html, re.I|re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:180] if m else "(no)"
print("  title     :", grab(r"<title[^>]*>(.*?)</title>"))
print("  canonical :", grab(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)'))
hosts = sorted(set(re.findall(r"https?://([^/\"'\s]+)", html, re.I)))
print("  hosts en HTML:")
for h in hosts:
    print("   -", h)
PY

echo
echo "============================================================"
echo "  FIN DEL ANALISIS  —  la consola sigue abierta"
echo "  Archivos: C:\\Users\\Riesgos\\kali-lab\\analisis-www\\"
echo "============================================================"
echo
