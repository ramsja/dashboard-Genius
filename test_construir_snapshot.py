"""Pruebas de las guardas de construir-snapshot.py.

El snapshot es el numero principal del dashboard. El mismo rango de fechas se
exporto con 441.003, 253.904 y 38.184 filas en unas horas; publicar el recortado
hace parecer que el negocio se cayo.
"""
import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "construir_snapshot", Path(__file__).resolve().parent / "construir-snapshot.py"
)
snap = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(snap)

CAMPOS = [
    "Crear hora", "ID de transacción", "ID de usuario", "Usuario", "Tipo",
    "Ingresos", "Total", "Comisión", "Billeteras", "Descripción",
    "producto causal",
]


def _csv(path, filas):
    import csv
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        w.writeheader()
        w.writerows(filas)


def _fila(tid, hora="2026-09-10 03:00:00"):
    return {
        "Crear hora": hora, "ID de transacción": tid, "ID de usuario": "788",
        "Usuario": "u1", "Tipo": "Player Online", "Ingresos": "1.00",
        "Total": "-0.50", "Comisión": "", "Billeteras": "SportBooks",
        "Descripción": "Apuesta", "producto causal": "Casino",
    }


def test_descarta_transacciones_repetidas(tmp_path):
    ruta = tmp_path / "export.csv"
    _csv(ruta, [_fila("T-1"), _fila("T-1"), _fila("T-2")])
    assert snap.build_snapshot(ruta)["total"] == 2
