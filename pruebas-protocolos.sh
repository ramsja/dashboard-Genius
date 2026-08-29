#!/bin/bash
# Pruebas de certificados y protocolos (solo lectura). Sin exploits, sin nmap remoto.
echo "============================================================"
echo "  CERTIFICADOS HTTPS Y PROTOCOLOS BASICOS (Kali)"
echo "  Solo lectura: DNS, TCP, HTTP headers, TLS"
echo "============================================================"
echo

echo "[1] DNS"
for h in www.geniusbet.sv geniusbet.sv; do
  echo "  $h"
  getent ahostsv4 "$h" | awk '{print "    A  "$1}' | sort -u
  # CNAME via python to avoid extra tools
  python3 - <<PY
import socket
h="$h"
try:
    print("    canon", socket.getfqdn(h))
except Exception as e:
    print("    dns error", e)
PY
done
echo

echo "[2] TCP 80/443 (timeout 5s)"
python3 - <<'PY'
import socket
for host, port in [
    ("www.geniusbet.sv", 443),
    ("www.geniusbet.sv", 80),
    ("geniusbet.sv", 443),
    ("geniusbet.sv", 80),
]:
    s = socket.socket()
    s.settimeout(5)
    try:
        s.connect((host, port))
        ip = s.getpeername()[0]
        print(f"  {host}:{port}  ABIERTO  ({ip})")
        s.close()
    except Exception as e:
        print(f"  {host}:{port}  CERRADO  ({e})")
PY
echo

echo "[3] HTTP vs HTTPS (redireccion y HSTS)"
for u in \
  "http://www.geniusbet.sv/home" \
  "https://www.geniusbet.sv/home" \
  "http://geniusbet.sv/" \
  "https://geniusbet.sv/"
do
  echo "  URL   $u"
  hdr=$(curl -sI --max-time 15 -o /dev/null -D - "$u" 2>&1)
  echo "$hdr" | awk 'BEGIN{IGNORECASE=1}
    /^HTTP\// {print "        "$0}
    /^Location:/ {print "        "$0}
    /^Strict-Transport-Security:/ {print "        HSTS  SI  "$0}
    /^Server:/ {print "        "$0}'
  echo "$hdr" | grep -qi '^Strict-Transport-Security:' || echo "        HSTS  NO"
  echo
done

echo "[4] Certificados TLS en vivo"
for h in www.geniusbet.sv geniusbet.sv; do
  echo "  $h:443"
  out=$(echo | openssl s_client -connect "$h:443" -servername "$h" -brief 2>/dev/null)
  echo "$out" | sed 's/^/        /' | head -12
  echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null \
    | sed 's/^/        /'
  echo
done

echo "------------------------------------------------------------"
echo "RESUMEN ESPERADO"
echo "  www.geniusbet.sv   HTTPS vigente (CDN77, TLS 1.3) ~ hasta 15 oct 2026"
echo "  geniusbet.sv       cert VENCIDO desde 18 ago 2026 (origen)"
echo "  http://www         200 sin redirigir a HTTPS  +  sin HSTS"
echo "  http://geniusbet   301 hacia https://www"
echo "------------------------------------------------------------"
echo DONE
