#!/bin/bash
# Auditoria de CIBERSEGURIDAD de ESTA instancia (Lynis + tools). No escanea terceros.
set -u
echo "============================================================"
echo "  AUDITORIA DEL LABORATORIO (localhost)"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"
echo
echo ">>> Herramientas forenses"
for t in fls icat foremost binwalk tshark yara exiftool lynis sha256sum testdisk vol; do
  printf "  %-12s " "$t"
  command -v "$t" || echo FALTA
done
echo
if command -v lynis >/dev/null 2>&1; then
  echo ">>> Lynis (hardening de esta VM, puede tardar 1-2 min)"
  lynis audit system --quick --no-colors 2>/dev/null | awk '
    /Hardening index|Suggestion|Warning|Lynis|^\[/ {print "  "$0}
  ' | head -80
else
  echo "  lynis FALTA — se instala con install-forense.sh"
fi
echo
echo ">>> Permisos evidencias (no deben ser world-writable)"
ls -ld /mnt/c/Users/Riesgos/kali-lab/evidencias /mnt/c/Users/Riesgos/kali-lab/casos 2>/dev/null | sed 's/^/  /'
echo
echo "  Informe: usa P10 Informe forense sobre evidencias\\"
echo "============================================================"
echo "  FIN AUDITORIA LAB"
echo "============================================================"
