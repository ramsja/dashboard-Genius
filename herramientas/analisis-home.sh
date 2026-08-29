#!/bin/bash
# Analisis solo lectura de https://www.geniusbet.sv/home
# Sin nmap, sin hydra, sin crawler agresivo, sin exploits.
set -u
URL='https://www.geniusbet.sv/home'
HOST='www.geniusbet.sv'
OUT='/mnt/c/Users/Riesgos/kali-lab/analisis-www'
mkdir -p "$OUT"
export PYTHONUNBUFFERED=1

paso() {
  echo
  echo "------------------------------------------------------------"
  echo ">>> $1"
  echo ">>> $2"
  echo "------------------------------------------------------------"
}

echo "============================================================"
echo "  ANALISIS  https://www.geniusbet.sv/home"
echo "  Modo: solo lectura (DNS, TLS, headers, HTML)"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

paso "[1/8] DNS / CDN" "getent + CNAME"
getent ahostsv4 "$HOST" | awk '{print "  A  "$1}' | sort -u
python3 - <<PY
import socket
print("  CNAME/canon:", socket.getfqdn("$HOST"))
try:
    v6 = sorted({x[4][0] for x in socket.getaddrinfo("$HOST", 443, socket.AF_INET6)})
    print("  IPv6:", ", ".join(v6) if v6 else "(ninguna)")
except Exception:
    print("  IPv6: (sin AAAA o error)")
print("  apex geniusbet.sv:")
try:
    print("   ", ", ".join(sorted({x[4][0] for x in socket.getaddrinfo("geniusbet.sv", 443, socket.AF_INET)})))
except Exception as e:
    print("    error", e)
PY

paso "[2/8] TLS certificado en vivo (www)" "openssl s_client"
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" -brief 2>/dev/null | sed 's/^/  /'
echo
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null \
  | sed 's/^/  /'
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -out "$OUT/live.pem" -outform PEM 2>/dev/null
python3 - <<'PY'
from datetime import datetime, timezone
import subprocess
pem = "/mnt/c/Users/Riesgos/kali-lab/analisis-www/live.pem"
out = subprocess.check_output(["openssl","x509","-in",pem,"-noout","-enddate"], text=True)
s = out.split("=",1)[1].strip()
try:
    dt = datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
except Exception:
    dt = datetime.strptime(s.replace(" GMT",""), "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
days = (dt - datetime.now(timezone.utc)).days
print(f"  Estado: {'VIGENTE' if days>=0 else 'VENCIDO'}  ({days} dias)")
PY

echo
echo "  --- apex geniusbet.sv:443 (origen, a menudo distinto) ---"
echo | openssl s_client -connect "geniusbet.sv:443" -servername "geniusbet.sv" -brief 2>/dev/null | sed 's/^/  /'
echo | openssl s_client -connect "geniusbet.sv:443" -servername "geniusbet.sv" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null \
  | sed 's/^/  /' || echo "  (sin cert o timeout)"

paso "[3/8] Cadena de redireccion de /home" "curl -sI -L"
echo "  HTTPS /home:"
curl -sI --max-time 15 -A 'KaliLab/analisis-home' "$URL" | tee "$OUT/headers-https-home.txt" | sed 's/^/    /'
echo
echo "  HTTP  /home:"
curl -sI --max-time 10 -A 'KaliLab/analisis-home' "http://www.geniusbet.sv/home" | tee "$OUT/headers-http-home.txt" | sed 's/^/    /'
echo
echo "  HTTPS /  (raiz, comparar):"
curl -sI --max-time 10 -A 'KaliLab/analisis-home' "https://www.geniusbet.sv/" | sed 's/^/    /' | head -20

paso "[4/8] Checklist seguridad en /home" "headers HTTPS"
python3 - <<'PY'
from pathlib import Path
hdr = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https-home.txt").read_text(errors="replace")
http = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-http-home.txt").read_text(errors="replace")
low = hdr.lower()
hlow = http.lower()
checks = [
    ("Strict-Transport-Security", "HSTS — fuerza HTTPS"),
    ("Content-Security-Policy", "CSP"),
    ("X-Frame-Options", "clickjacking"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "referrer"),
    ("Permissions-Policy", "permisos API"),
    ("Cross-Origin-Opener-Policy", "COOP"),
    ("X-Powered-By", "filtra stack (malo si SI)"),
    ("Set-Cookie", "sesion"),
    ("Cache-Control", "cache"),
    ("Location", "redirect"),
]
print("  Cabecera                     HTTPS   HTTP    Nota")
print("  ---------------------------- ------- ------- ----")
for name, note in checks:
    h = name.lower() in low
    p = name.lower() in hlow
    print(f"  {name:<28} {'SI' if h else 'NO':<7} {'SI' if p else 'NO':<7} {note}")

def status(t):
    for ln in t.splitlines():
        if ln.upper().startswith("HTTP/"):
            return ln.strip()
    return "?"
print()
print("  status HTTPS /home :", status(hdr))
print("  status HTTP  /home :", status(http))
https_to_https = "location:" in hlow and "https://" in hlow
print("  HTTP /home redirige a HTTPS:", "SI" if https_to_https else "NO  (riesgo: pagina en claro)")
PY

paso "[5/8] Cuerpo de /home" "curl HTML"
curl -sL --max-time 25 -A 'KaliLab/analisis-home' -o "$OUT/home.html" \
  -w "  http=%{http_code}  size=%{size_download}  time=%{time_total}s  redirs=%{num_redirects}  ip=%{remote_ip}  alpn=%{http_version}\n" \
  "$URL"

python3 - <<'PY'
from pathlib import Path
import re
html = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/home.html").read_text(errors="replace")
hdr = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https-home.txt").read_text(errors="replace")
print(f"  bytes_html={len(html)}")
def grab(pat):
    m = re.search(pat, html, re.I|re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:200] if m else "(no)"
print("  title      :", grab(r"<title[^>]*>(.*?)</title>"))
print("  description:", grab(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)'))
print("  canonical  :", grab(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)'))
print("  og:url     :", grab(r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)'))
print("  generator  :", grab(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)'))
print("  next-build :", "SI (x-powered-by Next.js / _next)" if ("_next" in html or "x-powered-by" in hdr.lower()) else "NO")
forms = re.findall(r"<form[^>]*>", html, re.I)
print(f"  forms      : {len(forms)}")
for f in forms[:8]:
    print("   ", re.sub(r"\s+", " ", f)[:160])
# login-ish paths
paths = sorted(set(re.findall(r'["\'](/[a-z0-9_\-./]{1,80})["\']', html, re.I)))
interesting = [p for p in paths if re.search(r"login|signin|auth|register|signup|account|wallet|api|admin|casino|sport", p, re.I)]
print("  rutas visibles (login/api/cuenta):")
for p in interesting[:30]:
    print("   ", p)
hosts = sorted(set(re.findall(r"https?://([^/\"'\s]+)", html, re.I)))
print("  hosts terceros en HTML:")
for h in hosts:
    print("   -", h)
scripts = re.findall(r"<script[^>]+src=[\"']([^\"']+)[\"']", html, re.I)
print(f"  scripts src: {len(scripts)}")
for s in scripts[:15]:
    print("   ", s[:160])
cks = [l.strip() for l in hdr.splitlines() if l.lower().startswith("set-cookie:")]
print(f"  Set-Cookie en respuesta /home: {len(cks)}")
for c in cks[:8]:
    print("   ", c[:180])
    flags = []
    cl = c.lower()
    for fl in ("httponly", "secure", "samesite"):
        flags.append(fl if fl in cl else f"SIN {fl}")
    print("      flags:", ", ".join(flags))
PY

paso "[6/8] Geolocalizar IPs del borde CDN" "ip-api (lectura)"
python3 -u /mnt/c/Users/Riesgos/kali-lab/herramientas/localizar_ip.py "$HOST"

paso "[7/8] Cookies / sesion / cache" "lectura headers"
python3 - <<'PY'
from pathlib import Path
h = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www/headers-https-home.txt").read_text(errors="replace")
for name in ("server","x-powered-by","x-nextjs-cache","x-77-cache","x-77-pop","age","cache-control","vary","content-type"):
    for ln in h.splitlines():
        if ln.lower().startswith(name+":"):
            print(f"  {ln.strip()}")
            break
    else:
        print(f"  {name}: (ausente)")
PY

paso "[8/8] Hallazgos (directivas: no explotar)" "resumen"
python3 - <<'PY'
print("""
  HALLAZGOS (solo lectura)
  1. Si HTTP /home responde 200 sin Location https://  -> falta redireccion HTTPS
  2. Si no hay HSTS                                      -> el navegador no fuerza candado
  3. Si falta CSP / X-Frame-Options / nosniff            -> cabeceras de endurecimiento ausentes
  4. X-Powered-By: Next.js                               -> revela stack
  5. CDN77 Miami                                         -> el origen no es la IP del certificado apex
  6. Cert apex (geniusbet.sv) puede estar VENCIDO        -> clientes que no usen www fallan TLS
  Accion sugerida (defensiva, en el origen/CDN):
     - 301 http -> https en /home y en todo el sitio
     - HSTS max-age>=15552000; includeSubDomains
     - Quitar X-Powered-By
     - Anadir CSP, X-Frame-Options o frame-ancestors, X-Content-Type-Options
     - Renovar cert del apex geniusbet.sv
""")
PY

echo "============================================================"
echo "  FIN ANALISIS /home"
echo "  Archivos: C:\\Users\\Riesgos\\kali-lab\\analisis-www\\"
echo "============================================================"
