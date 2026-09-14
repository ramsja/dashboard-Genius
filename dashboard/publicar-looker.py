#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica el resumen no identificable del snapshot en PostgreSQL para Looker.

No replica cupones ni jugadores: solo indicadores, alertas agregadas y
distribución de exposición. Se ejecuta en segundo plano y guarda una fila por
snapshot, con lo que Looker Studio puede consultar el origen cada minuto.
"""
import json
import os
import time
from pathlib import Path

try:
    import psycopg
except ImportError:  # La imagen anterior sigue funcionando sin esta capa.
    psycopg = None


SNAPSHOT = Path(__file__).resolve().parent / "data" / "snapshot.json"
INTERVALO_S = 30


DDL = """
CREATE TABLE IF NOT EXISTS looker_kpis (
  generado TIMESTAMPTZ NOT NULL,
  indicador TEXT NOT NULL,
  valor DOUBLE PRECISION NOT NULL,
  unidad TEXT NOT NULL,
  PRIMARY KEY (generado, indicador)
);
CREATE TABLE IF NOT EXISTS looker_exposicion_tipo (
  generado TIMESTAMPTZ NOT NULL,
  tipo TEXT NOT NULL,
  pasivo_usd DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (generado, tipo)
);
CREATE TABLE IF NOT EXISTS looker_alertas_severidad (
  generado TIMESTAMPTZ NOT NULL,
  severidad TEXT NOT NULL,
  casos INTEGER NOT NULL,
  monto_usd DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (generado, severidad)
);
CREATE TABLE IF NOT EXISTS looker_alertas_tipologia (
  generado TIMESTAMPTZ NOT NULL,
  tipologia TEXT NOT NULL,
  casos INTEGER NOT NULL,
  PRIMARY KEY (generado, tipologia)
);
-- Tablas agregadas para rankings y exploración en Looker Studio.  No se
-- publican nombres, correos, IPs, tickets ni referencias de transacciones.
CREATE TABLE IF NOT EXISTS looker_rankings (
  generado TIMESTAMPTZ NOT NULL,
  ranking TEXT NOT NULL,
  periodo TEXT NOT NULL,
  entidad TEXT NOT NULL,
  categoria TEXT NOT NULL,
  apostado_usd DOUBLE PRECISION NOT NULL,
  ganado_usd DOUBLE PRECISION NOT NULL,
  neto_usd DOUBLE PRECISION NOT NULL,
  jugadas INTEGER NOT NULL,
  PRIMARY KEY (generado, ranking, periodo, entidad, categoria)
);
CREATE TABLE IF NOT EXISTS looker_eventos (
  generado TIMESTAMPTZ NOT NULL,
  grupo TEXT NOT NULL,
  evento TEXT NOT NULL,
  liga TEXT NOT NULL,
  deporte TEXT NOT NULL,
  importe_usd DOUBLE PRECISION NOT NULL,
  pasivo_usd DOUBLE PRECISION NOT NULL,
  usuarios INTEGER NOT NULL,
  cupones INTEGER NOT NULL,
  PRIMARY KEY (generado, grupo, evento, liga, deporte)
);
CREATE TABLE IF NOT EXISTS looker_resumen_modulos (
  generado TIMESTAMPTZ NOT NULL,
  modulo TEXT NOT NULL,
  indicador TEXT NOT NULL,
  valor DOUBLE PRECISION NOT NULL,
  unidad TEXT NOT NULL,
  PRIMARY KEY (generado, modulo, indicador)
);
"""


def numero(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def entero(valor):
    return int(numero(valor))


def usuario_anonimo(valor):
    """Conserva solo los últimos cuatro dígitos para rankings sin PII."""
    digitos = "".join(caracter for caracter in str(valor or "") if caracter.isdigit())
    return "Jugador ****" + (digitos[-4:] if digitos else "0000")


def publicar(snapshot):
    """Inserta únicamente el resumen agregado del snapshot actual."""
    if not psycopg or not os.environ.get("DATABASE_URL"):
        return False
    generado = snapshot.get("generated_at")
    if not generado:
        return False
    kpis = snapshot.get("kpis") or {}
    filas_kpi = [
        (generado, "Alertas abiertas", numero((kpis.get("alertas_abiertas") or {}).get("total")), "casos"),
        (generado, "Alertas críticas", numero((kpis.get("alertas_criticas") or {}).get("total")), "casos"),
        (generado, "Exposición abierta", numero((snapshot.get("exposicion_abierta") or {}).get("pasivo")), "USD"),
        (generado, "Depósitos", numero((snapshot.get("depositos") or {}).get("total")), "USD"),
        (generado, "Retiros", numero((snapshot.get("retiros") or {}).get("total")), "USD"),
        (generado, "Cobertura retiros", numero((snapshot.get("cobertura_retiros_pct") or {}).get("total")), "%"),
        (generado, "Jugadores en seguimiento", numero((kpis.get("jugadores_seguimiento") or {}).get("total")), "casos"),
    ]
    # El origen ya conectado en Looker Studio recibe también los principales
    # rankings. Así quedan visibles incluso antes de añadir una fuente nueva.
    for fila in ((snapshot.get("ranking_semanal_ganadores") or {}).get("jugadores") or [])[:10]:
        if isinstance(fila, dict):
            filas_kpi.append((
                generado,
                "Ranking semanal · {} · {}".format(usuario_anonimo(fila.get("usuario")), fila.get("producto_principal") or "Sin producto"),
                numero(fila.get("neto")),
                "USD neto",
            ))
    for fila in ((snapshot.get("ganadores_por_juego") or {}).get("ventana") or [])[:10]:
        if isinstance(fila, dict):
            filas_kpi.append((
                generado,
                "Ganadores por juego · {}".format(fila.get("juego") or "Sin juego"),
                numero(fila.get("neto")),
                "USD neto",
            ))
    for fila in (snapshot.get("partidos_top") or [])[:10]:
        if isinstance(fila, dict):
            filas_kpi.append((
                generado,
                "Partidos / eventos · {}".format(fila.get("partido") or "Sin detalle"),
                numero(fila.get("pasivo_usd") or fila.get("pasivo")),
                "USD pasivo",
            ))
    exposicion = [(generado, str(valor.get("tipo") or "Sin tipo"), numero(valor.get("pasivo")))
                  for valor in (snapshot.get("exposicion_tipo") or []) if isinstance(valor, dict)]
    severidad = [(generado, str(nombre), int(numero(valor.get("total"))), numero(valor.get("monto")))
                 for nombre, valor in (snapshot.get("alertas_severidad") or {}).items()
                 if isinstance(valor, dict)]
    tipologias = [(generado, str(nombre), int(numero(valor.get("total") if isinstance(valor, dict) else valor)))
                  for nombre, valor in (snapshot.get("alertas_tipologia") or {}).items()]
    semanal = ((snapshot.get("ranking_semanal_ganadores") or {}).get("jugadores") or [])[:100]
    historico = ((snapshot.get("sumatorio_ganancias_usuarios") or {}).get("usuarios") or [])[:100]
    rankings = []
    for periodo, etiqueta, filas in (("semanal", "Ganadores", semanal), ("histórico", "Ganadores", historico)):
        for fila in filas:
            if not isinstance(fila, dict):
                continue
            rankings.append((
                generado, etiqueta, periodo, usuario_anonimo(fila.get("usuario")),
                str(fila.get("producto_principal") or "Sin producto"),
                numero(fila.get("apostado")), numero(fila.get("ganado")),
                numero(fila.get("neto")), entero(fila.get("jugadas") or fila.get("movimientos")),
            ))
    for periodo, filas in (("ventana actual", (snapshot.get("ganadores_por_juego") or {}).get("ventana") or []),
                           ("histórico", (snapshot.get("ganadores_por_juego") or {}).get("historico") or [])):
        for fila in filas[:100]:
            if not isinstance(fila, dict):
                continue
            rankings.append((generado, "Ganadores por juego", periodo,
                             str(fila.get("juego") or "Sin juego"), str(fila.get("producto") or "Casino"),
                             numero(fila.get("apostado")), numero(fila.get("ganado")),
                             numero(fila.get("neto")), entero(fila.get("jugadas"))))
    eventos = []
    for grupo, filas in (("Partidos top", snapshot.get("partidos_top") or []),
                         ("En vivo", (snapshot.get("ranking_deporte_en_vivo") or {}).get("partidos") or [])):
        for fila in filas[:100]:
            if not isinstance(fila, dict):
                continue
            eventos.append((generado, grupo, str(fila.get("partido") or fila.get("evento") or "Sin detalle"),
                            str(fila.get("liga") or "Sin liga"), str(fila.get("deporte") or "Sin deporte"),
                            numero(fila.get("importe_usd") or fila.get("importe")),
                            numero(fila.get("pasivo_usd") or fila.get("pasivo")),
                            entero(fila.get("usuarios")), entero(fila.get("cupones"))))
    resumen_modulos = [
        (generado, "Alertas", "Casos abiertos", numero((kpis.get("alertas_abiertas") or {}).get("total")), "casos"),
        (generado, "Alertas", "Casos críticos", numero((kpis.get("alertas_criticas") or {}).get("total")), "casos"),
        (generado, "Exposición", "Pasivo abierto", numero((snapshot.get("exposicion_abierta") or {}).get("pasivo")), "USD"),
        (generado, "Pagos", "Depósitos", numero((snapshot.get("depositos") or {}).get("total")), "USD"),
        (generado, "Pagos", "Retiros", numero((snapshot.get("retiros") or {}).get("total")), "USD"),
        (generado, "Pagos", "Cobertura retiros", numero((snapshot.get("cobertura_retiros_pct") or {}).get("total")), "%"),
        (generado, "Juego responsable", "Jugadores en seguimiento", numero((kpis.get("jugadores_seguimiento") or {}).get("total")), "casos"),
        (generado, "Juego responsable", "Jugadores en pérdida", numero((kpis.get("jugadores_perdida") or {}).get("total")), "casos"),
        (generado, "AML", "Casos AML", numero((kpis.get("casos_aml") or {}).get("total")), "casos"),
    ]
    with psycopg.connect(os.environ["DATABASE_URL"]) as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(DDL)
            cursor.executemany("INSERT INTO looker_kpis VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", filas_kpi)
            if exposicion:
                cursor.executemany("INSERT INTO looker_exposicion_tipo VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", exposicion)
            if severidad:
                cursor.executemany("INSERT INTO looker_alertas_severidad VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", severidad)
            if tipologias:
                cursor.executemany("INSERT INTO looker_alertas_tipologia VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", tipologias)
            if rankings:
                cursor.executemany("INSERT INTO looker_rankings VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", rankings)
            if eventos:
                cursor.executemany("INSERT INTO looker_eventos VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", eventos)
            cursor.executemany("INSERT INTO looker_resumen_modulos VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", resumen_modulos)
    return True


def main():
    ultimo = ""
    print("[looker] publicador iniciado; revisa snapshot cada 30 s")
    while True:
        try:
            snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
            generado = snapshot.get("generated_at") or ""
            if generado and generado != ultimo and publicar(snapshot):
                ultimo = generado
                print("[looker] resumen publicado", generado)
        except Exception as exc:
            print("[looker] sin publicar:", exc)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    main()
