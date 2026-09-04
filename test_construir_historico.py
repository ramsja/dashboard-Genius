import csv
import importlib.util
import json
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "construir_historico",
    Path(__file__).resolve().parent / "construir-historico.py",
)
hist = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(hist)


def _escribir_csv(path, filas):
    campos = [
        "Crear hora", "ID de usuario", "Usuario", "Tipo", "Ingresos",
        "Total", "Comisión", "Billeteras", "Descripción",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        writer.writerows(filas)


def test_process_csv_groups_by_day_and_counts_unique_clients(tmp_path):
    csv_path = tmp_path / "transacciones.csv"
    _escribir_csv(
        csv_path,
        [
            # Día 1: mismo cliente online dos veces + un retail
            {"Crear hora": "2026-09-03 03:46:27", "ID de usuario": "788", "Usuario": "u1",
             "Tipo": "Player Online", "Ingresos": "1.00", "Total": "-0.50", "Comisión": "",
             "Billeteras": "SportBooks", "Descripción": "Apuesta"},
            {"Crear hora": "2026-09-03 05:00:00", "ID de usuario": "788", "Usuario": "u1",
             "Tipo": "Player Online", "Ingresos": "2.00", "Total": "1.50", "Comisión": "",
             "Billeteras": "SportBooks", "Descripción": "Casino"},
            {"Crear hora": "2026-09-03 06:00:00", "ID de usuario": "999", "Usuario": "u2",
             "Tipo": "Player Retail", "Ingresos": "0.00", "Total": "5.00", "Comisión": "",
             "Billeteras": "Casino", "Descripción": "Apuesta casino"},
            # Día 2: cliente nuevo online
            {"Crear hora": "2026-09-04 10:00:00", "ID de usuario": "111", "Usuario": "u3",
             "Tipo": "Player Online", "Ingresos": "0.50", "Total": "2.00", "Comisión": "",
             "Billeteras": "SportBooks", "Descripción": "Apuesta deportiva"},
        ],
    )

    dias = hist.process_csv(csv_path)

    assert set(dias) == {"2026-09-03", "2026-09-04"}

    dia1 = dias["2026-09-03"]
    assert dia1["transacciones"] == 3
    assert dia1["conexion"] == {"online": 2, "retail": 1, "desconocido": 0}
    assert dia1["clientes"] == {"total": 2, "online": 1, "retail": 1}
    assert dia1["money"]["casino"]["total"] == 6.5
    assert dia1["money"]["deportes"]["total"] == -0.5

    dia2 = dias["2026-09-04"]
    assert dia2["clientes"] == {"total": 1, "online": 1, "retail": 0}


def test_merges_and_replaces_existing_days(tmp_path):
    historico_path = tmp_path / "historico.json"
    historico_path.write_text(
        json.dumps({
            "version": 1,
            "actualizado": "",
            "dias": {"2026-09-03": {"transacciones": 1, "disciplina": {}, "conexion": {},
                                    "clientes": {}, "money": {}}},
        }),
        encoding="utf-8",
    )

    nuevo = {
        "2026-09-03": {"transacciones": 9, "disciplina": {}, "conexion": {},
                       "clientes": {"total": 2, "online": 1, "retail": 1}, "money": {}},
        "2026-09-04": {"transacciones": 4, "disciplina": {}, "conexion": {},
                       "clientes": {"total": 1, "online": 1, "retail": 0}, "money": {}},
    }
    hist.HISTORICO_PATH = historico_path
    data = hist.load_existing()
    hist.merge(data, nuevo, tmp_path / "fuente.csv")
    historico_path.write_text(json.dumps(data), encoding="utf-8")

    final = json.loads(historico_path.read_text(encoding="utf-8"))
    assert list(final["dias"]) == ["2026-09-03", "2026-09-04"]
    assert final["dias"]["2026-09-03"]["transacciones"] == 9
