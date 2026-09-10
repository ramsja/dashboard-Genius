"""Genera dashboard/data/snapshot.json desde el CSV mas reciente.

El snapshot es la fuente principal del dashboard (app.js).
Se puede ejecutar standalone o como parte de sync-realtime.py.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import guardas
from extraccionDatos import (
    classify_connection,
    classify_client_status,
    classify_discipline,
    get_row_value,
    parse_float,
)

BASE_DIR = Path(__file__).resolve().parent
DESCARGAS = BASE_DIR / "descargas"
SNAPSHOT_PATH = BASE_DIR / "dashboard" / "data" / "snapshot.json"


def find_latest_csv(descargas: Path, date: str | None = None) -> Path:
    """Busca el CSV mas reciente por fecha del nombre, no por st_mtime."""
    import re
    if date:
        pattern = f"transacciones_producto__{date}_*.csv"
        matches = list(descargas.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"No hay CSV para la fecha {date}")
        return matches[0]

    csvs = list(descargas.glob("transacciones_producto__*.csv"))
    if not csvs:
        raise FileNotFoundError("No hay CSVs en descargas/")

    def parse_date_from_name(p: Path) -> str:
        m = re.search(r'transacciones_producto__(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})', p.name)
        return m.group(2) if m else "0000-00-00"

    return max(csvs, key=parse_date_from_name)


def build_snapshot(filepath: Path) -> dict[str, Any]:
    discipline_counts: dict[str, int] = {"deportes": 0, "casino": 0, "otros": 0}
    client_status_counts: dict[str, int] = {
        "activo": 0, "inactivo": 0, "desconectado": 0, "suspendido": 0, "otros": 0,
    }
    connection_counts: dict[str, int] = {"online": 0, "retail": 0, "desconocido": 0}
    matrix: dict[str, dict[str, Any]] = {}
    money: dict[str, dict[str, float]] = {}
    product_counts: dict[str, int] = {}

    seen_transactions: set[str] = set()
    duplicates = 0

    with filepath.open("r", encoding="utf-8-sig", newline="", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            # Misma guarda que construir-historico.py: el back office repite
            # transacciones dentro de un mismo export.
            transaction_key = get_row_value(
                row, "ID de transacción", "ID de transaccion", "id_transaccion",
                "transaction_id",
            )
            if transaction_key:
                if transaction_key in seen_transactions:
                    duplicates += 1
                    continue
                seen_transactions.add(transaction_key)

            discipline = classify_discipline(row)
            discipline_counts[discipline] = discipline_counts.get(discipline, 0) + 1

            client_status = classify_client_status(row)
            client_status_counts[client_status] = client_status_counts.get(client_status, 0) + 1

            connection = classify_connection(row)
            connection_counts[connection] = connection_counts.get(connection, 0) + 1

            row_matrix = matrix.setdefault(discipline, {"total": 0})
            row_matrix["total"] += 1
            row_matrix[connection] = row_matrix.get(connection, 0) + 1
            status_by_disc = row_matrix.setdefault("status", {})
            status_by_disc[client_status] = status_by_disc.get(client_status, 0) + 1

            row_money = money.setdefault(discipline, {"income": 0.0, "total": 0.0, "commission": 0.0})
            row_money["income"] += parse_float(get_row_value(row, "Ingresos", "income", "ingresos"))
            row_money["total"] += parse_float(get_row_value(row, "Total", "total"))
            row_money["commission"] += parse_float(get_row_value(row, "Comision", "commission", "comision"))

            producto = get_row_value(row, "producto causal", "Producto causal").strip()
            if producto:
                product_counts[producto] = product_counts.get(producto, 0) + 1

    top_products = sorted(product_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    if duplicates:
        print(f"  {duplicates:,} fila(s) repetidas por ID de transaccion, descartadas.")

    return {
        "version": 2,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source": str(filepath),
        "total": sum(discipline_counts.values()),
        "discipline": discipline_counts,
        "connection": connection_counts,
        "status": client_status_counts,
        "matrix": {
            disc: {
                "online": counts.get("online", 0),
                "retail": counts.get("retail", 0),
                "desconocido": counts.get("desconocido", 0),
                "total": counts.get("total", 0),
                "status": counts.get("status", {}),
            }
            for disc, counts in matrix.items()
        },
        "money": {
            disc: {
                "income": round(vals["income"], 2),
                "total": round(vals["total"], 2),
                "commission": round(vals["commission"], 2),
            }
            for disc, vals in money.items()
        },
        "top_products": [[name, count] for name, count in top_products],
    }



def main() -> None:
    date_filter = None
    if len(sys.argv) > 1:
        date_filter = sys.argv[1]

    try:
        csv_path = find_latest_csv(DESCARGAS, date_filter)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    print(f"Generando snapshot desde: {csv_path.name}")
    snapshot = build_snapshot(csv_path)

    if not guardas.debe_reemplazar(
        SNAPSHOT_PATH, snapshot.get('total'),
        clave_total='total', clave_fecha='generated_at', etiqueta='snapshot',
    ):
        return

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Snapshot generado: {SNAPSHOT_PATH}")
    print(f"  Total transacciones: {snapshot['total']:,}")
    print(f"  Disciplinas: {snapshot['discipline']}")
    print(f"  Conexiones: {snapshot['connection']}")


if __name__ == "__main__":
    main()
