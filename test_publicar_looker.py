import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "publicar_looker",
    Path(__file__).resolve().parent / "dashboard" / "publicar-looker.py",
)
looker = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(looker)


SELLO = "2026-09-14T11:41:05"


def _datos(**extra):
    """Orígenes mínimos con el sello obligatorio; cada test añade lo suyo."""
    base = {"snapshot": {"generated_at": SELLO, "total": 10}}
    base.update(extra)
    return base


def test_sin_generated_at_no_publica_nada():
    assert looker.construir_filas({"snapshot": {"total": 10}}) == {}


def test_tolera_origenes_ausentes_o_vacios():
    filas = looker.construir_filas(_datos())
    # El snapshot solo trae el total: las tablas existen pero sin filas de más.
    assert len(filas["looker_kpis"]) == 7
    assert filas["looker_rankings"] == []
    assert filas["looker_historico_dia"] == []
    assert filas["looker_juegos"] == []
    assert filas["looker_tickets_deporte"] == []


def test_matriz_y_dinero_salen_del_snapshot():
    snapshot = {
        "generated_at": SELLO,
        "total": 12,
        "matrix": {"casino": {"online": 7, "retail": 3, "desconocido": 0, "total": 10}},
        "money": {"casino": {"income": 100.5, "total": -7.25, "commission": 1.0}},
        "status": {"activo": 7, "inactivo": 5},
        "top_products": [["Casino", 9], ["Deporte", 3]],
    }
    filas = looker.construir_filas({"snapshot": snapshot})
    assert ("2026-09-14T11:41:05", "casino", "online", 7) in filas["looker_matriz"]
    assert filas["looker_dinero_disciplina"] == [(SELLO, "casino", 100.5, -7.25, 1.0)]
    assert filas["looker_estados_cliente"] == [(SELLO, "activo", 7), (SELLO, "inactivo", 5)]
    # La posición va en la clave primaria, así que se numera desde 1.
    assert filas["looker_productos"] == [(SELLO, 1, "Casino", 9), (SELLO, 2, "Deporte", 3)]


def test_historico_agrega_el_dinero_de_todas_las_disciplinas():
    historico = {"dias": {"2026-09-14": {
        "transacciones": 100,
        "disciplina": {"casino": 90, "deportes": 10, "otros": 0},
        "conexion": {"online": 80, "retail": 20, "desconocido": 0},
        "clientes": {"total": 9, "online": 7, "retail": 2},
        "money": {"casino": {"income": 10.0, "total": 1.0, "commission": 0.5},
                  "deportes": {"income": 5.0, "total": -2.0, "commission": 0.0}},
    }}}
    fila = looker.construir_filas(_datos(historico=historico))["looker_historico_dia"][0]
    assert fila[0] == "2026-09-14"
    assert fila[2:11] == (100, 90, 10, 0, 80, 20, 9, 7, 2)
    assert fila[11:] == (15.0, -1.0, 0.5)


def test_rankings_anonimizan_al_jugador():
    actividad = {"top_apostadores": [{
        "usuario": "50379389916", "id_usuario": "788265518",
        "total_apostado": 41360.1, "transacciones": 1951,
        "tipo": "Player Online", "productos": ["Casino", "Payments"],
    }]}
    fila = looker.construir_filas(_datos(actividad=actividad))["looker_rankings"][0]
    _, ranking, periodo, posicion, entidad, categoria, canal, apostado, ganado, neto, movs = fila
    assert (ranking, periodo, posicion) == ("Apostadores", "ventana actual", 1)
    assert entidad == "Jugador ****5518"
    assert (categoria, canal) == ("Casino", "online")
    assert (apostado, movs) == (41360.1, 1951)
    # El origen no calcula estos dos: van a NULL, no a 0, para no falsear Looker.
    assert ganado is None and neto is None
    texto = " ".join(str(v) for v in fila)
    assert "50379389916" not in texto and "788265518" not in texto


def test_perdidas_publican_el_neto_desde_la_optica_del_jugador():
    actividad = {"top_perdidas": [{
        "usuario": "50378611493", "id_usuario": "788220182", "perdida_neta": 2000.4,
        "total_apostado": 2092.0, "total_ganado": 91.6, "transacciones": 189,
        "tipo": "Player Retail",
    }]}
    fila = looker.construir_filas(_datos(actividad=actividad))["looker_rankings"][0]
    assert fila[1] == "Pérdidas"
    assert fila[6] == "retail"
    assert fila[7:10] == (2092.0, 91.6, -2000.4)


def test_ranking_historico_se_ordena_por_apuesta_y_por_perdida():
    usuarios = {"usuarios": {
        "788000001": {"canal": "online", "estado_actual": "activo",
                      "apuesta_total": 10.0, "ganancia_neta": 5.0, "transacciones": 3},
        "788000002": {"canal": "retail", "estado_actual": "inactivo",
                      "apuesta_total": 900.0, "ganancia_neta": -80.0, "transacciones": 40},
    }}
    filas = looker.construir_filas(_datos(usuarios=usuarios))["looker_rankings"]
    historico = [f for f in filas if f[2] == "histórico"]
    apostadores = [f for f in historico if f[1] == "Apostadores"]
    perdidas = [f for f in historico if f[1] == "Pérdidas"]
    # Quien más apuesta encabeza un ranking; quien peor neto tiene, el otro.
    assert apostadores[0][4] == "Jugador ****0002" and apostadores[0][7] == 900.0
    assert perdidas[0][4] == "Jugador ****0002" and perdidas[0][9] == -80.0
    assert apostadores[1][4] == "Jugador ****0001"


def test_tickets_omiten_deportes_sin_actividad_y_desglosan_estados():
    tickets = {"periodos": {"2026-09": {"total_tickets": 5, "por_deporte": [
        {"deporte": "Soccer", "tickets": 5, "importe": 60.0, "pendiente": 0.0,
         "ganancias": 20.0, "cuota_media": None, "estados": {"Won": 2, "Lost": 3}},
        {"deporte": "Curling", "tickets": 0, "importe": 0.0, "pendiente": 0.0,
         "ganancias": 0.0, "cuota_media": None, "estados": {}},
    ]}}}
    filas = looker.construir_filas(_datos(tickets=tickets))
    assert [f[1] for f in filas["looker_tickets_deporte"]] == ["Soccer"]
    assert filas["looker_tickets_deporte"][0][7] is None  # cuota_media sin dato
    assert sorted(f[2] for f in filas["looker_tickets_estado"]) == ["Lost", "Won"]
    assert sum(f[4] for f in filas["looker_tickets_estado"]) == 5


def test_juegos_publican_acumulado_y_periodos():
    juegos = {
        "acumulado": {"mas_jugados": [
            {"titulo": "Casino Island", "proveedor": "Black Lagoon",
             "categoria": "casino", "jugadas": 16362, "apuesta": 1938.5}]},
        "por_periodo": {"2026-09": {"mas_apostados": [
            {"titulo": "Live Casino", "proveedor": "Pragmaticplay",
             "categoria": "casino", "jugadas": 3761, "apuesta": 93962.22}]}},
    }
    filas = looker.construir_filas(_datos(juegos=juegos))["looker_juegos"]
    assert (filas[0][0], filas[0][1], filas[0][4], filas[0][8]) == (
        "acumulado", "Más jugados", "Casino Island", 1938.5)
    assert ("2026-09", "Más apostados", "Live Casino") in {(f[0], f[1], f[4]) for f in filas}


def test_las_transacciones_del_snapshot_nunca_se_publican():
    snapshot = {
        "generated_at": SELLO, "total": 1,
        "transactions": [{"usuario": "50369623901", "referencia": "116077994345",
                          "monto": -28.0, "producto": "Casino Live"}],
    }
    filas = looker.construir_filas({"snapshot": snapshot})
    texto = " ".join(str(v) for tabla in filas.values() for fila in tabla for v in fila)
    assert "50369623901" not in texto
    assert "116077994345" not in texto


def test_usuario_anonimo_recorta_a_cuatro_digitos():
    assert looker.usuario_anonimo("788265518") == "Jugador ****5518"
    assert looker.usuario_anonimo("ab-12") == "Jugador ****12"
    assert looker.usuario_anonimo(None) == "Jugador ****0000"
    assert looker.usuario_anonimo("") == "Jugador ****0000"


def test_canal_normalizado():
    assert looker.canal_normalizado("Player Online") == "online"
    assert looker.canal_normalizado("Player Retail") == "retail"
    assert looker.canal_normalizado(None) == "desconocido"


def test_leer_json_devuelve_vacio_si_el_fichero_falta_o_esta_roto(tmp_path, monkeypatch):
    monkeypatch.setattr(looker, "DATOS", tmp_path)
    assert looker.leer_json("no-existe.json") == {}
    (tmp_path / "roto.json").write_text("{esto no es json", encoding="utf-8")
    assert looker.leer_json("roto.json") == {}


def test_toda_tabla_del_ddl_tiene_su_insercion():
    import re
    tablas = set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", looker.DDL))
    assert tablas == set(looker.INSERCIONES)
    # Tantos marcadores como columnas declaradas en el DDL.
    for tabla, cuerpo in re.findall(
            r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", looker.DDL, re.S):
        columnas = [l.strip().split()[0] for l in cuerpo.strip().splitlines()
                    if l.strip() and not l.strip().startswith(("PRIMARY KEY", "--"))]
        marcadores = looker.INSERCIONES[tabla].split("ON CONFLICT")[0].count("%s")
        assert len(columnas) == marcadores, tabla


def test_publicar_no_hace_nada_sin_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert looker.publicar(_datos()) is False
