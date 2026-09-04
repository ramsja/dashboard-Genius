#!/bin/bash
# Lanza un proceso del lab con titulo, visible en la consola Windows.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
TITLE="${1:-proceso}"
shift || true
exec bash "$LAB/lab-run.sh" "$TITLE" "$@"
