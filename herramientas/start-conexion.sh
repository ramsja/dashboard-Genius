#!/bin/bash
# Arranca el daemon Grok si no esta vivo.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
CX="$LAB/conexion"
mkdir -p "$CX/done"
PIDF="$CX/daemon.pid"
if [ -f "$PIDF" ]; then
  old=$(cat "$PIDF" 2>/dev/null || true)
  if [ -n "${old:-}" ] && kill -0 "$old" 2>/dev/null; then
    echo "daemon ya corre pid=$old"
    exit 0
  fi
fi
nohup bash "$LAB/herramientas/grok-daemon.sh" >> "$CX/daemon.log" 2>&1 &
echo "daemon nuevo pid=$!"
sleep 0.4
cat "$PIDF" 2>/dev/null || true
