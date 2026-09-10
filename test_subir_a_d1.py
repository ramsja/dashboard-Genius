"""Pruebas del cargador a D1 y del viaje completo de ida y vuelta.

La prueba central ejecuta el SQL que vive dentro de cloudflare/worker.js contra
un SQLite en memoria (D1 es SQLite), carga los agregados reales del repo y
comprueba que lo que el Worker devolveria coincide con el snapshot.json de
origen. Si alguien cambia el esquema o el upsert del Worker sin tocar el
cargador, esto falla.
"""
import importlib.util
import json
import re
import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parent

_SPEC = importlib.util.spec_from_file_location("subir_a_d1", BASE / "subir-a-d1.py")
cargador = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(cargador)

SNAPSHOT = json.loads((BASE / "dashboard/data/snapshot.json").read_text(encoding="utf-8"))
HISTORICO = json.loads((BASE / "dashboard/data/historico.json").read_text(encoding="utf-8"))
USUARIOS = json.loads((BASE / "dashboard/data/usuarios-historico.json").read_text(encoding="utf-8"))


def _destinos_del_worker():
    """Extrae {tabla: (columnas, sql)} del worker, para no duplicar el SQL aqui."""
    js = (BASE / "cloudflare/worker.js").read_text(encoding="utf-8")
    bloque = js.split("const DESTINOS = {", 1)[1].split("\n};", 1)[0]
    destinos = {}
    for trozo in re.finditer(
        r"(\w+):\s*\{\s*columnas:\s*\[(.*?)\],.*?sql:\s*`(.*?)`",
        bloque, re.S,
    ):
        tabla, columnas, sql = trozo.groups()
        destinos[tabla] = ([c.strip().strip("'\"") for c in columnas.split(",") if c.strip()], sql)
    assert destinos, "no se pudo leer DESTINOS del worker"
    return destinos


def _base_cargada():
    """SQLite con el esquema del Worker y los agregados reales ya insertados."""
    conexion = sqlite3.connect(":memory:")
    conexion.executescript((BASE / "cloudflare/schema.sql").read_text(encoding="utf-8"))
    destinos = _destinos_del_worker()

    lotes = {}
    lotes.update(cargador.filas_ventana(SNAPSHOT))
    lotes.update(cargador.filas_historico(HISTORICO))
    lotes.update(cargador.filas_jugadores(USUARIOS, "sal-de-prueba"))

    for tabla, filas in lotes.items():
        columnas, sql = destinos[tabla]
        conexion.executemany(sql, [tuple(fila.get(c) for c in columnas) for fila in filas])
    conexion.commit()
    return conexion, lotes


def test_ningun_agregado_lleva_datos_personales():
    _, lotes = _base_cargada()
    cargador.revisar_sin_datos_personales(lotes)  # no debe lanzar
    texto = json.dumps(lotes, ensure_ascii=False)
    for id_usuario, datos in list(USUARIOS["usuarios"].items())[:50]:
        assert datos["usuario"] not in texto, "se filtro un numero de telefono"
        assert id_usuario not in texto, "se filtro un ID de usuario"


def test_alias_es_estable_y_depende_de_la_sal():
    a = cargador.alias_de("788121458", "sal-uno")
    assert a == cargador.alias_de("788121458", "sal-uno")          # estable
    assert a != cargador.alias_de("788121459", "sal-uno")          # distingue jugadores
    assert a != cargador.alias_de("788121458", "sal-dos")          # depende de la sal
    assert "788121458" not in a                                    # no contiene el ID


def test_snapshot_reconstruido_coincide_con_el_de_origen():
    """Lo que el Worker armaria desde D1 == snapshot.json."""
    conexion, _ = _base_cargada()

    meta = conexion.execute(
        "select generado_en, total from ventana_meta where clave = 'actual'"
    ).fetchone()
    assert meta[0] == SNAPSHOT["generated_at"]
    assert meta[1] == SNAPSHOT["total"]

    # marginales
    for eje, clave in (("disciplina", "discipline"), ("conexion", "connection"), ("estado", "status")):
        filas = dict(conexion.execute(
            "select valor, registros from ventana_dimension where eje = ?", (eje,)
        ).fetchall())
        assert filas == {k: int(v) for k, v in SNAPSHOT[clave].items()}, eje

    # cruce disciplina x conexion, y el total por disciplina que arma el Worker
    for disciplina, esperado in SNAPSHOT["matrix"].items():
        filas = dict(conexion.execute(
            "select valor, registros from ventana_cruce where disciplina = ? and eje = 'conexion'",
            (disciplina,),
        ).fetchall())
        for conexion_nombre in ("online", "retail", "desconocido"):
            assert filas.get(conexion_nombre, 0) == esperado.get(conexion_nombre, 0)
        assert sum(filas.values()) == esperado["total"], disciplina

        estados = dict(conexion.execute(
            "select valor, registros from ventana_cruce where disciplina = ? and eje = 'estado'",
            (disciplina,),
        ).fetchall())
        assert estados == {k: int(v) for k, v in (esperado.get("status") or {}).items()}

    # dinero
    for disciplina, esperado in SNAPSHOT["money"].items():
        fila = conexion.execute(
            "select ingresos, total, comision from ventana_money where disciplina = ?",
            (disciplina,),
        ).fetchone()
        assert fila == (esperado["income"], esperado["total"], esperado["commission"])


def test_historico_reconstruido_coincide_con_el_de_origen():
    conexion, _ = _base_cargada()
    for dia, esperado in HISTORICO["dias"].items():
        fila = conexion.execute(
            """select transacciones, clientes_total, clientes_online, clientes_retail
                 from dia_total where dia = ?""", (dia,)
        ).fetchone()
        clientes = esperado.get("clientes") or {}
        assert fila == (
            esperado["transacciones"], clientes.get("total", 0),
            clientes.get("online", 0), clientes.get("retail", 0),
        ), dia

        for clave_json, eje in cargador.EJES_DIA.items():
            filas = dict(conexion.execute(
                "select valor, registros from dia_dimension where dia = ? and eje = ?", (dia, eje)
            ).fetchall())
            assert filas == {k: int(v) for k, v in (esperado.get(clave_json) or {}).items()}


def test_reimportar_el_mismo_export_no_duplica():
    """El error de importar-perp-casino.py: sumar en vez de reemplazar."""
    conexion, lotes = _base_cargada()
    antes = conexion.execute("select count(*), sum(transacciones) from dia_total").fetchone()

    destinos = _destinos_del_worker()
    for tabla, filas in lotes.items():
        columnas, sql = destinos[tabla]
        conexion.executemany(sql, [tuple(fila.get(c) for c in columnas) for fila in filas])
    conexion.commit()

    assert conexion.execute("select count(*), sum(transacciones) from dia_total").fetchone() == antes
