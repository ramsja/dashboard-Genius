#!/bin/bash
# Instala hydra, traceroute, tcpdump (para P1-P4).
set -u
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
APT_OPTS='-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold'
echo "============================================================"
echo "  INSTALAR HERRAMIENTAS EXTRA  (hydra, traceroute, tcpdump)"
echo "============================================================"
apt-get update
apt-get $APT_OPTS install --no-install-recommends hydra traceroute tcpdump whois dnsutils || true
echo
echo "=== tools ==="
for t in hydra traceroute tcpdump whois dig nmap john hashcat tshark python3; do
  printf "  %-14s " "$t"
  command -v "$t" || echo MISSING
done
echo DONE
