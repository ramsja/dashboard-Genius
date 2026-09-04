"""Construye el historial diario del dashboard a partir de los CSV descargados.

Lee uno o más CSV del back office (o la carpeta descargas/ si no se indican
archivos), agrupa las transacciones por día según la columna "Crear hora" y
actualiza dashboard/data/historico.json acumulando día a día:

- transacciones totales y por disciplina
- transacciones por conexión (online / retail)
- clientes ÚNICOS por día (total, con actividad online y solo retail)
- importes (ingresos, total, comisión) por disciplina

Si un día ya existía en el historial se reemplaza con los datos del CSV más
reciente, así que el script es idempotente y se puede relanzar sin duplicar.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from extraccionDatos import (
    classify_connection,
    classify_discipline,
    detect_delimiter,
    get_row_value,
    parse_float,
)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV_DIR = BASE_DIR / "descargas"
HISTORICO_PATH = BASE_DIR / "dashboard" / "data" / "historico.json"

DISCIPLINES = ("casino", "deportes", "otros")
CONNECTIONS = ("online", "retail", "desconocido")
MONEY_FIELDS = (
    ("income", ("Ingresos", "income", "ingresos")),
    ("total", ("Total", "total")),
    ("commission", ("Comisión", "commission", "comision")),
)


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


def user_key_of_row(row: dict[str, Any]) -> str:
    """Identifica al cliente de forma estable: ID de usuario o Usuario."""
    return (
        get_row_value(row, "ID de usuario", "user_id", "Usuario", "username")
    )


def empty_day() -> dict[str, Any]:
    return {
        "transacciones": 0,
        "disciplina": {key: 0 for key in DISCIPLINES},
        "conexion": {key: 0 for key in CONNECTIONS},
        "clientes": {"total": 0, "online": 0, "retail": 0},
        "money": {
            key: {"income": 0.0, "total": 0.0, "commission": 0.0}
            for key in DISCIPLINES
        },
    }


def process_csv(filepath: Path) -> dict[str, dict[str, Any]]:
    """Lee un CSV y devuelve {fecha: resumen} con clientes únicos por día."""
    delimiter = detect_delimiter(filepath)

    days: dict[str, dict[str, Any]] = {}
    clients: dict[str, set[str]] = defaultdict(set)
    client_kinds: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    with filepath.open("r", encoding="utf-8-sig", newline="", errors="replace") as source:
        reader = csv_reader(filepath, delimiter)

        for row in reader:
            day = day_of_row(row)
            if not day:
                continue

            summary = days.setdefault(day, empty_day())
            discipline = classify_discipline(row)
            connection = classify_connection(row)

            summary["transacciones"] += 1
            summary["disciplina"][discipline] = summary["disciplina"].get(discipline, 0) + 1
            summary["conexion"][connection] = summary["conexion"].get(connection, 0) + 1

            money = summary["money"].setdefault(
                discipline, {"income": 0.0, "total": 0.0, "commission": 0.0}
            )
            for field, columns in MONEY_FIELDS:
                money[field] += parse_float(get_row_value(row, *columns))

            user_key = user_key_of_row(row)
            if user_key:
                clients[day].add(user_key)
                if connection in ("online", "retail"):
                    client_kinds[day][user_key].add(connection)

    for day, summary in days.items():
        online_users = {
            user
            for user, kinds in client_kinds[day].items()
            if "online" in kinds
        }
        retail_users = {
            user
            for user, kinds in client_kinds[day].items()
            if "retail" in kinds
        }
        summary["clientes"] = {
            "total": len(clients[day]),
            "online": len(online_users),
            "retail": len(retail_users),
        }
        summary["money"] = {
            discipline: {field: round(values[field], 2) for field in values}
            for discipline, values in summary["money"].items()
        }

    return days


def csv_reader(filepath: Path, delimiter: str):
    import csv

    return csv.DictReader(filepath.open("r", encoding="utf-8-sig", newline="", errors="replace"), delimiter=delimiter)


def load_existing() -> dict[str, Any]:
    if HISTORICO_PATH.exists():
        try:
            data = json.loads(HISTORICO_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("dias"), dict):
                return data
        except (ValueError, OSError):
            pass
    return {"version": 1, "actualizado": "", "dias": {}}


def merge(historico: dict[str, Any], days: dict[str, dict[str, Any]], source: Path) -> int:
    historico.setdefault("dias", {}).update(days)
    historico["dias"] = dict(sorted(historico["dias"].items()))
    historico["actualizado"] = datetime.now().isoformat(timespec="seconds")
    historico["fuentes"] = sorted(
        set(historico.get("fuentes", [])) | {source.name}
    )
    return len(days)


def main() -> int:
    files = find_csv_files(sys.argv[1:])
    if not files:
        print(
            "No hay CSV que procesar. Pasa archivos o carpetas como argumento "
            f"o descarga primero con extraccionDatos.py (se busca en {DEFAULT_CSV_DIR})."
        )
        return 1

    historico = load_existing()
    total_days = 0
    for filepath in files:
        size_mb = filepath.stat().st_size / (1024 * 1024)
        print(f"Procesando {filepath.name} ({size_mb:.1f} MB)…")
        days = process_csv(filepath)
        merged = merge(historico, days, filepath)
        total_days = max(total_days, merged)
        print(f"  {len(days)} día(s): {', '.join(sorted(days)) or 'sin filas con fecha'}")

    HISTORICO_PATH.parent.mkdir(parents=True, exist_ok=True)
    HISTORICO_PATH.write_text(
        json.dumps(historico, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    dias = historico["dias"]
    print()
    print(f"Historial actualizado: {HISTORICO_PATH}")
    print(f"Días registrados: {len(dias)} ({min(dias)} → {max(dias)})" if dias else "Historial vacío.")
    print(f"Transacciones acumuladas: {sum(d['transacciones'] for d in dias.values()):,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
