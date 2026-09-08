"""Genera dashboard/data/actividad-usuarios.json con top apostadores y generadores de pérdida.

Analiza el CSV de transacciones para identificar:
- Top 20 usuarios que más apuestan (por volumen)
- Top 20 usuarios que generan más pérdida (por ingresos negativos)
- Clasificación de estado: activo (último día), congelado (sin actividad reciente), desactivado
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DESCARGAS = BASE_DIR / "descargas"
OUTPUT_PATH = BASE_DIR / "dashboard" / "data" / "actividad-usuarios.json"


def find_latest_csv(descargas: Path) -> Path:
    csvs = list(descargas.glob("transacciones_producto__*.csv"))
    if not csvs:
        raise FileNotFoundError("No hay CSVs en descargas/")
    return max(csvs, key=lambda p: p.stat().st_mtime)


def analyze_users(filepath: Path) -> dict:
    users = defaultdict(lambda: {
        'usuario': '',
        'id_usuario': '',
        'total_bet': 0.0,
        'total_won': 0.0,
        'net_loss': 0.0,
        'transactions': 0,
        'tipo': '',
        'ultima_actividad': '',
        'primera_actividad': '',
        'productos': set(),
    })

    with filepath.open("r", encoding="utf-8-sig", newline="", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            user_id = row.get('ID de usuario', '').strip()
            if not user_id:
                continue

            username = row.get('Usuario', '').strip()
            total = float(row.get('Total', '0') or '0')
            tipo = row.get('Tipo', '').strip()
            crear_hora = row.get('Crear hora', '').strip()
            producto = row.get('producto causal', '').strip()

            user = users[user_id]
            user['id_usuario'] = user_id
            user['usuario'] = username or user_id
            user['transactions'] += 1
            user['tipo'] = tipo

            if total < 0:
                user['total_bet'] += abs(total)
                user['net_loss'] += abs(total)
            else:
                user['total_won'] += total
                user['net_loss'] -= total

            if crear_hora:
                if not user['primera_actividad'] or crear_hora < user['primera_actividad']:
                    user['primera_actividad'] = crear_hora
                if not user['ultima_actividad'] or crear_hora > user['ultima_actividad']:
                    user['ultima_actividad'] = crear_hora

            if producto:
                user['productos'].add(producto)

    for user in users.values():
        user['productos'] = list(user['productos'])

    top_betters = sorted(users.values(), key=lambda x: x['total_bet'], reverse=True)[:20]
    top_losers = sorted(users.values(), key=lambda x: x['net_loss'], reverse=True)[:20]

    return {
        'top_apostadores': [
            {
                'usuario': u['usuario'],
                'id_usuario': u['id_usuario'],
                'total_apostado': round(u['total_bet'], 2),
                'transacciones': u['transactions'],
                'tipo': u['tipo'],
                'ultima_actividad': u['ultima_actividad'],
                'productos': u['productos'][:5],
            }
            for u in top_betters
        ],
        'top_perdidas': [
            {
                'usuario': u['usuario'],
                'id_usuario': u['id_usuario'],
                'perdida_neta': round(u['net_loss'], 2),
                'total_apostado': round(u['total_bet'], 2),
                'total_ganado': round(u['total_won'], 2),
                'transacciones': u['transactions'],
                'tipo': u['tipo'],
                'ultima_actividad': u['ultima_actividad'],
            }
            for u in top_losers
        ],
        'resumen': {
            'total_usuarios': len(users),
            'usuarios_activos_hoy': sum(1 for u in users.values() if u['ultima_actividad'] and u['ultima_actividad'][:10] == datetime.now().strftime('%Y-%m-%d')),
            'volumen_total_apostado': round(sum(u['total_bet'] for u in users.values()), 2),
            'perdida_neta_total': round(sum(u['net_loss'] for u in users.values()), 2),
        }
    }


def main() -> None:
    try:
        csv_path = find_latest_csv(DESCARGAS)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    print(f"Analizando actividad de usuarios desde: {csv_path.name}")
    data = analyze_users(csv_path)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                'version': 1,
                'generated_at': datetime.now().isoformat(timespec='seconds'),
                'source': str(csv_path),
                **data,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )

    print(f"Datos generados: {OUTPUT_PATH}")
    print(f"  Total usuarios: {data['resumen']['total_usuarios']}")
    print(f"  Volumen total apostado: ${data['resumen']['volumen_total_apostado']:,.2f}")
    print(f"  Pérdida neta total: ${data['resumen']['perdida_neta_total']:,.2f}")


if __name__ == "__main__":
    main()
