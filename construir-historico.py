"""Construye el historial diario del dashboard a partir de los CSV descargados.

Lee uno o más CSV del back office (o la carpeta descargas/ si no se indican
archivos), agrupa las transacciones por día según la columna "Crear hora" y
actualiza dashboard/data/historico.json acumulando día a día:

- transacciones totales y por disciplina
- transacciones por conexión (online / retail)
- clientes ÚNICOS por día (total, con actividad online y solo retail)
- importes (ingresos, total, comisión) por disciplina
- estados de cliente únicos por día (activo, inactivo, desconectado, suspendido, otros)

También genera reportes/resumen-diario.json con las métricas de juegos de casino
normalizados por día, que alimenta el ranking combinado de top-juegos.

Si un día ya existía en el historial se reemplaza con los datos del CSV más
reciente, así que el script es idempotente y se puede relanzar sin duplicar.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from extraccionDatos import (
    classify_client_status,
    classify_connection,
    classify_discipline,
    detect_delimiter,
    get_row_value,
    parse_float,
)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV_DIR = BASE_DIR / "descargas"
REPORTS_DIR = BASE_DIR / "reportes"
HISTORICO_PATH = BASE_DIR / "dashboard" / "data" / "historico.json"
RESUMEN_DIARIO_PATH = REPORTS_DIR / "resumen-diario.json"

DISCIPLINES = ("casino", "deportes", "otros")
CONNECTIONS = ("online", "retail", "desconocido")
CLIENT_STATUS = ("activo", "inactivo", "desconectado", "suspendido", "otros")
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
    return get_row_value(
        row, "ID de usuario", "user_id", "Usuario", "username"
    )


def normalize_game_title(text: str) -> str:
    """Limpia sufijos de apuesta/ganancia del título de un juego de casino."""
    title = text.strip()
    title = re.sub(
        r"\s+(Bet|Win|Rollback|Apuesta|Ganancia|Reembolso)\s*$",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return title.strip() or "Desconocido"


def normalize_provider(text: str) -> str:
    """Extrae el proveedor desde la columna causal, quitando variantes Bet/Win."""
    provider = text.strip()
    provider = re.sub(
        r"\s+(Bet|Win|Rollback|Apuesta|Ganancia|Reembolso)\s*(\([^)]*\))?\s*$",
        "",
        provider,
        flags=re.IGNORECASE,
    )
    return provider.strip() or "Desconocido"


def empty_day() -> dict[str, Any]:
    return {
        "transacciones": 0,
        "disciplina": {key: 0 for key in DISCIPLINES},
        "conexion": {key: 0 for key in CONNECTIONS},
        "clientes": {"total": 0, "online": 0, "retail": 0},
        "estados_cliente": {key: 0 for key in CLIENT_STATUS},
        "money": {
            key: {"income": 0.0, "total": 0.0, "commission": 0.0}
            for key in DISCIPLINES
        },
    }


def empty_resumen() -> dict[str, Any]:
    return {"version": 1, "actualizado": "", "dias": {}}


def csv_reader(filepath: Path, delimiter: str):
    import csv

    return csv.DictReader(
        filepath.open("r", encoding="utf-8-sig", newline="", errors="replace"),
        delimiter=delimiter,
    )


def process_csv(filepath: Path) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Lee un CSV y devuelve ({fecha: resumen}, {fecha: [juegos]})."""
    delimiter = detect_delimiter(filepath)

    days: dict[str, dict[str, Any]] = {}
    clients: dict[str, set[str]] = defaultdict(set)
    client_kinds: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    user_statuses: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    games: dict[str, dict[tuple[str, str], dict[str, Any]]] = defaultdict(dict)

    with filepath.open(
        "r", encoding="utf-8-sig", newline="", errors="replace"
    ) as source:
        reader = csv_reader(filepath, delimiter)

        for row in reader:
            day = day_of_row(row)
            if not day:
                continue

            summary = days.setdefault(day, empty_day())
            discipline = classify_discipline(row)
            connection = classify_connection(row)
            client_status = classify_client_status(row)

            summary["transacciones"] += 1
            summary["disciplina"][discipline] = (
                summary["disciplina"].get(discipline, 0) + 1
            )
            summary["conexion"][connection] = (
                summary["conexion"].get(connection, 0) + 1
            )

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
                user_statuses[day][user_key].add(client_status)

            if discipline == "casino":
                title = normalize_game_title(
                    get_row_value(row, "Descripción", "description", "descripcion")
                )
                provider = normalize_provider(
                    get_row_value(row, "causal", "Causal", "producto causal")
                )
                wager = abs(parse_float(get_row_value(row, "Total", "total")))
                key = (title, provider)
                game = games[day].setdefault(
                    key,
                    {
                        "titulo": title,
                        "proveedor": provider,
                        "categoria": "casino",
                        "jugadas": 0,
                        "apuesta": 0.0,
                    },
                )
                game["jugadas"] += 1
                game["apuesta"] += wager

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

        status_counts = {key: 0 for key in CLIENT_STATUS}
        for status_set in user_statuses[day].values():
            canonical = "otros"
            for status in CLIENT_STATUS:
                if status in status_set:
                    canonical = status
                    break
            status_counts[canonical] += 1
        summary["estados_cliente"] = status_counts

        summary["money"] = {
            discipline: {field: round(values[field], 2) for field in values}
            for discipline, values in summary["money"].items()
        }

    game_days = {
        day: sorted(
            games[day].values(), key=lambda g: (-g["jugadas"], -g["apuesta"])
        )
        for day in days.keys()
    }

    return days, game_days


def load_existing() -> dict[str, Any]:
    if HISTORICO_PATH.exists():
        try:
            data = json.loads(HISTORICO_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("dias"), dict):
                return data
        except (ValueError, OSError):
            pass
    return {"version": 1, "actualizado": "", "dias": {}}


def load_resumen() -> dict[str, Any]:
    if RESUMEN_DIARIO_PATH.exists():
        try:
            data = json.loads(RESUMEN_DIARIO_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("dias"), dict):
                return data
        except (ValueError, OSError):
            pass
    return empty_resumen()


def merge(
    historico: dict[str, Any], days: dict[str, dict[str, Any]], source: Path
) -> int:
    historico.setdefault("dias", {}).update(days)
    historico["dias"] = dict(sorted(historico["dias"].items()))
    historico["actualizado"] = datetime.now().isoformat(timespec="seconds")
    historico["fuentes"] = sorted(
        set(historico.get("fuentes", [])) | {source.name}
    )
    return len(days)


def merge_resumen(
    resumen: dict[str, Any],
    game_days: dict[str, list[dict[str, Any]]],
    source: Path,
) -> int:
    resumen.setdefault("dias", {})

    for day, game_list in game_days.items():
        day_data = resumen["dias"].setdefault(day, {})
        by_key: dict[tuple[str, str], dict[str, Any]] = {
            (g["titulo"], g["proveedor"]): dict(g)
            for g in day_data.get("juegos", [])
        }

        for game in game_list:
            key = (game["titulo"], game["proveedor"])
            if key not in by_key:
                by_key[key] = {
                "titulo": game["titulo"],
                "proveedor": game["proveedor"],
                "categoria": game["categoria"],
                "jugadas": game["jugadas"],
                "apuesta": game["apuesta"],
                }
            else:
                by_key[key]["jugadas"] += game["jugadas"]
                by_key[key]["apuesta"] += game["apuesta"]

        sorted_games = sorted(
            by_key.values(), key=lambda g: (-g["jugadas"], -g["apuesta"])
        )
        for game in sorted_games:
            game["apuesta"] = round(game["apuesta"], 2)

        day_data["juegos"] = sorted_games

    resumen["dias"] = dict(sorted(resumen["dias"].items()))
    resumen["actualizado"] = datetime.now().isoformat(timespec="seconds")
    resumen["fuentes"] = sorted(
        set(resumen.get("fuentes", [])) | {source.name}
    )
    return sum(len(v) for v in game_days.values())


def main() -> int:
    files = find_csv_files(sys.argv[1:])
    if not files:
        print(
            "No hay CSV que procesar. Pasa archivos o carpetas como argumento "
            f"o descarga primero con extraccionDatos.py (se busca en {DEFAULT_CSV_DIR})."
        )
        return 1

    historico = load_existing()
    resumen = load_resumen()
    total_days = 0
    total_game_entries = 0

    for filepath in files:
        size_mb = filepath.stat().st_size / (1024 * 1024)
        print(f"Procesando {filepath.name} ({size_mb:.1f} MB)…")
        days, game_days = process_csv(filepath)
        merged = merge(historico, days, filepath)
        total_days = max(total_days, merged)
        total_game_entries += merge_resumen(resumen, game_days, filepath)
        print(f"  {len(days)} día(s): {', '.join(sorted(days)) or 'sin filas con fecha'}")

    HISTORICO_PATH.parent.mkdir(parents=True, exist_ok=True)
    HISTORICO_PATH.write_text(
        json.dumps(historico, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    RESUMEN_DIARIO_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESUMEN_DIARIO_PATH.write_text(
        json.dumps(resumen, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    dias = historico["dias"]
    print()
    print(f"Historial actualizado: {HISTORICO_PATH}")
    print(f"Días registrados: {len(dias)} ({min(dias)} -> {max(dias)})" if dias else "Historial vacío.")
    print(f"Transacciones acumuladas: {sum(d['transacciones'] for d in dias.values()):,}")
    print(f"Juegos de casino registrados: {total_game_entries:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
