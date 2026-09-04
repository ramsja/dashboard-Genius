#!/bin/bash
# Canal persistente: Grok <-> lab. Lee conexion/orden.txt y aplica directivas.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
CX="$LAB/conexion"
PIDF="$CX/daemon.pid"
DIR="$LAB/herramientas"
mkdir -p "$CX/done"
echo $$ > "$PIDF"
export PYTHONUNBUFFERED=1

heartbeat() {
  if [ -f "$CX/ESTADO.txt" ]; then
    grep -v '^HEARTBEAT=' "$CX/ESTADO.txt" > "$CX/ESTADO.tmp" 2>/dev/null || true
    echo "HEARTBEAT=$(date '+%Y-%m-%d %H:%M:%S')" >> "$CX/ESTADO.tmp"
    echo "DAEMON_PID=$$" >> "$CX/ESTADO.tmp"
    mv "$CX/ESTADO.tmp" "$CX/ESTADO.txt"
  fi
}

python3 -u "$DIR/grok_director.py" CONECTAR >/dev/null 2>&1 || true

while true; do
  heartbeat
  if [ -s "$CX/orden.txt" ]; then
    bash "$LAB/lab-run.sh" "Orden Grok" "python3 -u $DIR/grok_director.py ORDEN"
  fi
  sleep 3
done
