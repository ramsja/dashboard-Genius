#!/bin/bash
# P13 Red neuronal de sensibilidad a vulnerabilidades (local, sin atacar).
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/red_vulnerabilidad.py"
