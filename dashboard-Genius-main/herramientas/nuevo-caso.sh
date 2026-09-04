#!/bin/bash
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
ORIG="${1:-/mnt/c/Users/Riesgos/kali-lab/evidencias}"
exec python3 -u "$DIR/forense_caso.py" caso "$ORIG"
