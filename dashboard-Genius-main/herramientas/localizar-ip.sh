#!/bin/bash
# P1 Localizar IP / dominio / archivo con IPs. Solo lectura.
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/localizar_ip.py" "$@"
