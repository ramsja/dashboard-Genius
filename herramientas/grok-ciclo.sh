#!/bin/bash
# Grok dirige el ciclo inicial segun 00-SCOPE.txt
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/grok_director.py" CICLO
