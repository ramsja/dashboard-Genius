"""Sincronización en tiempo real con el backoffice.

Se ejecuta continuamente, consultando el backoffice cada INTERVALO segundos
y enviando las transacciones nuevas a Supabase. También regenera los JSONs
del dashboard para que se actualicen en el navegador.
"""
from __future__ import annotations

import os
import sys
import time
import subprocess
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# Reutilizamos la lógica de extracción existente
from extraccionDatos import (
    get_credentials,
    login,
    get_transactions_token,
    download_csv,
    save_csv,
    sync_to_supabase,
    count_csv_rows,
    generate_reports,
)


INTERVALO = int(os.getenv("REALTIME_INTERVAL", "300").strip() or "300")  # 5 min por defecto
BASE_DIR = Path(__file__).resolve().parent


def regenerar_jsons() -> None:
    """Regenera los JSONs del dashboard desde los CSVs descargados."""
    scripts = [
        ["python", "construir-snapshot.py"],
        ["python", "construir-historico.py", "descargas/"],
        ["python", "construir-usuarios-historico.py", "descargas/"],
        ["python", "construir-top-juegos.py"],
        ["python", "construir-actividad-usuarios.py"],
    ]
    for cmd in scripts:
        try:
            subprocess.run(cmd, cwd=str(BASE_DIR), check=False, capture_output=True)
        except Exception as exc:
            print(f"  [WARN] Error regenerando JSONs con {cmd}: {exc}")


def ciclo_sync() -> None:
    """Un ciclo de sincronización: descarga hoy y sincroniza con Supabase."""
    hoy = datetime.now().strftime("%Y-%m-%d")

    # Forzar fecha de hoy para la extracción
    os.environ["START_DATE"] = hoy
    os.environ["END_DATE"] = hoy

    username, password = get_credentials()

    with requests.Session() as session:
        initial_token = login(session, username, password)
        transactions_token = get_transactions_token(session, initial_token)
        csv_content = download_csv(session, transactions_token)
        filepath = save_csv(csv_content)

        print(f"  CSV descargado: {filepath.name} ({len(csv_content):,} bytes)")

        # Sincronizar con Supabase (deduplica por transaction_id si existe约束)
        sync_to_supabase(filepath)

        # Contar filas
        total_rows = count_csv_rows(filepath)
        print(f"  Filas procesadas: {total_rows:,}")

        # Regenerar JSONs del dashboard
        print("  Regenerando JSONs del dashboard...")
        regenerar_jsons()
        print("  JSONs actualizados.")


def main() -> None:
    load_dotenv()
    print(f"[{datetime.now().isoformat(timespec='seconds')}] Iniciando sync en tiempo real")
    print(f"  Intervalo: {INTERVALO}s")
    print(f"  Presiona Ctrl+C para detener.\n")

    ciclo = 0
    while True:
        ciclo += 1
        try:
            print(f"\n{'='*60}")
            print(f"[Ciclo {ciclo}] {datetime.now().isoformat(timespec='seconds')}")
            print(f"{'='*60}")
            ciclo_sync()
            print(f"\n[Ciclo {ciclo}] Completado. Próximo ciclo en {INTERVALO}s.")
        except KeyboardInterrupt:
            print("\n\nSync detenido por el usuario.")
            sys.exit(0)
        except Exception as exc:
            print(f"\n[ERROR] Ciclo {ciclo} falló: {exc}")
            import traceback
            traceback.print_exc()
            print(f"  Reintentando en {INTERVALO}s...")

        try:
            time.sleep(INTERVALO)
        except KeyboardInterrupt:
            print("\n\nSync detenido por el usuario.")
            sys.exit(0)


if __name__ == "__main__":
    main()
