#!/bin/bash
# P4 Demo de fuerza bruta SOLO contra 127.0.0.1 (login de laboratorio).
# Rechaza cualquier otro destino.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=18080
TARGET=127.0.0.1
WORDLIST="$LAB/evidencias/wordlist-lab.txt"
LOG="$LAB/evidencias/demo-login.log"

echo "============================================================"
echo "  DEMO FUERZA BRUTA LOCAL"
echo "  Destino fijo: ${TARGET}:${PORT}  (127.0.0.1)"
echo "  Si pides otro host, este script se niega."
echo "============================================================"

if [ "${1:-}" != "" ] && [ "${1:-}" != "127.0.0.1" ] && [ "${1:-}" != "localhost" ]; then
  echo "RECHAZADO: este demo no corre contra $1"
  echo "Solo 127.0.0.1. Para terceros hace falta autorizacion escrita."
  exit 2
fi

if ! command -v hydra >/dev/null 2>&1; then
  echo
  echo ">>> Instalando hydra (Kali)..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -o Dpkg::Options::=--force-confdef hydra || {
    echo "No se pudo instalar hydra"
    exit 1
  }
fi

: > "$LOG"
python3 -u "$DIR/demo-login.py" &
PID=$!
sleep 0.7
if ! kill -0 "$PID" 2>/dev/null; then
  echo "No arranco el login local"
  exit 1
fi

echo
echo "------------------------------------------------------------"
echo ">>> hydra -l labuser -P wordlist-lab.txt 127.0.0.1 http-post-form"
echo "------------------------------------------------------------"
timeout 25 hydra -l labuser -P "$WORDLIST" -s "$PORT" -t 4 -f -I \
  "$TARGET" http-post-form "/login:user=^USER^&pass=^PASS^:F=FAIL" || true

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

echo
echo "------------------------------------------------------------"
echo ">>> Log generado (luego puedes pasarlo a Detectar fuerza bruta)"
echo "------------------------------------------------------------"
sed 's/^/  /' "$LOG" | tail -20
echo
echo "  usuario correcto: labuser"
echo "  password correcto: labpass"
echo "============================================================"
echo "  FIN DEMO LOCAL"
echo "============================================================"
