#!/bin/bash
# Normaliza scripts, instala extra y ejecuta P0-P3 visibles en la consola.
set -u
LAB=/mnt/c/Users/Riesgos/kali-lab
cd "$LAB"

python3 - <<'PY'
from pathlib import Path
root = Path("/mnt/c/Users/Riesgos/kali-lab")
for p in list(root.rglob("*.sh")) + list(root.rglob("*.py")):
    try:
        data = p.read_bytes()
    except Exception:
        continue
    if b"\r\n" in data or b"\r" in data:
        p.write_bytes(data.replace(b"\r\n", b"\n").replace(b"\r", b"\n"))
        print("lf", p)
PY
chmod +x "$LAB"/*.sh "$LAB"/herramientas/*.sh "$LAB"/herramientas/*.py 2>/dev/null || true

bash "$LAB/lab-run.sh" "Instalar hydra traceroute tcpdump" "bash $LAB/herramientas/install-extra.sh"
bash "$LAB/lab-run.sh" "Listar procesos" "bash $LAB/herramientas/inventario.sh"
bash "$LAB/lab-run.sh" "Localizar IP 1.1.1.1" "bash $LAB/herramientas/localizar-ip.sh 1.1.1.1"
bash "$LAB/lab-run.sh" "Localizar IP 8.8.8.8" "bash $LAB/herramientas/localizar-ip.sh 8.8.8.8"
bash "$LAB/lab-run.sh" "Detectar fuerza bruta" "bash $LAB/herramientas/detectar-fuerza-bruta.sh $LAB/evidencias"
bash "$LAB/lab-run.sh" "Extraer datos" "bash $LAB/herramientas/extraer-datos.sh $LAB/evidencias"

echo BOOTSTRAP_DONE
