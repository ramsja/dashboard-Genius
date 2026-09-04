#!/bin/bash
# P3 Extraer IPs, emails, hashes y secretos de evidencias propias.
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/extraer_datos.py" "$@"
