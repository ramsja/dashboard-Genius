#!/bin/bash
# Ejecuta un proceso del lab y lo escribe en la consola visible.
set -u
LOG=/root/kali-lab-proceso.log
WINLOG=/mnt/c/Users/Riesgos/kali-lab/proceso.log
TITLE="${1:-proceso}"
shift || true
{
  echo
  echo "################################################################"
  echo "# $(date '+%Y-%m-%d %H:%M:%S')"
  echo "# PROCESO: $TITLE"
  echo "################################################################"
  echo
  if [ "$#" -gt 0 ]; then
    bash -lc "$*"
  else
    bash -s
  fi
  echo
  echo "# --- fin: $TITLE ---"
  echo
} 2>&1 | stdbuf -oL tee -a "$LOG" | stdbuf -oL tee -a "$WINLOG" >/dev/null
# copy full linux log to windows for later reading
cp -f "$LOG" "$WINLOG" 2>/dev/null || true
