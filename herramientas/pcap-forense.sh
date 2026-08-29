#!/bin/bash
# Resumen forense de un .pcap propio (tshark). Sin atacar redes ajenas.
set -u
F="${1:-}"
if [ -z "$F" ]; then
  F=$(ls -1 /mnt/c/Users/Riesgos/kali-lab/evidencias/*.{pcap,pcapng,cap} 2>/dev/null | head -1 || true)
fi
echo "============================================================"
echo "  PCAP FORENSE (solo archivo que TU poseas)"
echo "============================================================"
if [ -z "${F:-}" ] || [ ! -f "$F" ]; then
  echo "  No hay pcap en evidencias\\. Pon un dump propio y relanza."
  echo "  Uso: pcap-forense.sh /ruta/captura.pcap"
  exit 0
fi
echo "  archivo: $F"
echo "  sha256:  $(sha256sum "$F" | awk '{print $1}')"
echo
if ! command -v tshark >/dev/null; then
  echo "  falta tshark"
  exit 1
fi
echo ">>> conversaciones IP (top)"
tshark -r "$F" -q -z conv,ip 2>/dev/null | sed 's/^/  /' | head -25
echo
echo ">>> DNS"
tshark -r "$F" -T fields -e dns.qry.name 2>/dev/null | sed '/^$/d' | sort | uniq -c | sort -nr | head -20 | sed 's/^/  /'
echo
echo ">>> HTTP host + uri"
tshark -r "$F" -Y http -T fields -e ip.src -e http.host -e http.request.uri 2>/dev/null | head -30 | sed 's/^/  /'
echo DONE
