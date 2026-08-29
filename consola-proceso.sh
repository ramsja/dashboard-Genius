#!/bin/bash
# Consola visible del laboratorio: muestra el proceso en vivo.
LOG=/root/kali-lab-proceso.log
touch "$LOG"
clear
printf '\033[32m'
cat <<'EOF'
============================================================
  KALI LINUX LAB
  Esta ventana muestra el proceso en vivo.
  No la cierres: aqui se ve cada paso que se ejecuta.
============================================================

EOF
printf '\033[0m'
stdbuf -oL tail -n +1 -F "$LOG"
