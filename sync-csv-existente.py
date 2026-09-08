"""Sincroniza un CSV ya descargado con Supabase sin volver a descargarlo."""
from __future__ import annotations

import sys
from pathlib import Path

from extraccionDatos import sync_to_supabase


def main() -> None:
    import sys
    sys.stdout.reconfigure(line_buffering=True)
    
    if len(sys.argv) < 2:
        print("Uso: python sync-csv-existente.py <ruta-al-csv>")
        sys.exit(1)

    path = Path(sys.argv[1]).resolve()
    if not path.exists():
        print(f"No existe el archivo: {path}")
        sys.exit(1)

    print(f"Sincronizando archivo existente: {path}")
    print(f"Tamaño: {path.stat().st_size:,} bytes")
    
    try:
        result = sync_to_supabase(path)
        print(f"Sync completado: {result}")
    except Exception as e:
        print(f"ERROR en sync: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
