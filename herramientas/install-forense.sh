#!/bin/bash
# Paquetes ligeros de forense/ciber (8 GB RAM: sin Autopsy GUI ni SIEM).
set -u
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
APT_OPTS='-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold'
echo "============================================================"
echo "  INSTALAR FORENSE LIGERO  yara + exiftool + lynis"
echo "============================================================"
apt-get update
apt-get $APT_OPTS install --no-install-recommends \
  yara libimage-exiftool-perl lynis sleuthkit foremost binwalk \
  tshark unzip p7zip-full file || true
echo
echo "=== resultado ==="
for t in yara exiftool lynis fls foremost tshark; do
  printf "  %-12s " "$t"
  command -v "$t" || echo MISSING
done
echo DONE
