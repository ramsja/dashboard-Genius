#!/bin/bash
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export SYSTEMD_OFFLINE=1
APT_OPTS='-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold'

if mountpoint -q /tmp/.X11-unix 2>/dev/null; then
  umount /tmp/.X11-unix || umount -l /tmp/.X11-unix || true
fi
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix || true

install_group() {
  local label="$1"
  shift
  echo "===== $(date) $label ====="
  apt-get $APT_OPTS "$@" || echo "WARN: $label had errors (continuing)"
}

echo "===== $(date) apt-get update ====="
apt-get update

install_group "core CLI tools" install --no-install-recommends \
  git curl wget jq python3 python3-pip python3-venv \
  nmap ncat ndiff \
  nikto whatweb gobuster ffuf \
  sqlmap hashcat john hydra \
  wireshark-common tshark tcpdump \
  traceroute whois dnsutils \
  sleuthkit testdisk foremost binwalk \
  yara libimage-exiftool-perl lynis \
  unzip p7zip-full file less net-tools iproute2 procps \
  ca-certificates gnupg

install_group "kali-linux-headless" install --no-install-recommends kali-linux-headless
install_group "kali-tools-forensics" install --no-install-recommends kali-tools-forensics

echo "===== $(date) volatility3 via pip (optional) ====="
python3 -m pip install --break-system-packages volatility3 2>/dev/null \
  || pip3 install --break-system-packages volatility3 2>/dev/null \
  || echo "WARN: volatility3 pip install skipped"

echo "===== $(date) TOOLS_OK ====="
echo "=== OS ==="
head -8 /etc/os-release
echo "=== tools ==="
for t in nmap git curl wget python3 pip3 tshark john hashcat hydra sqlmap gobuster ffuf nikto whatweb binwalk testdisk traceroute whois tcpdump vol; do
  printf "%-12s " "$t"
  command -v "$t" || echo MISSING
done
echo "=== disk ==="
df -h /
echo DONE
