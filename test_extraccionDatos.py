import csv
from pathlib import Path

import extraccionDatos as mod


def test_classify_client_status_handles_spanish_statuses():
    assert mod.classify_client_status({"Estado": "Activo"}) == "activo"
    assert mod.classify_client_status({"Estado": "Inactivo"}) == "inactivo"
    assert mod.classify_client_status({"Estado": "Desconectado"}) == "desconectado"
    assert mod.classify_client_status({"Estado": "Pendiente"}) == "otros"


def test_generate_reports_creates_customer_summary(tmp_path):
    csv_path = tmp_path / "clientes.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Cliente", "Estado", "Billeteras", "Descripción"],
        )
        writer.writeheader()
        writer.writerow({"Cliente": "Ana", "Estado": "Activo", "Billeteras": "Sport", "Descripción": "Apuesta deportiva"})
        writer.writerow({"Cliente": "Luis", "Estado": "Inactivo", "Billeteras": "Casino", "Descripción": "Apuesta casino"})
        writer.writerow({"Cliente": "Marta", "Estado": "Desconectado", "Billeteras": "Sport", "Descripción": "Sin actividad"})

    reports = mod.generate_reports(csv_path)
    assert "clientes" in reports
    assert reports["clientes"].exists()
    assert reports["clientes"].read_text(encoding="utf-8-sig")
