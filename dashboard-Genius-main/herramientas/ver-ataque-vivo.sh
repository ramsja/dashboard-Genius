#!/bin/bash
# Ataque de fuerza bruta VISIBLE: login local + hydra lento/verbose.
# SOLO 127.0.0.1 — se niega cualquier otro host.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=18080
TARGET=127.0.0.1
WORDLIST="$LAB/evidencias/wordlist-lab.txt"
LOG="$LAB/evidencias/demo-login.log"
PIDF="$LAB/conexion/demo-login.pid"

echo "============================================================"
echo "  ATAQUE EN VIVO  (laboratorio)"
echo "  Objetivo: http://127.0.0.1:${PORT}/login"
echo "  NO es GeniusBet. Si pides otro host, se rechaza."
echo "============================================================"

if [ "${1:-}" != "" ] && [ "${1:-}" != "127.0.0.1" ] && [ "${1:-}" != "localhost" ]; then
  echo "RECHAZADO: $1"
  exit 2
fi

pkill -f demo-login.py 2>/dev/null || true
sleep 0.3
: > "$LOG"
python3 -u "$DIR/demo-login.py" &
PID=$!
echo "$PID" > "$PIDF"
sleep 0.8
if ! kill -0 "$PID" 2>/dev/null; then
  echo "No arranco el login"
  exit 1
fi

echo
echo "  Login abierto: http://127.0.0.1:${PORT}/"
echo "  PID servidor: $PID  (sigue vivo despues de Hydra)"
echo "  Hydra va LENTO (-t 1 -V) para que veas cada intento"
echo
echo "------------------------------------------------------------"
echo ">>> hydra -V -t 1 -l labuser -P wordlist 127.0.0.1 http-post-form"
echo "------------------------------------------------------------"
timeout 60 hydra -V -t 1 -w 1 -f -I -l labuser -P "$WORDLIST" -s "$PORT" \
  "$TARGET" http-post-form "/login:user=^USER^&pass=^PASS^:F=FAIL" || true

echo
echo "------------------------------------------------------------"
echo ">>> Ultimos intentos en el log"
echo "------------------------------------------------------------"
sed 's/^/  /' "$LOG" | tail -25
echo
echo "  El login SIGUE abierto en el navegador: http://127.0.0.1:${PORT}/"
echo "  usuario labuser / clave labpass"
echo "============================================================"
echo "  FIN HYDRA — el panel web sigue mostrando el ataque"
echo "============================================================"
