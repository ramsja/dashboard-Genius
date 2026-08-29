#!/bin/bash
# P2 Detectar fuerza bruta en logs propios. No lanza ataques.
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/detectar_fuerza_bruta.py" "$@"
