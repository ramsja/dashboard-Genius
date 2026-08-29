#!/bin/bash
set -u
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export SYSTEMD_OFFLINE=1
echo "============================================================"
echo "  Reparar dpkg e instalar hydra traceroute tcpdump"
echo "============================================================"
echo ">>> dpkg --configure -a"
dpkg --configure -a || true
echo ">>> apt-get update"
apt-get update
echo ">>> apt-get install hydra traceroute tcpdump"
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
  install --no-install-recommends hydra traceroute tcpdump || true
echo
echo "=== resultado ==="
for t in hydra traceroute tcpdump; do
  printf "  %-14s " "$t"
  command -v "$t" || echo MISSING
done
echo DONE
