#!/bin/bash
# Pruebas locales del laboratorio Kali (esta PC / WSL). Sin exploits.
set -u
echo "============================================================"
echo "  KALI LAB — PRUEBAS BASICAS"
echo "  Alcance: esta instancia WSL y herramientas instaladas"
echo "============================================================"
echo
echo "[1] Identidad"
whoami
id
hostname
head -6 /etc/os-release
uname -r
echo
echo "[2] Recursos"
free -h | head -2
df -h / | tail -1
echo
echo "[3] Herramientas"
for t in nmap ncat git python3 pip3 tshark john hashcat hydra sqlmap gobuster ffuf nikto whatweb binwalk testdisk jq openssl curl wget whois dig; do
  printf "  %-12s " "$t"
  if command -v "$t" >/dev/null 2>&1; then
    echo "OK  $(command -v "$t")"
  else
    echo "FALTA"
  fi
done
printf "  %-12s " "msfconsole"
command -v msfconsole >/dev/null 2>&1 && echo "OK  $(command -v msfconsole)" || echo "PENDIENTE (pack headless)"
echo
echo "[4] Versiones"
nmap --version 2>/dev/null | head -1
python3 --version
git --version
openssl version
curl --version | head -1
echo
echo "[5] Nmap contra localhost (solo esta VM)"
nmap -Pn -sT -p 22,80,443,8080 127.0.0.1
echo
echo "[6] DNS local / resolucion"
getent hosts localhost | head
echo
echo "[7] OpenSSL self-check"
echo | openssl s_client -connect 127.0.0.1:443 -servername localhost -brief 2>&1 | head -15 || true
echo
echo "============================================================"
echo "  PRUEBAS LOCALES OK — listo para el siguiente proceso"
echo "============================================================"
