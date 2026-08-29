#!/bin/bash
# P10 Informe forense: caso + hash + copia + P2 + P3 + timeline + YARA
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
ORIG="${1:-/mnt/c/Users/Riesgos/kali-lab/evidencias}"
exec python3 -u "$DIR/forense_caso.py" informe "$ORIG"
