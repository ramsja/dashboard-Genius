"""Construye la dimensión histórica de usuarios a partir de los CSV descargados.

Genera dashboard/data/usuarios-historico.json con:
- Perfil por usuario (ID, nombre, tipo, canal, estado actual).
- Métricas acumuladas (transacciones, días activos, apuesta total, ganancia neta).
- Detalle por día (transacciones, apuesta, ganancia).

El script es idempotente: recalcula todo desde cero en cada ejecución.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from extraccionDatos import (
    classify_client_status,
    classify_connection,
    detect_delimiter,
    get_row_value,
    parse_float,
)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV_DIR = BASE_DIR / "descargas"
OUTPUT_PATH = BASE_DIR / "dashboard" / "data" / "usuarios-historico.json"


def find_csv_files(args: list[str]) -> list[Path]:
    """Resuelve los CSV a procesar: argumentos, o todos los de descargas/."""
    if args:
        files: list[Path] = []
        for arg in args:
            path = Path(arg)
            if path.is_dir():
                files.extend(sorted(path.glob("*.csv")))
            elif path.suffix.lower() == ".csv" and path.exists():
                files.append(path)
            else:
                print(f"Aviso: se ignora {arg} (no es un CSV existente).")
        return files
    if DEFAULT_CSV_DIR.is_dir():
        return sorted(DEFAULT_CSV_DIR.glob("*.csv"))
    return []


def day_of_row(row: dict[str, Any]) -> str:
    """Extrae la fecha (YYYY-MM-DD) desde 'Crear hora' o columnas similares."""
    value = get_row_value(
        row,
        "Crear hora",
        "Fecha",
        "Fecha de creación",
        "created_at",
        "fecha",
    )
    return value[:10] if len(value) >= 10 else ""


def csv_reader(filepath: Path, delimiter: str):
    import csv

    return csv.DictReader(
        filepath.open("r", encoding="utf-8-sig", newline="", errors="replace"),
        delimiter=delimiter,
    )


def process_csv(filepath: Path) -> dict[str, dict[str, Any]]:
    """Lee un CSV y devuelve {user_id: perfil_acumulado}."""
    delimiter = detect_delimiter(filepath)
    users: dict[str, dict[str, Any]] = {}

    with filepath.open(
        "r", encoding="utf-8-sig", newline="", errors="replace"
    ) as source:
        reader = csv_reader(filepath, delimiter)

        for row in reader:
            day = day_of_row(row)
            if not day:
                continue

            user_id = get_row_value(
                row, "ID de usuario", "user_id", "Usuario", "username"
            )
            username = get_row_value(row, "Usuario", "username", "ID de usuario")
            if not user_id:
                continue

            profile = users.setdefault(
                user_id,
                {
                    "usuario": username or user_id,
                    "tipo": "",
                    "canal": "desconocido",
                    "estado_actual": "otros",
                    "primer_dia": day,
                    "ultimo_dia": day,
                    "dias_activos": 0,
                    "transacciones": 0,
                    "apuesta_total": 0.0,
                    "ganancia_neta": 0.0,
                    "por_dia": {},
                },
            )

            profile["tipo"] = get_row_value(
                row, "Tipo", "tipo", "Tipo de transacción"
            )
            profile["canal"] = classify_connection(row)
            profile["estado_actual"] = classify_client_status(row)

            if day < profile["primer_dia"]:
                profile["primer_dia"] = day
            if day > profile["ultimo_dia"]:
                profile["ultimo_dia"] = day

            total = parse_float(get_row_value(row, "Total", "total"))
            wager = abs(total)

            day_data = profile["por_dia"].setdefault(
                day,
                {
                    "transacciones": 0,
                    "apuesta": 0.0,
                    "ganancia": 0.0,
                },
            )
            day_data["transacciones"] += 1
            day_data["apuesta"] += wager
            day_data["ganancia"] += total

            profile["transacciones"] += 1
            profile["apuesta_total"] += wager
            profile["ganancia_neta"] += total

    # Calcula días activos y redondea valores decimales.
    for profile in users.values():
        profile["dias_activos"] = len(profile["por_dia"])
        profile["apuesta_total"] = round(profile["apuesta_total"], 2)
        profile["ganancia_neta"] = round(profile["ganancia_neta"], 2)
        for day_data in profile["por_dia"].values():
            day_data["apuesta"] = round(day_data["apuesta"], 2)
            day_data["ganancia"] = round(day_data["ganancia"], 2)

    return users


def merge_user_profiles(
    profiles: dict[str, dict[str, Any]],
    file_profiles: dict[str, dict[str, Any]],
) -> None:
    """Combina perfiles de usuario provenientes de diferentes archivos."""
    for user_id, file_profile in file_profiles.items():
        if user_id not in profiles:
            profiles[user_id] = file_profile
            continue

        existing = profiles[user_id]
        existing["transacciones"] += file_profile["transacciones"]
        existing["apuesta_total"] += file_profile["apuesta_total"]
        existing["ganancia_neta"] += file_profile["ganancia_neta"]
        existing["dias_activos"] = len(
            set(existing["por_dia"]) | set(file_profile["por_dia"])
        )

        if file_profile["primer_dia"] < existing["primer_dia"]:
            existing["primer_dia"] = file_profile["primer_dia"]
        if file_profile["ultimo_dia"] > existing["ultimo_dia"]:
            existing["ultimo_dia"] = file_profile["ultimo_dia"]

        for day, data in file_profile["por_dia"].items():
            if day not in existing["por_dia"]:
                existing["por_dia"][day] = dict(data)
            else:
                existing["por_dia"][day]["transacciones"] += data["transacciones"]
                existing["por_dia"][day]["apuesta"] += data["apuesta"]
                existing["por_dia"][day]["ganancia"] += data["ganancia"]

        # Canal y estado actuales se toman del perfil con actividad más reciente.
        if file_profile["ultimo_dia"] >= existing["ultimo_dia"]:
            existing["tipo"] = file_profile["tipo"]
            existing["canal"] = file_profile["canal"]
            existing["estado_actual"] = file_profile["estado_actual"]

    # Redondea después de combinar.
    for profile in profiles.values():
        profile["apuesta_total"] = round(profile["apuesta_total"], 2)
        profile["ganancia_neta"] = round(profile["ganancia_neta"], 2)
        for day_data in profile["por_dia"].values():
            day_data["apuesta"] = round(day_data["apuesta"], 2)
            day_data["ganancia"] = round(day_data["ganancia"], 2)


def build_output(profiles: dict[str, dict[str, Any]]) -> dict[str, Any]:
    all_days = sorted(
        {day for profile in profiles.values() for day in profile["por_dia"]}
    )
    return {
        "version": "1.0",
        "actualizado": datetime.now().isoformat(timespec="seconds"),
        "dias_disponibles": all_days,
        "total_usuarios": len(profiles),
        "usuarios": profiles,
    }


def main() -> int:
    files = find_csv_files(sys.argv[1:])
    if not files:
        print(
            "No hay CSV que procesar. Pasa archivos o carpetas como argumento "
            f"o descarga primero con extraccionDatos.py (se busca en {DEFAULT_CSV_DIR})."
        )
        return 1

    profiles: dict[str, dict[str, Any]] = {}
    for filepath in files:
        size_mb = filepath.stat().st_size / (1024 * 1024)
        print(f"Procesando {filepath.name} ({size_mb:.1f} MB)...")
        file_profiles = process_csv(filepath)
        merge_user_profiles(profiles, file_profiles)
        print(f"  {len(file_profiles)} usuario(s) nuevos en este archivo.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(build_output(profiles), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print()
    print(f"Usuarios historicos actualizados: {OUTPUT_PATH}")
    print(f"Usuarios unicos: {len(profiles):,}")
    if profiles:
        dias = sorted(
            {day for p in profiles.values() for day in p["por_dia"]}
        )
        print(f"Rango de dias: {dias[0]} -> {dias[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
