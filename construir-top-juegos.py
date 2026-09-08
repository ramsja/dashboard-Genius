"""Construye el ranking combinado de juegos más jugados y más apostados.

Combina:
- reportes/resumen-diario.json (casino, generado por construir-historico.py)
- dashboard/data/desglose-tickets.json (deportes, generado por extraccion-tickets-deporte.py)

Genera dashboard/data/top-juegos.json con rankings acumulados y por periodo.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
CASINO_RESUMEN_PATH = BASE_DIR / "reportes" / "resumen-diario.json"
SPORTS_TICKETS_PATH = BASE_DIR / "dashboard" / "data" / "desglose-tickets.json"
OUTPUT_PATH = BASE_DIR / "dashboard" / "data" / "top-juegos.json"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def aggregate_casino(
    casino_data: dict[str, Any],
    totals: dict[tuple[str, str, str], dict[str, Any]],
    by_period: dict[str, dict[tuple[str, str, str], dict[str, Any]]],
) -> None:
    for day, day_data in casino_data.get("dias", {}).items():
        period = day[:7]
        for game in day_data.get("juegos", []):
            title = game.get("titulo", "Desconocido")
            provider = game.get("proveedor", "Desconocido")
            category = game.get("categoria", "casino")
            key = (title, provider, category)

            for bucket in (totals, by_period.setdefault(period, {})):
                entry = bucket.setdefault(
                    key,
                    {
                        "titulo": title,
                        "proveedor": provider,
                        "categoria": category,
                        "jugadas": 0,
                        "apuesta": 0.0,
                    },
                )
                entry["jugadas"] += game.get("jugadas", 0)
                entry["apuesta"] += game.get("apuesta", 0.0)


def aggregate_sports(
    sports_data: dict[str, Any],
    totals: dict[tuple[str, str, str], dict[str, Any]],
    by_period: dict[str, dict[tuple[str, str, str], dict[str, Any]]],
) -> None:
    for period, period_data in sports_data.get("periodos", {}).items():
        for sport in period_data.get("por_deporte", []):
            title = sport.get("deporte", "Desconocido")
            key = (title, "Deportes", "deportes")

            for bucket in (totals, by_period.setdefault(period, {})):
                entry = bucket.setdefault(
                    key,
                    {
                        "titulo": title,
                        "proveedor": "Deportes",
                        "categoria": "deportes",
                        "jugadas": 0,
                        "apuesta": 0.0,
                    },
                )
                entry["jugadas"] += sport.get("tickets", 0)
                entry["apuesta"] += sport.get("importe", 0.0)


def finalize_rankings(
    bucket: dict[tuple[str, str, str], dict[str, Any]]
) -> dict[str, list[dict[str, Any]]]:
    entries = list(bucket.values())
    for entry in entries:
        entry["apuesta"] = round(entry["apuesta"], 2)

    by_plays = sorted(entries, key=lambda g: (-g["jugadas"], -g["apuesta"]))
    by_wager = sorted(entries, key=lambda g: (-g["apuesta"], -g["jugadas"]))
    return {
        "mas_jugados": by_plays,
        "mas_apostados": by_wager,
    }


def build_output(
    totals: dict[tuple[str, str, str], dict[str, Any]],
    by_period: dict[str, dict[tuple[str, str, str], dict[str, Any]]],
) -> dict[str, Any]:
    periods_sorted = sorted(by_period.keys())
    return {
        "version": "1.0",
        "actualizado": datetime.now().isoformat(timespec="seconds"),
        "periodos_disponibles": periods_sorted,
        "acumulado": finalize_rankings(totals),
        "por_periodo": {
            period: finalize_rankings(bucket)
            for period, bucket in sorted(by_period.items())
        },
    }


def main() -> int:
    casino_data = load_json(CASINO_RESUMEN_PATH)
    sports_data = load_json(SPORTS_TICKETS_PATH)

    totals: dict[tuple[str, str, str], dict[str, Any]] = {}
    by_period: dict[str, dict[tuple[str, str, str], dict[str, Any]]] = defaultdict(dict)

    aggregate_casino(casino_data, totals, by_period)
    aggregate_sports(sports_data, totals, by_period)

    output = build_output(totals, by_period)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print(f"Top juegos actualizado: {OUTPUT_PATH}")
    print(
        f"Periodos: {len(output['por_periodo'])} | "
        f"juegos acumulados: {len(output['acumulado']['mas_jugados'])}"
    )
    if output["acumulado"]["mas_jugados"]:
        top = output["acumulado"]["mas_jugados"][0]
        print(f"Top: {top['titulo']} ({top['categoria']}) - {top['jugadas']} jugadas, ${top['apuesta']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
