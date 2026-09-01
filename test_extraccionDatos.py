import csv
from pathlib import Path

import extraccionDatos as mod


def test_classify_client_status_handles_spanish_statuses():
    assert mod.classify_client_status({"Estado": "Activo"}) == "activo"
    assert mod.classify_client_status({"Estado": "Inactivo"}) == "inactivo"
    assert mod.classify_client_status({"Estado": "Desconectado"}) == "desconectado"
    assert mod.classify_client_status({"Estado": "Pendiente"}) == "suspendido"


def test_classify_client_status_ignores_numeric_state():
    assert mod.classify_client_status({"Estado": "-0.10"}) == "otros"
    assert mod.classify_client_status({"Estado": "0.00"}) == "otros"


def test_classify_connection():
    assert mod.classify_connection({"Tipo": "Player Online"}) == "online"
    assert mod.classify_connection({"Tipo": "Player Retail"}) == "retail"
    assert mod.classify_connection({"Tipo": "Desconocido"}) == "desconocido"


def test_classify_client_status_uses_connection_type():
    assert mod.classify_client_status({"Tipo": "Player Online", "Estado": "-0.10"}) == "activo"
    assert mod.classify_client_status({"Tipo": "Player Retail", "Estado": "0.00"}) == "inactivo"


def test_generate_reports_creates_customer_summary(tmp_path):
    csv_path = tmp_path / "clientes.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Cliente", "Tipo", "Estado", "Billeteras", "Descripción"],
        )
        writer.writeheader()
        writer.writerow({"Cliente": "Ana", "Tipo": "Player Online", "Estado": "0.00", "Billeteras": "Sport", "Descripción": "Apuesta deportiva"})
        writer.writerow({"Cliente": "Luis", "Tipo": "Player Retail", "Estado": "0.00", "Billeteras": "Casino", "Descripción": "Apuesta casino"})
        writer.writerow({"Cliente": "Marta", "Tipo": "Player Online", "Estado": "0.00", "Billeteras": "Sport", "Descripción": "Sin actividad"})

    reports = mod.generate_reports(csv_path)
    assert "clientes" in reports
    assert reports["clientes"].exists()
    snapshot = reports["clientes"].read_text(encoding="utf-8")
    assert '"online": 2' in snapshot
    assert '"retail": 1' in snapshot
    assert '"activo": 2' in snapshot
    assert '"inactivo": 1' in snapshot
