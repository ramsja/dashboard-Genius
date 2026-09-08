"""Sincroniza todos los CSVs existentes con Supabase."""
import sys
import os
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)

from extraccionDatos import sync_to_supabase

def main():
    descargas_dir = Path("descargas")
    csv_files = sorted(descargas_dir.glob("transacciones_producto__*.csv"))
    
    print(f"Encontrados {len(csv_files)} archivos CSV")
    print("=" * 80)
    
    total_synced = 0
    failed = []
    
    for i, csv_file in enumerate(csv_files, 1):
        print(f"\n[{i}/{len(csv_files)}] {csv_file.name}")
        print(f"  Tamaño: {csv_file.stat().st_size:,} bytes")
        
        try:
            result = sync_to_supabase(csv_file)
            if result:
                print(f"  ✓ Sincronizado: {result}")
                total_synced += 1
            else:
                print(f"  ⚠ Sin resultado")
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            failed.append(csv_file.name)
    
    print("\n" + "=" * 80)
    print(f"RESUMEN: {total_synced}/{len(csv_files)} archivos sincronizados")
    if failed:
        print(f"FALLIDOS: {', '.join(failed)}")
    print("=" * 80)

if __name__ == "__main__":
    main()
