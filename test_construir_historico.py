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
        "Crear hora", "ID de transacción", "ID de usuario", "Usuario", "Tipo",
        "Ingresos", "Total", "Comisión", "Billeteras", "Descripción",
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

    dias, _ = hist.process_csv(csv_path)

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


def test_resumen_reimport_does_not_double_games(tmp_path):
    resumen = {"dias": {"2026-09-03": {"juegos": []}}}
    games = {"2026-09-03": [{"titulo": "Juego", "proveedor": "Proveedor",
        "categoria": "casino", "jugadas": 3, "apuesta": 2.5}]}
    for _ in range(2):
        hist.merge_resumen(resumen, games, tmp_path / "export.csv")
    assert resumen["dias"]["2026-09-03"]["juegos"] == games["2026-09-03"]


def test_process_csv_descarta_transacciones_repetidas(tmp_path):
    """Un export que trae la misma transaccion dos veces no debe duplicar el dia.

    Es el caso observado en produccion: el 2026-09-07 se publico con 85.996
    transacciones, exactamente 2x las 42.998 de los exports vecinos.
    """
    csv_path = tmp_path / "repetidas.csv"
    fila = {
        "Crear hora": "2026-09-07 03:00:00", "ID de transacción": "T-1",
        "ID de usuario": "788", "Usuario": "u1", "Tipo": "Player Online",
        "Ingresos": "1.00", "Total": "-0.50", "Comisión": "",
        "Billeteras": "SportBooks", "Descripción": "Apuesta",
    }
    otra = dict(fila, **{"ID de transacción": "T-2", "Crear hora": "2026-09-07 04:00:00"})
    _escribir_csv(csv_path, [fila, dict(fila), otra, dict(otra)])

    dias, _ = hist.process_csv(csv_path)

    assert dias["2026-09-07"]["transacciones"] == 2
    assert dias["2026-09-07"]["clientes"]["total"] == 1


def test_process_csv_sin_columna_de_id_cuenta_todo(tmp_path):
    """Sin ID no se puede deduplicar: se cuenta todo en vez de descartar datos."""
    csv_path = tmp_path / "sin-id.csv"
    _escribir_csv(
        csv_path,
        [
            {"Crear hora": "2026-09-07 03:00:00", "ID de transacción": "",
             "ID de usuario": "788", "Usuario": "u1", "Tipo": "Player Online",
             "Ingresos": "1.00", "Total": "-0.50", "Comisión": "",
             "Billeteras": "SportBooks", "Descripción": "Apuesta"},
            {"Crear hora": "2026-09-07 03:00:00", "ID de transacción": "",
             "ID de usuario": "788", "Usuario": "u1", "Tipo": "Player Online",
             "Ingresos": "1.00", "Total": "-0.50", "Comisión": "",
             "Billeteras": "SportBooks", "Descripción": "Apuesta"},
        ],
    )

    dias, _ = hist.process_csv(csv_path)

    assert dias["2026-09-07"]["transacciones"] == 2


def test_merge_no_sustituye_un_dia_por_un_export_mas_corto(tmp_path):
    """Un export corto no debe borrar un dia ya publicado con mas cobertura.

    Caso real: el 2026-09-05 paso de 73.299 a 36.490 transacciones porque el
    export siguiente de la misma ventana vino con la mitad de las filas.
    """
    historico_path = tmp_path / "historico.json"
    historico_path.write_text(
        json.dumps({
            "version": 1,
            "actualizado": "",
            "dias": {
                "2026-09-05": {"transacciones": 73299, "disciplina": {}, "conexion": {},
                               "clientes": {}, "money": {}},
            },
        }),
        encoding="utf-8",
    )
    hist.HISTORICO_PATH = historico_path
    data = hist.load_existing()

    aplicados = hist.merge(
        data,
        {
            "2026-09-05": {"transacciones": 36490, "disciplina": {}, "conexion": {},
                           "clientes": {}, "money": {}},
            "2026-09-10": {"transacciones": 30975, "disciplina": {}, "conexion": {},
                           "clientes": {}, "money": {}},
        },
        tmp_path / "export-corto.csv",
    )

    # el dia ya publicado se conserva; el dia en curso si entra
    assert data["dias"]["2026-09-05"]["transacciones"] == 73299
    assert data["dias"]["2026-09-10"]["transacciones"] == 30975
    assert aplicados == 1
