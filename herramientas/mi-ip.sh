#!/bin/bash
# Muestra la IP publica de esta PC y la localiza (solo lectura).
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "============================================================"
echo "  MI IP PUBLICA"
echo "============================================================"
IP=$(curl -s --max-time 8 https://ifconfig.me || curl -s --max-time 8 https://api.ipify.org || true)
echo "  IP publica: ${IP:-desconocida}"
if [ -n "${IP:-}" ]; then
  python3 -u "$DIR/localizar_ip.py" "$IP"
fi
