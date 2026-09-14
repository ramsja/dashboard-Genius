#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica el resumen no identificable del dashboard en PostgreSQL para Looker.

Lee los JSON agregados de dashboard/data/ (snapshot, histórico por día,
actividad de usuarios, top de juegos y desglose de tickets deportivos) y guarda
su resumen en PostgreSQL, de modo que Looker Studio consulte el origen
directamente en lugar de leer los ficheros del sitio estático.

No replica transacciones ni jugadores: solo conteos, montos agregados y
rankings con el usuario anonimizado a los últimos cuatro dígitos de su ID
interno. Nunca se publican teléfonos, nombres, correos, IPs, referencias de
transacción ni el detalle de `snapshot.transactions`.

Uso:
    DATABASE_URL=postgresql://... python dashboard/publicar-looker.py
    python dashboard/publicar-looker.py --una-vez   # una sola pasada y salir
    python dashboard/publicar-looker.py --simular   # sin base: solo recuento
"""
import json
import os
import sys
import time
from pathlib import Path

try:
    import psycopg
except ImportError:  # La imagen anterior sigue funcionando sin esta capa.
    psycopg = None


DATOS = Path(__file__).resolve().parent / "data"
SNAPSHOT = DATOS / "snapshot.json"
INTERVALO_S = 30

# Cuántas filas se publican como máximo de cada ranking.
TOPE_RANKING = 100
TOPE_JUEGOS = 50


# Dos familias de tablas:
#   · serie de snapshots — llevan `generado` en la clave primaria, así que cada
#     ejecución deja su propia foto y se puede ver la evolución en el tiempo.
#   · estado por clave natural (día, periodo, deporte) — se reemplazan con
#     UPSERT, igual que hace construir-historico.py, para que la serie diaria
#     quede limpia y la base no crezca sin control.
DDL = """
CREATE TABLE IF NOT EXISTS looker_kpis (
  generado TIMESTAMPTZ NOT NULL,
  indicador TEXT NOT NULL,
  valor DOUBLE PRECISION NOT NULL,
  unidad TEXT NOT NULL,
  PRIMARY KEY (generado, indicador)
);
CREATE TABLE IF NOT EXISTS looker_resumen_modulos (
  generado TIMESTAMPTZ NOT NULL,
  modulo TEXT NOT NULL,
  indicador TEXT NOT NULL,
  valor DOUBLE PRECISION NOT NULL,
  unidad TEXT NOT NULL,
  PRIMARY KEY (generado, modulo, indicador)
);
CREATE TABLE IF NOT EXISTS looker_matriz (
  generado TIMESTAMPTZ NOT NULL,
  disciplina TEXT NOT NULL,
  conexion TEXT NOT NULL,
  transacciones INTEGER NOT NULL,
  PRIMARY KEY (generado, disciplina, conexion)
);
CREATE TABLE IF NOT EXISTS looker_dinero_disciplina (
  generado TIMESTAMPTZ NOT NULL,
  disciplina TEXT NOT NULL,
  ingresos_usd DOUBLE PRECISION NOT NULL,
  total_usd DOUBLE PRECISION NOT NULL,
  comision_usd DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (generado, disciplina)
);
CREATE TABLE IF NOT EXISTS looker_estados_cliente (
  generado TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL,
  transacciones INTEGER NOT NULL,
  PRIMARY KEY (generado, estado)
);
CREATE TABLE IF NOT EXISTS looker_productos (
  generado TIMESTAMPTZ NOT NULL,
  posicion INTEGER NOT NULL,
  producto TEXT NOT NULL,
  transacciones INTEGER NOT NULL,
  PRIMARY KEY (generado, posicion)
);
-- Rankings agregados: la entidad va anonimizada (`Jugador ****1234`) y la
-- posición forma parte de la clave para que dos jugadores con los mismos
-- cuatro dígitos finales no se pisen.  `ganado_usd` y `neto_usd` admiten NULL
-- porque no todos los orígenes los calculan.
CREATE TABLE IF NOT EXISTS looker_rankings (
  generado TIMESTAMPTZ NOT NULL,
  ranking TEXT NOT NULL,
  periodo TEXT NOT NULL,
  posicion INTEGER NOT NULL,
  entidad TEXT NOT NULL,
  categoria TEXT NOT NULL,
  canal TEXT NOT NULL,
  apostado_usd DOUBLE PRECISION NOT NULL,
  ganado_usd DOUBLE PRECISION,
  neto_usd DOUBLE PRECISION,
  movimientos INTEGER NOT NULL,
  PRIMARY KEY (generado, ranking, periodo, posicion)
);
CREATE TABLE IF NOT EXISTS looker_historico_dia (
  dia DATE PRIMARY KEY,
  generado TIMESTAMPTZ NOT NULL,
  transacciones INTEGER NOT NULL,
  casino INTEGER NOT NULL,
  deportes INTEGER NOT NULL,
  otros INTEGER NOT NULL,
  online INTEGER NOT NULL,
  retail INTEGER NOT NULL,
  clientes_total INTEGER NOT NULL,
  clientes_online INTEGER NOT NULL,
  clientes_retail INTEGER NOT NULL,
  ingresos_usd DOUBLE PRECISION NOT NULL,
  total_usd DOUBLE PRECISION NOT NULL,
  comision_usd DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS looker_juegos (
  periodo TEXT NOT NULL,
  ranking TEXT NOT NULL,
  posicion INTEGER NOT NULL,
  generado TIMESTAMPTZ NOT NULL,
  titulo TEXT NOT NULL,
  proveedor TEXT NOT NULL,
  categoria TEXT NOT NULL,
  jugadas INTEGER NOT NULL,
  apostado_usd DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (periodo, ranking, posicion)
);
CREATE TABLE IF NOT EXISTS looker_tickets_deporte (
  periodo TEXT NOT NULL,
  deporte TEXT NOT NULL,
  generado TIMESTAMPTZ NOT NULL,
  tickets INTEGER NOT NULL,
  importe_usd DOUBLE PRECISION NOT NULL,
  pendiente_usd DOUBLE PRECISION NOT NULL,
  ganancias_usd DOUBLE PRECISION NOT NULL,
  cuota_media DOUBLE PRECISION,
  PRIMARY KEY (periodo, deporte)
);
CREATE TABLE IF NOT EXISTS looker_tickets_estado (
  periodo TEXT NOT NULL,
  deporte TEXT NOT NULL,
  estado TEXT NOT NULL,
  generado TIMESTAMPTZ NOT NULL,
  tickets INTEGER NOT NULL,
  PRIMARY KEY (periodo, deporte, estado)
);
"""

# Cada entrada: SQL de inserción y columnas que se refrescan en un UPSERT.
INSERCIONES = {
    "looker_kpis": "INSERT INTO looker_kpis VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_resumen_modulos": "INSERT INTO looker_resumen_modulos VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_matriz": "INSERT INTO looker_matriz VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_dinero_disciplina": "INSERT INTO looker_dinero_disciplina VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_estados_cliente": "INSERT INTO looker_estados_cliente VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_productos": "INSERT INTO looker_productos VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_rankings": "INSERT INTO looker_rankings VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
    "looker_historico_dia": (
        "INSERT INTO looker_historico_dia VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (dia) DO UPDATE SET generado=EXCLUDED.generado, "
        "transacciones=EXCLUDED.transacciones, casino=EXCLUDED.casino, deportes=EXCLUDED.deportes, "
        "otros=EXCLUDED.otros, online=EXCLUDED.online, retail=EXCLUDED.retail, "
        "clientes_total=EXCLUDED.clientes_total, clientes_online=EXCLUDED.clientes_online, "
        "clientes_retail=EXCLUDED.clientes_retail, ingresos_usd=EXCLUDED.ingresos_usd, "
        "total_usd=EXCLUDED.total_usd, comision_usd=EXCLUDED.comision_usd"
    ),
    "looker_juegos": (
        "INSERT INTO looker_juegos VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (periodo, ranking, posicion) DO UPDATE SET generado=EXCLUDED.generado, "
        "titulo=EXCLUDED.titulo, proveedor=EXCLUDED.proveedor, categoria=EXCLUDED.categoria, "
        "jugadas=EXCLUDED.jugadas, apostado_usd=EXCLUDED.apostado_usd"
    ),
    "looker_tickets_deporte": (
        "INSERT INTO looker_tickets_deporte VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (periodo, deporte) DO UPDATE SET generado=EXCLUDED.generado, "
        "tickets=EXCLUDED.tickets, importe_usd=EXCLUDED.importe_usd, "
        "pendiente_usd=EXCLUDED.pendiente_usd, ganancias_usd=EXCLUDED.ganancias_usd, "
        "cuota_media=EXCLUDED.cuota_media"
    ),
    "looker_tickets_estado": (
        "INSERT INTO looker_tickets_estado VALUES (%s,%s,%s,%s,%s) "
        "ON CONFLICT (periodo, deporte, estado) DO UPDATE SET generado=EXCLUDED.generado, "
        "tickets=EXCLUDED.tickets"
    ),
}


def numero(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def entero(valor):
    return int(numero(valor))


def opcional(valor):
    """Devuelve None en lugar de 0.0 cuando el origen no trae el dato."""
    return None if valor is None else numero(valor)


def usuario_anonimo(valor):
    """Conserva solo los últimos cuatro dígitos para rankings sin PII."""
    digitos = "".join(caracter for caracter in str(valor or "") if caracter.isdigit())
    return "Jugador ****" + (digitos[-4:] if digitos else "0000")


def canal_normalizado(valor):
    """'Player Online' / 'Player Retail' -> online / retail."""
    texto = str(valor or "").strip().lower()
    if "online" in texto:
        return "online"
    if "retail" in texto:
        return "retail"
    return "desconocido"


def leer_json(nombre):
    """Lee un JSON de dashboard/data/; devuelve {} si falta o está corrupto."""
    ruta = DATOS / nombre
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def cargar_datos():
    """Reúne los orígenes agregados del dashboard en un solo diccionario."""
    return {
        "snapshot": leer_json("snapshot.json"),
        "historico": leer_json("historico.json"),
        "actividad": leer_json("actividad-usuarios.json"),
        "usuarios": leer_json("usuarios-historico.json"),
        "juegos": leer_json("top-juegos.json"),
        "tickets": leer_json("desglose-tickets.json"),
    }


def filas_snapshot(generado, snapshot):
    """Matriz disciplina x conexión, dinero, estados de cliente y productos."""
    filas = {"looker_matriz": [], "looker_dinero_disciplina": [],
             "looker_estados_cliente": [], "looker_productos": []}
    for disciplina, conteos in (snapshot.get("matrix") or {}).items():
        if not isinstance(conteos, dict):
            continue
        for conexion in ("online", "retail", "desconocido"):
            filas["looker_matriz"].append(
                (generado, str(disciplina), conexion, entero(conteos.get(conexion))))
    for disciplina, montos in (snapshot.get("money") or {}).items():
        if isinstance(montos, dict):
            filas["looker_dinero_disciplina"].append(
                (generado, str(disciplina), numero(montos.get("income")),
                 numero(montos.get("total")), numero(montos.get("commission"))))
    for estado, total in (snapshot.get("status") or {}).items():
        filas["looker_estados_cliente"].append((generado, str(estado), entero(total)))
    for posicion, producto in enumerate(snapshot.get("top_products") or [], start=1):
        if isinstance(producto, (list, tuple)) and len(producto) >= 2:
            filas["looker_productos"].append(
                (generado, posicion, str(producto[0]), entero(producto[1])))
    return filas


def filas_historico(generado, historico):
    """Una fila por día natural; se reemplaza si el día ya estaba publicado."""
    filas = []
    for dia, datos in sorted((historico.get("dias") or {}).items()):
        if not isinstance(datos, dict):
            continue
        disciplina = datos.get("disciplina") or {}
        conexion = datos.get("conexion") or {}
        clientes = datos.get("clientes") or {}
        dinero = datos.get("money") or {}
        ingresos = sum(numero(v.get("income")) for v in dinero.values() if isinstance(v, dict))
        total = sum(numero(v.get("total")) for v in dinero.values() if isinstance(v, dict))
        comision = sum(numero(v.get("commission")) for v in dinero.values() if isinstance(v, dict))
        filas.append((
            dia, generado, entero(datos.get("transacciones")),
            entero(disciplina.get("casino")), entero(disciplina.get("deportes")),
            entero(disciplina.get("otros")), entero(conexion.get("online")),
            entero(conexion.get("retail")), entero(clientes.get("total")),
            entero(clientes.get("online")), entero(clientes.get("retail")),
            round(ingresos, 2), round(total, 2), round(comision, 2),
        ))
    return filas


def filas_rankings(generado, actividad, usuarios):
    """Rankings de jugadores, siempre con la entidad anonimizada."""
    filas = []

    for posicion, fila in enumerate((actividad.get("top_apostadores") or [])[:TOPE_RANKING], start=1):
        if not isinstance(fila, dict):
            continue
        productos = fila.get("productos") or []
        filas.append((
            generado, "Apostadores", "ventana actual", posicion,
            usuario_anonimo(fila.get("id_usuario") or fila.get("usuario")),
            str(productos[0] if productos else "Sin producto"),
            canal_normalizado(fila.get("tipo")),
            numero(fila.get("total_apostado")), None, None,
            entero(fila.get("transacciones")),
        ))

    for posicion, fila in enumerate((actividad.get("top_perdidas") or [])[:TOPE_RANKING], start=1):
        if not isinstance(fila, dict):
            continue
        apostado = numero(fila.get("total_apostado"))
        ganado = numero(fila.get("total_ganado"))
        # Neto desde la perspectiva del jugador: negativo cuando pierde.
        filas.append((
            generado, "Pérdidas", "ventana actual", posicion,
            usuario_anonimo(fila.get("id_usuario") or fila.get("usuario")),
            "Sin producto", canal_normalizado(fila.get("tipo")),
            apostado, ganado, round(ganado - apostado, 2),
            entero(fila.get("transacciones")),
        ))

    # El histórico por usuario ya viene agregado por ID interno; se ordena aquí
    # para quedarnos solo con la cabeza del ranking.
    registros = [(uid, datos) for uid, datos in (usuarios.get("usuarios") or {}).items()
                 if isinstance(datos, dict)]
    por_apuesta = sorted(registros, key=lambda par: numero(par[1].get("apuesta_total")), reverse=True)
    for posicion, (uid, datos) in enumerate(por_apuesta[:TOPE_RANKING], start=1):
        filas.append((
            generado, "Apostadores", "histórico", posicion, usuario_anonimo(uid),
            str(datos.get("estado_actual") or "Sin estado"),
            canal_normalizado(datos.get("canal") or datos.get("tipo")),
            numero(datos.get("apuesta_total")), None,
            opcional(datos.get("ganancia_neta")), entero(datos.get("transacciones")),
        ))

    por_perdida = sorted(registros, key=lambda par: numero(par[1].get("ganancia_neta")))
    for posicion, (uid, datos) in enumerate(por_perdida[:TOPE_RANKING], start=1):
        filas.append((
            generado, "Pérdidas", "histórico", posicion, usuario_anonimo(uid),
            str(datos.get("estado_actual") or "Sin estado"),
            canal_normalizado(datos.get("canal") or datos.get("tipo")),
            numero(datos.get("apuesta_total")), None,
            opcional(datos.get("ganancia_neta")), entero(datos.get("transacciones")),
        ))
    return filas


def filas_juegos(generado, juegos):
    """Top de juegos por periodo y del acumulado, sin datos de jugador."""
    filas = []
    fuentes = [("acumulado", juegos.get("acumulado") or {})]
    fuentes += sorted((juegos.get("por_periodo") or {}).items())
    etiquetas = {"mas_jugados": "Más jugados", "mas_apostados": "Más apostados"}
    for periodo, bloques in fuentes:
        if not isinstance(bloques, dict):
            continue
        for clave, etiqueta in etiquetas.items():
            for posicion, juego in enumerate((bloques.get(clave) or [])[:TOPE_JUEGOS], start=1):
                if not isinstance(juego, dict):
                    continue
                filas.append((
                    str(periodo), etiqueta, posicion, generado,
                    str(juego.get("titulo") or "Sin título"),
                    str(juego.get("proveedor") or "Sin proveedor"),
                    str(juego.get("categoria") or "casino"),
                    entero(juego.get("jugadas")), numero(juego.get("apuesta")),
                ))
    return filas


def filas_tickets(generado, tickets):
    """Desglose deportivo por periodo; solo deportes con actividad."""
    por_deporte, por_estado = [], []
    for periodo, datos in sorted((tickets.get("periodos") or {}).items()):
        if not isinstance(datos, dict):
            continue
        for fila in datos.get("por_deporte") or []:
            if not isinstance(fila, dict) or entero(fila.get("tickets")) <= 0:
                continue
            deporte = str(fila.get("deporte") or "Sin deporte")
            por_deporte.append((
                str(periodo), deporte, generado, entero(fila.get("tickets")),
                numero(fila.get("importe")), numero(fila.get("pendiente")),
                numero(fila.get("ganancias")), opcional(fila.get("cuota_media")),
            ))
            for estado, total in (fila.get("estados") or {}).items():
                por_estado.append((str(periodo), deporte, str(estado), generado, entero(total)))
    return por_deporte, por_estado


def filas_kpis(generado, datos):
    """Indicadores de cabecera y su equivalente agrupado por módulo."""
    snapshot = datos.get("snapshot") or {}
    actividad = datos.get("actividad") or {}
    resumen = actividad.get("resumen") or {}
    disciplina = snapshot.get("discipline") or {}
    conexion = snapshot.get("connection") or {}
    dinero = snapshot.get("money") or {}
    ingresos = sum(numero(v.get("income")) for v in dinero.values() if isinstance(v, dict))
    neto = sum(numero(v.get("total")) for v in dinero.values() if isinstance(v, dict))
    comision = sum(numero(v.get("commission")) for v in dinero.values() if isinstance(v, dict))

    periodos_tickets = (datos.get("tickets") or {}).get("periodos") or {}
    periodo_actual = max(periodos_tickets) if periodos_tickets else None
    bloque_tickets = periodos_tickets.get(periodo_actual) or {} if periodo_actual else {}
    deportes_activos = sum(1 for f in (bloque_tickets.get("por_deporte") or [])
                           if isinstance(f, dict) and entero(f.get("tickets")) > 0)
    importe_tickets = sum(numero(f.get("importe")) for f in (bloque_tickets.get("por_deporte") or [])
                          if isinstance(f, dict))
    juegos_acumulado = ((datos.get("juegos") or {}).get("acumulado") or {}).get("mas_jugados") or []

    # (módulo, indicador, valor, unidad); los siete primeros son los KPI de cabecera.
    medidas = [
        ("Transacciones", "Transacciones totales", numero(snapshot.get("total")), "transacciones"),
        ("Transacciones", "Transacciones casino", numero(disciplina.get("casino")), "transacciones"),
        ("Transacciones", "Transacciones deportes", numero(disciplina.get("deportes")), "transacciones"),
        ("Dinero", "Ingresos", round(ingresos, 2), "USD"),
        ("Clientes", "Usuarios únicos", numero(resumen.get("total_usuarios")), "usuarios"),
        ("Clientes", "Volumen apostado", numero(resumen.get("volumen_total_apostado")), "USD"),
        ("Deportes", "Tickets del periodo", numero(bloque_tickets.get("total_tickets")), "tickets"),
        ("Transacciones", "Transacciones otros", numero(disciplina.get("otros")), "transacciones"),
        ("Transacciones", "Transacciones online", numero(conexion.get("online")), "transacciones"),
        ("Transacciones", "Transacciones retail", numero(conexion.get("retail")), "transacciones"),
        ("Dinero", "Resultado neto", round(neto, 2), "USD"),
        ("Dinero", "Comisión", round(comision, 2), "USD"),
        ("Clientes", "Usuarios activos hoy", numero(resumen.get("usuarios_activos_hoy")), "usuarios"),
        ("Clientes", "Resultado neto de jugadores", numero(resumen.get("perdida_neta_total")), "USD"),
        ("Deportes", "Deportes con actividad", float(deportes_activos), "deportes"),
        ("Deportes", "Importe apostado en tickets", round(importe_tickets, 2), "USD"),
        ("Casino", "Juegos distintos", float(len(juegos_acumulado)), "juegos"),
        ("Histórico", "Días registrados", float(len((datos.get("historico") or {}).get("dias") or {})), "días"),
    ]
    kpis = [(generado, indicador, valor, unidad)
            for _, indicador, valor, unidad in medidas[:7]]
    modulos = [(generado, modulo, indicador, valor, unidad)
               for modulo, indicador, valor, unidad in medidas]
    return kpis, modulos


def construir_filas(datos):
    """Arma todas las tablas a partir de los JSON ya cargados.

    Función pura: no toca la base, así que se puede comprobar con --simular.
    """
    snapshot = datos.get("snapshot") or {}
    generado = snapshot.get("generated_at")
    if not generado:
        return {}
    kpis, modulos = filas_kpis(generado, datos)
    tickets_deporte, tickets_estado = filas_tickets(generado, datos.get("tickets") or {})
    filas = {"looker_kpis": kpis, "looker_resumen_modulos": modulos}
    filas.update(filas_snapshot(generado, snapshot))
    filas["looker_rankings"] = filas_rankings(
        generado, datos.get("actividad") or {}, datos.get("usuarios") or {})
    filas["looker_historico_dia"] = filas_historico(generado, datos.get("historico") or {})
    filas["looker_juegos"] = filas_juegos(generado, datos.get("juegos") or {})
    filas["looker_tickets_deporte"] = tickets_deporte
    filas["looker_tickets_estado"] = tickets_estado
    return filas


def publicar(datos):
    """Inserta en PostgreSQL el resumen agregado de los JSON del dashboard."""
    if not psycopg or not os.environ.get("DATABASE_URL"):
        return False
    filas = construir_filas(datos)
    if not filas:
        return False
    with psycopg.connect(os.environ["DATABASE_URL"]) as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(DDL)
            for tabla, sentencia in INSERCIONES.items():
                if filas.get(tabla):
                    cursor.executemany(sentencia, filas[tabla])
    return True


def simular(datos):
    """Muestra qué se publicaría, sin conectarse a la base."""
    filas = construir_filas(datos)
    if not filas:
        print("[looker] snapshot sin generated_at; no hay nada que publicar")
        return False
    print("[looker] sello:", (datos.get("snapshot") or {}).get("generated_at"))
    for tabla in INSERCIONES:
        print("  {:26} {:6} filas".format(tabla, len(filas.get(tabla) or [])))
    return True


def una_pasada():
    datos = cargar_datos()
    generado = (datos.get("snapshot") or {}).get("generated_at") or ""
    if generado and publicar(datos):
        print("[looker] resumen publicado", generado)
        return generado
    return ""


def main():
    if "--simular" in sys.argv:
        sys.exit(0 if simular(cargar_datos()) else 1)
    if "--una-vez" in sys.argv:
        sys.exit(0 if una_pasada() else 1)

    ultimo = ""
    print("[looker] publicador iniciado; revisa snapshot cada {} s".format(INTERVALO_S))
    while True:
        try:
            datos = cargar_datos()
            generado = (datos.get("snapshot") or {}).get("generated_at") or ""
            if generado and generado != ultimo and publicar(datos):
                ultimo = generado
                print("[looker] resumen publicado", generado)
        except Exception as exc:
            print("[looker] sin publicar:", exc)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    main()
