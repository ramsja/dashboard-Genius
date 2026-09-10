"""Sube los agregados del dashboard a la base D1, a traves del Worker.

Lee los JSON que ya generan los scripts construir-*.py y los manda al endpoint
/ingesta del Worker. No lee los CSV: asi hereda las guardas de deduplicacion de
construir-historico.py y no puede filtrar columnas crudas por accidente.

Lo que NO sale de aqui: numero de telefono (columna "usuario"), ID de usuario
del back office y direccion IP. Los rankings por jugador viajan con un alias
HMAC-SHA256 del ID usando una sal secreta; sin la sal el alias no se puede
revertir, y con la sal se puede seguir al mismo jugador entre periodos.

Variables de entorno:
  D1_API_URL         URL base del Worker, p.ej. https://dashboard-genius-api.tu-cuenta.workers.dev
  D1_TOKEN_INGESTA   el mismo valor que el secreto TOKEN_INGESTA del Worker
  D1_SAL_ALIAS       sal para el alias de jugador (cualquier cadena larga y estable)

Sin esas tres variables el script no hace nada y termina bien, para no romper
el workflow de extraccion.

Uso:
  python subir-a-d1.py              # sube
  python subir-a-d1.py --dry-run    # imprime que subiria, sin red
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

BASE = Path(__file__).resolve().parent
DATOS = BASE / "dashboard" / "data"
REPORTES = BASE / "reportes"

SNAPSHOT = DATOS / "snapshot.json"
HISTORICO = DATOS / "historico.json"
USUARIOS = DATOS / "usuarios-historico.json"
RESUMEN_DIARIO = REPORTES / "resumen-diario.json"

FILAS_POR_LOTE = 500
INTENTOS = 4
TIMEOUT = 30

EJES_DIA = {"disciplina": "disciplina", "conexion": "conexion", "estados_cliente": "estado"}


def cargar(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        print(f"  {path.name}: JSON invalido ({exc}); se omite.")
        return None


def alias_de(id_usuario: str, sal: str) -> str:
    """Alias estable y no reversible: HMAC del ID con una sal secreta."""
    return hmac.new(sal.encode("utf-8"), id_usuario.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


# --------------------------------------------------------------- constructores

def filas_ventana(snapshot: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Traduce snapshot.json a las tablas de ventana."""
    lotes: dict[str, list[dict[str, Any]]] = {}

    lotes["ventana_meta"] = [{
        "clave": "actual",
        "generado_en": snapshot.get("generated_at"),
        "fuente": Path(str(snapshot.get("source") or "")).name or "snapshot.json",
        "total": int(snapshot.get("total") or 0),
    }]

    dimensiones = []
    for eje, clave in (("disciplina", "discipline"), ("conexion", "connection"), ("estado", "status")):
        for valor, registros in (snapshot.get(clave) or {}).items():
            dimensiones.append({"eje": eje, "valor": valor, "registros": int(registros or 0)})
    lotes["ventana_dimension"] = dimensiones

    cruces = []
    for disciplina, fila in (snapshot.get("matrix") or {}).items():
        if not isinstance(fila, dict):
            continue
        for valor in ("online", "retail", "desconocido"):
            if valor in fila:
                cruces.append({"disciplina": disciplina, "eje": "conexion",
                               "valor": valor, "registros": int(fila.get(valor) or 0)})
        for valor, registros in (fila.get("status") or {}).items():
            cruces.append({"disciplina": disciplina, "eje": "estado",
                           "valor": valor, "registros": int(registros or 0)})
    lotes["ventana_cruce"] = cruces

    lotes["ventana_money"] = [
        {
            "disciplina": disciplina,
            "ingresos": float(valores.get("income") or 0),
            "total": float(valores.get("total") or 0),
            "comision": float(valores.get("commission") or 0),
        }
        for disciplina, valores in (snapshot.get("money") or {}).items()
        if isinstance(valores, dict)
    ]

    return lotes


def filas_historico(historico: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Traduce historico.json a las tablas por dia."""
    totales, dimensiones, dinero = [], [], []

    for dia, datos in (historico.get("dias") or {}).items():
        if not isinstance(datos, dict):
            continue
        clientes = datos.get("clientes") or {}
        totales.append({
            "dia": dia,
            "transacciones": int(datos.get("transacciones") or 0),
            "clientes_total": int(clientes.get("total") or 0),
            "clientes_online": int(clientes.get("online") or 0),
            "clientes_retail": int(clientes.get("retail") or 0),
        })

        for clave_json, eje in EJES_DIA.items():
            for valor, registros in (datos.get(clave_json) or {}).items():
                dimensiones.append({"dia": dia, "eje": eje, "valor": valor,
                                    "registros": int(registros or 0)})

        for disciplina, valores in (datos.get("money") or {}).items():
            if isinstance(valores, dict):
                dinero.append({
                    "dia": dia,
                    "disciplina": disciplina,
                    "ingresos": float(valores.get("income") or 0),
                    "total": float(valores.get("total") or 0),
                    "comision": float(valores.get("commission") or 0),
                })

    return {"dia_total": totales, "dia_dimension": dimensiones, "dia_money": dinero}


def filas_juegos(resumen: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Traduce reportes/resumen-diario.json a juego_dia."""
    juegos = []
    for dia, datos in (resumen.get("dias") or {}).items():
        for juego in (datos or {}).get("juegos") or []:
            juegos.append({
                "dia": dia,
                "titulo": str(juego.get("titulo") or ""),
                "proveedor": str(juego.get("proveedor") or ""),
                "categoria": str(juego.get("categoria") or "casino"),
                "jugadas": int(juego.get("jugadas") or 0),
                "apuesta": float(juego.get("apuesta") or 0),
            })
    return {"juego_dia": juegos}


def filas_jugadores(usuarios: dict[str, Any], sal: str) -> dict[str, list[dict[str, Any]]]:
    """Traduce usuarios-historico.json a jugador_periodo, sin identidad."""
    dias = sorted(usuarios.get("dias_disponibles") or [])
    desde, hasta = (dias[0], dias[-1]) if dias else ("", "")

    jugadores = []
    for id_usuario, datos in (usuarios.get("usuarios") or {}).items():
        if not isinstance(datos, dict):
            continue
        ganancia = float(datos.get("ganancia_neta") or 0)
        jugadores.append({
            "alias": alias_de(str(id_usuario), sal),
            "desde": datos.get("primer_dia") or desde,
            "hasta": datos.get("ultimo_dia") or hasta,
            "canal": str(datos.get("canal") or "desconocido"),
            "dias_activos": int(datos.get("dias_activos") or 0),
            "transacciones": int(datos.get("transacciones") or 0),
            "apuesta_total": float(datos.get("apuesta_total") or 0),
            # El origen da ganancia neta del jugador; la perdida es su negativo.
            "perdida_neta": round(-ganancia, 2),
        })
    return {"jugador_periodo": jugadores}


# Tablas que describen una sola ventana y deben vaciarse antes de escribir.
REEMPLAZAR = {"ventana_meta", "ventana_dimension", "ventana_cruce", "ventana_money",
              "jugador_periodo"}

CAMPOS_PROHIBIDOS = {"usuario", "id_usuario", "nombre_usuario_emisor", "direccion_ip",
                     "ip", "telefono", "email", "nota"}


def revisar_sin_datos_personales(lotes: dict[str, list[dict[str, Any]]]) -> None:
    """Ultima red: aborta si alguna fila lleva un campo identificable."""
    for tabla, filas in lotes.items():
        for fila in filas:
            filtrados = CAMPOS_PROHIBIDOS & {k.lower() for k in fila}
            if filtrados:
                raise SystemExit(
                    f"ABORTADO: {tabla} lleva campo(s) personales {sorted(filtrados)}."
                )


# --------------------------------------------------------------- envio

def enviar(url: str, token: str, tabla: str, filas: list[dict[str, Any]]) -> int:
    escritas = 0
    for inicio in range(0, len(filas), FILAS_POR_LOTE):
        lote = filas[inicio:inicio + FILAS_POR_LOTE]
        cuerpo = {"tabla": tabla, "filas": lote}
        # Solo el primer lote vacia la tabla; los siguientes se suman.
        if inicio == 0 and tabla in REEMPLAZAR:
            cuerpo["reemplazar"] = True

        for intento in range(1, INTENTOS + 1):
            try:
                respuesta = requests.post(
                    url.rstrip("/") + "/ingesta",
                    headers={"Authorization": f"Bearer {token}",
                             "Content-Type": "application/json"},
                    json=cuerpo,
                    timeout=TIMEOUT,
                )
                if respuesta.status_code == 200:
                    escritas += len(lote)
                    break
                detalle = respuesta.text[:200]
                print(f"  {tabla}: lote {inicio // FILAS_POR_LOTE + 1} "
                      f"intento {intento}/{INTENTOS} HTTP {respuesta.status_code} {detalle}")
            except requests.RequestException as exc:
                print(f"  {tabla}: lote {inicio // FILAS_POR_LOTE + 1} "
                      f"intento {intento}/{INTENTOS} fallo: {exc}")
            if intento == INTENTOS:
                raise SystemExit(f"No se pudo subir {tabla} despues de {INTENTOS} intentos.")
            time.sleep(2 ** intento)
    return escritas


def main() -> int:
    seco = "--dry-run" in sys.argv

    url = os.getenv("D1_API_URL", "").strip()
    token = os.getenv("D1_TOKEN_INGESTA", "").strip()
    sal = os.getenv("D1_SAL_ALIAS", "").strip()

    if not seco and not (url and token and sal):
        print("D1 no configurado (falta D1_API_URL, D1_TOKEN_INGESTA o D1_SAL_ALIAS); "
              "se omite la subida.")
        return 0

    lotes: dict[str, list[dict[str, Any]]] = {}

    snapshot = cargar(SNAPSHOT)
    if snapshot:
        lotes.update(filas_ventana(snapshot))
    else:
        print(f"  sin {SNAPSHOT.name}: no se actualiza la ventana.")

    historico = cargar(HISTORICO)
    if historico:
        lotes.update(filas_historico(historico))

    resumen = cargar(RESUMEN_DIARIO)
    if resumen:
        lotes.update(filas_juegos(resumen))
    else:
        print(f"  sin {RESUMEN_DIARIO.name}: no se actualizan los juegos por dia.")

    usuarios = cargar(USUARIOS)
    if usuarios:
        lotes.update(filas_jugadores(usuarios, sal or "sal-de-prueba"))

    lotes = {tabla: filas for tabla, filas in lotes.items() if filas}
    if not lotes:
        print("No hay nada que subir.")
        return 0

    revisar_sin_datos_personales(lotes)

    if seco:
        print("Simulacion (--dry-run), no se envia nada:")
        for tabla, filas in lotes.items():
            print(f"  {tabla}: {len(filas):,} fila(s); ejemplo = "
                  f"{json.dumps(filas[0], ensure_ascii=False)[:160]}")
        return 0

    total = 0
    for tabla, filas in lotes.items():
        escritas = enviar(url, token, tabla, filas)
        total += escritas
        print(f"  {tabla}: {escritas:,} fila(s).")

    enviar(url, token, "ingesta", [{
        "subido_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generado_en": (snapshot or {}).get("generated_at"),
        "fuente": Path(str((snapshot or {}).get("source") or "")).name,
        "dias": len((historico or {}).get("dias") or {}),
        "transacciones": int((snapshot or {}).get("total") or 0),
    }])

    print(f"Subida a D1 completada: {total:,} filas de agregados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
