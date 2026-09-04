#!/bin/bash
# Handshake: Grok se conecta al lab y carga las directivas.
set -u
export PYTHONUNBUFFERED=1
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 -u "$DIR/grok_director.py" CONECTAR
