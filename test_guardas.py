"""Pruebas de la guarda compartida contra exports recortados."""
import json
from datetime import datetime, timedelta
from pathlib import Path

import guardas


def _publicado(tmp_path, datos):
    ruta = tmp_path / "publicado.json"
    ruta.write_text(json.dumps(datos), encoding="utf-8")
    return ruta


def _hace(horas):
    return (datetime.now() - timedelta(hours=horas)).isoformat(timespec="seconds")


def test_conserva_lo_publicado_si_el_export_trae_menos(tmp_path):
    """Caso real: 253.904 publicadas, llega un export de 38.184."""
    ruta = _publicado(tmp_path, {"total": 253904, "generated_at": _hace(1)})
    assert guardas.debe_reemplazar(ruta, 38184) is False


def test_acepta_un_total_mayor(tmp_path):
    ruta = _publicado(tmp_path, {"total": 253904, "generated_at": _hace(1)})
    assert guardas.debe_reemplazar(ruta, 300000) is True


def test_acepta_un_total_igual(tmp_path):
    ruta = _publicado(tmp_path, {"total": 100, "generated_at": _hace(1)})
    assert guardas.debe_reemplazar(ruta, 100) is True


def test_no_se_congela_cuando_pasan_las_horas(tmp_path):
    """La ventana avanza: pasado el plazo, un total menor puede ser legitimo."""
    ruta = _publicado(tmp_path, {
        "total": 253904,
        "generated_at": _hace(guardas.HORAS_PARA_ACEPTAR_MENOR + 1),
    })
    assert guardas.debe_reemplazar(ruta, 38184) is True


def test_clave_anidada(tmp_path):
    """actividad-usuarios.json guarda su total dentro de 'resumen'."""
    ruta = _publicado(tmp_path, {
        "resumen": {"total_usuarios": 656}, "generated_at": _hace(1),
    })
    assert guardas.debe_reemplazar(
        ruta, 300, clave_total=("resumen", "total_usuarios")
    ) is False


def test_fecha_ilegible_no_bloquea(tmp_path):
    """Sin fecha usable no se puede medir la antiguedad: se deja pasar."""
    ruta = _publicado(tmp_path, {"total": 999, "generated_at": "ayer"})
    assert guardas.debe_reemplazar(ruta, 1) is True


def test_archivo_inexistente_o_corrupto_no_bloquea(tmp_path):
    assert guardas.debe_reemplazar(tmp_path / "no-existe.json", 1) is True
    roto = tmp_path / "roto.json"
    roto.write_text("{no es json", encoding="utf-8")
    assert guardas.debe_reemplazar(roto, 1) is True


def test_total_no_numerico_no_bloquea(tmp_path):
    ruta = _publicado(tmp_path, {"total": "muchas", "generated_at": _hace(1)})
    assert guardas.debe_reemplazar(ruta, 5) is True
