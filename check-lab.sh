#!/bin/bash
set -u
echo "=== ID ==="
whoami
id
hostname
echo "=== OS ==="
cat /etc/os-release
echo "=== DISK ==="
df -h /
echo "=== RAM ==="
free -h
echo "=== SOURCES ==="
cat /etc/apt/sources.list 2>/dev/null || true
echo "--- sources.list.d ---"
ls -la /etc/apt/sources.list.d/ 2>/dev/null || true
echo "=== NET ==="
ping -c 2 -W 3 1.1.1.1 || true
echo "=== DNS ==="
getent hosts http.kali.org archive.kali.org || true
echo "=== TOOLS ==="
for t in nmap git curl wget python3 tshark john hashcat sqlmap gobuster apt sudo; do
  printf "%-12s " "$t"
  command -v "$t" || echo MISSING
done
echo "=== APT POLICY ==="
apt-cache policy kali-linux-headless 2>/dev/null | head -20 || true
