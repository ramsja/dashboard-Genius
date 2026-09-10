"""Guarda compartida: un export recortado no debe borrar datos publicados.

El back office exporta el MISMO rango de fechas con totales muy distintos. En
unas horas del 2026-09-10 se vieron estos exports de Sep 5 a Sep 10:

    428.410 / 225.771 / 441.003 / 253.904 / 38.184 filas

Los builders del dashboard reescriben su JSON desde el export mas reciente, asi
que el ultimo gana. Con un export de 38.184 el sitio publico paso a mostrar 300
usuarios en vez de 656 y un volumen apostado de 29.785 en vez de 203.508, como si
el negocio se hubiera caido.

Esta guarda conserva lo publicado cuando el export nuevo trae menos, con una
salida por tiempo: la ventana del export es "ultimos 5 dias" y avanza, asi que
pasadas unas horas un total menor puede ser legitimo y hay que aceptarlo, o un
export bueno quedaria congelado para siempre.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

HORAS_PARA_ACEPTAR_MENOR = 6


def _en_ruta(datos: Any, ruta: str | tuple[str, ...]) -> Any:
    """Lee una clave, o una anidada si se pasa una tupla."""
    claves = (ruta,) if isinstance(ruta, str) else ruta
    actual = datos
    for clave in claves:
        if not isinstance(actual, dict):
            return None
        actual = actual.get(clave)
    return actual


def debe_reemplazar(
    path: Path,
    nuevo_total: float,
    *,
    clave_total: str | tuple[str, ...] = "total",
    clave_fecha: str | tuple[str, ...] = "generated_at",
    horas: float = HORAS_PARA_ACEPTAR_MENOR,
    etiqueta: str = "archivo",
) -> bool:
    """True si el archivo publicado se puede sobrescribir con el nuevo."""
    if not path.exists():
        return True

    try:
        anterior = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return True

    antes = _en_ruta(anterior, clave_total) or 0
    try:
        antes = float(antes)
        ahora = float(nuevo_total or 0)
    except (TypeError, ValueError):
        return True

    if ahora >= antes:
        return True

    marca = str(_en_ruta(anterior, clave_fecha) or "")
    try:
        edad = (datetime.now() - datetime.fromisoformat(marca)).total_seconds() / 3600
    except ValueError:
        edad = float("inf")

    if edad >= horas:
        print(
            f"  {etiqueta}: lo publicado tiene {edad:.1f} h ({antes:,.0f}); se reemplaza "
            f"por {ahora:,.0f} aunque sea menor."
        )
        return True

    print(
        f"  {etiqueta}: se conserva lo publicado ({antes:,.0f} de hace {edad:.1f} h) "
        f"frente a {ahora:,.0f} del export nuevo."
    )
    return False
