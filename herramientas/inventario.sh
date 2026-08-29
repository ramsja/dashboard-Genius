#!/bin/bash
# Listar procesos del laboratorio, herramientas y procesos del SO.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
echo "============================================================"
echo "  KALI LINUX LAB — PROCESOS"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo
if [ -f "$LAB/PROCESOS.txt" ]; then
  cat "$LAB/PROCESOS.txt"
else
  echo "Falta PROCESOS.txt"
fi
echo
echo "------------------------------------------------------------"
echo ">>> Herramientas instaladas"
echo "------------------------------------------------------------"
for t in nmap hydra john hashcat whois dig traceroute tshark tcpdump \
         strings binwalk whatweb nikto gobuster ffuf sqlmap jq python3 \
         curl openssl yara exiftool lynis fls foremost; do
  printf "  %-14s " "$t"
  if command -v "$t" >/dev/null 2>&1; then
    echo "OK  $(command -v "$t")"
  else
    echo "FALTA"
  fi
done
echo
echo "------------------------------------------------------------"
echo ">>> Procesos en ejecucion (WSL, top memoria)"
echo "------------------------------------------------------------"
ps aux --sort=-%mem | awk 'NR==1 || NR<=16 {printf "  %s\n", $0}'
echo
echo "------------------------------------------------------------"
echo ">>> Identidad / recursos"
echo "------------------------------------------------------------"
echo "  user     $(whoami)@$(hostname)"
head -3 /etc/os-release | sed 's/^/  /'
free -h | awk 'NR<=2 {print "  "$0}'
df -h / | awk 'NR==1 || NR==2 {print "  "$0}'
echo
echo "  evidencias: $LAB/evidencias"
echo "  reportes  : $LAB/reportes"
echo "============================================================"
echo "  FIN INVENTARIO DE PROCESOS"
echo "============================================================"
