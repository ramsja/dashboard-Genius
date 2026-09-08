#!/usr/bin/env python3
"""Importa exports de transacciones de casino al PERP del dashboard.

Toma como base un CSV ya exportado a mano desde headoffice.novusbet.com
(Transacciones -> exportar, el mismo formato que descarga extraccionDatos.py:
columnas "Created At", "Transaction Type", "causal", "Product", etc.), lo
agrupa por proveedor de casino y ACUMULA el resultado en
dashboard/data/perp-casino.json.

Como se explica en las columnas:
  - "causal" trae "<Proveedor> Bet (id)" / "<Proveedor> Win (id)" (a veces
    "Rollback" para reversos). El proveedor se obtiene quitando ese sufijo.
  - "Transaction Type" = Withdraw es una apuesta (dinero que sale del saldo
    del jugador); Deposit es un pago al jugador (premio o reverso).
  - "Total" trae el monto con signo (negativo en Withdraw, positivo en
    Deposit).
  - El sufijo "Rollback"/"Rollbackk" en causal marca un reverso: el Deposit
    devuelve una apuesta anulada (resta rondas y apuesta) y el Withdraw
    recupera un premio pagado (resta premios). Contabilizarlos por tipo,
    como rondas o premios nuevos, inflaba el RTP por encima de 100%.
  - Acepta las cabeceras del backoffice en ingles y en espanol
    ("Product"/"producto causal", "Transaction Type"/"Tipo de transaccion",
    "Created At"/"Crear hora").

Cada archivo importado se identifica por su hash SHA-256 y sus aportes
(deltas) por periodo/proveedor quedan guardados en el propio
perp-casino.json (meta.fuentes_importadas). Asi, ejecutar el script varias
veces con exports sucesivos (por ejemplo, un rango de fechas cada vez) los
va *asociando* al total sin volver a sumar un archivo ya importado; y
reimportar el mismo archivo con --forzar recalcula su aporte sin duplicarlo
(primero se resta el aporte anterior, luego se vuelve a sumar).

Uso:
  python importar-perp-casino.py descargas/SlotCasino.csv
  python importar-perp-casino.py descargas/*.csv
  python importar-perp-casino.py --forzar descargas/SlotCasino.csv
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DATA = ROOT / "dashboard" / "data"
OUT_REPORTES = ROOT / "reportes"
JSON_PATH = OUT_DATA / "perp-casino.json"

SUFIJOS = ("Rollbackk", "Rollback", "Bet", "Win")
PATRON_ID = re.compile(r"^(.*?)\s*\((\d+)\)\s*$")

# El RTP por proveedor es flujo de caja de la ventana importada: con muestra
# pequena (pocos dias o pocos montos) la volatilidad y los premios de apuestas
# colocadas fuera de la ventana lo disparan por encima de 100%. Por debajo de
# estos minimos se publica null y el panel muestra "-".
MIN_RONDAS_RTP = 1000
MIN_APUESTA_RTP = 2000.0


def proveedor_y_sufijo(causal: str) -> tuple[str, str]:
    m = PATRON_ID.match(causal.strip())
    base = m.group(1).strip() if m else causal.strip()
    for suf in SUFIJOS:
        mm = re.match(r"^(.*?)[\s\-]*" + suf + r"$", base, flags=re.IGNORECASE)
        if mm:
            return mm.group(1).strip() or base, suf
    return base, ""


def campo(fila: dict, *nombres: str) -> str:
    for n in nombres:
        v = fila.get(n)
        if v is not None:
            return str(v)
    return ""


def num(valor: str | None) -> float:
    if valor is None:
        return 0.0
    texto = str(valor).strip()
    if not texto or texto.upper() == "NULL":
        return 0.0
    try:
        return float(texto.replace("$", "").replace(",", ""))
    except ValueError:
        return 0.0


def sha256_de(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def procesar_archivo(path: Path) -> tuple[dict, int, int, dict]:
    """Devuelve (deltas, filas_leidas, filas_casino, cobertura) donde
    deltas[periodo][proveedor] = {"rondas": int, "apuesta": float, "premios": float}
    y cobertura[periodo] = [fecha_min, fecha_max] reales del archivo."""
    deltas: dict[str, dict[str, dict[str, float]]] = {}
    cobertura: dict[str, list[str]] = {}
    filas = 0
    filas_casino = 0
    with path.open("r", encoding="utf-8-sig", newline="", errors="replace") as f:
        lector = csv.DictReader(f)
        for fila in lector:
            filas += 1
            if campo(fila, "Product", "producto causal").strip().casefold() != "casino":
                continue
            creado = campo(fila, "Created At", "Crear hora").strip()
            periodo = creado[:7]
            if len(periodo) != 7:
                continue
            filas_casino += 1
            cov = cobertura.setdefault(periodo, [creado, creado])
            cov[0] = min(cov[0], creado)
            cov[1] = max(cov[1], creado)
            proveedor, sufijo = proveedor_y_sufijo(campo(fila, "causal"))
            tipo = campo(fila, "Transaction Type", "Tipo de transacción").strip().casefold()
            total = num(campo(fila, "Total"))
            acc = deltas.setdefault(periodo, {}).setdefault(
                proveedor, {"rondas": 0, "apuesta": 0.0, "premios": 0.0}
            )
            if sufijo in ("Rollback", "Rollbackk"):
                if tipo == "deposit":
                    acc["rondas"] -= 1
                    acc["apuesta"] -= abs(total)
                elif tipo == "withdraw":
                    acc["premios"] -= abs(total)
            elif tipo == "withdraw":
                acc["rondas"] += 1
                acc["apuesta"] += abs(total)
            elif tipo == "deposit":
                acc["premios"] += total
    return deltas, filas, filas_casino, cobertura


def aplicar_delta(acumulado: dict, deltas: dict, signo: int) -> None:
    for periodo, proveedores in deltas.items():
        dest_periodo = acumulado.setdefault(periodo, {})
        for proveedor, vals in proveedores.items():
            acc = dest_periodo.setdefault(proveedor, {"rondas": 0, "apuesta": 0.0, "premios": 0.0})
            acc["rondas"] += signo * vals["rondas"]
            acc["apuesta"] = round(acc["apuesta"] + signo * vals["apuesta"], 2)
            acc["premios"] = round(acc["premios"] + signo * vals["premios"], 2)
            if acc["rondas"] <= 0 and abs(acc["apuesta"]) < 0.005 and abs(acc["premios"]) < 0.005:
                del dest_periodo[proveedor]
        if not dest_periodo:
            del acumulado[periodo]


def construir_periodos(acumulado: dict) -> dict:
    periodos = {}
    for periodo, proveedores in acumulado.items():
        filas = []
        for proveedor, vals in proveedores.items():
            apuesta = vals["apuesta"]
            premios = vals["premios"]
            filas.append({
                "provider_id": None,
                "proveedor": proveedor,
                "rondas": vals["rondas"],
                "apuesta": round(apuesta, 2),
                "premios": round(premios, 2),
                "ggr": round(apuesta - premios, 2),
                "rtp": round(premios / apuesta * 100, 2)
                if apuesta and vals["rondas"] >= MIN_RONDAS_RTP and apuesta >= MIN_APUESTA_RTP
                else None,
            })
        filas.sort(key=lambda f: -f["rondas"])
        periodos[periodo] = {
            "meta": {
                "fuente": "importar-perp-casino.py (export manual del backoffice)",
                "generado": datetime.now().astimezone().isoformat(timespec="seconds"),
                "periodo": periodo,
                "errores": 0,
            },
            "total_rondas": sum(f["rondas"] for f in filas),
            "por_proveedor": filas,
        }
    return periodos


def main() -> int:
    ap = argparse.ArgumentParser(description="Importa exports de casino y los asocia al PERP del dashboard")
    ap.add_argument("archivos", nargs="+", help="CSV(s) exportados del backoffice (Product=Casino)")
    ap.add_argument("--forzar", action="store_true", help="reimporta archivos ya vistos (recalcula su aporte)")
    args = ap.parse_args()

    datos = {"meta": {"fuentes_importadas": []}, "acumulado": {}, "periodos": {}}
    if JSON_PATH.exists():
        try:
            datos = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    datos.setdefault("meta", {}).setdefault("fuentes_importadas", [])
    acumulado = datos.setdefault("acumulado", {})
    fuentes = {f["sha256"]: f for f in datos["meta"]["fuentes_importadas"]}

    importados = 0
    for nombre in args.archivos:
        path = Path(nombre)
        if not path.exists():
            print(f"  omitido (no existe): {nombre}")
            continue
        firma = sha256_de(path)
        previo = fuentes.get(firma)
        if previo and not args.forzar:
            print(f"  ya importado, se omite: {path.name} ({previo['filas_casino']} filas de casino, {previo['importado_en']})")
            continue
        deltas, filas, filas_casino, cobertura = procesar_archivo(path)
        if previo:
            aplicar_delta(acumulado, previo["deltas"], -1)
        aplicar_delta(acumulado, deltas, +1)
        registro = {
            "archivo": path.name,
            "sha256": firma,
            "filas": filas,
            "filas_casino": filas_casino,
            "importado_en": datetime.now().astimezone().isoformat(timespec="seconds"),
            "cobertura": cobertura,
            "deltas": deltas,
        }
        fuentes[firma] = registro
        importados += 1
        print(f"  {'reimportado' if previo else 'importado'}: {path.name} -> {filas_casino}/{filas} filas de casino")

    if not importados:
        print("Nada nuevo que importar.")
        return 0

    datos["meta"]["fuentes_importadas"] = list(fuentes.values())
    datos["periodos"] = construir_periodos(acumulado)
    for reg in datos["meta"]["fuentes_importadas"]:
        for per, cov in (reg.get("cobertura") or {}).items():
            meta_p = datos["periodos"].get(per, {}).get("meta")
            if not meta_p:
                continue
            cur = meta_p.get("cobertura")
            meta_p["cobertura"] = [min(cur[0], cov[0]), max(cur[1], cov[1])] if cur else list(cov)
    datos["meta"]["actualizado"] = datetime.now().astimezone().isoformat(timespec="seconds")
    datos["meta"]["periodos_disponibles"] = sorted(datos["periodos"])

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_REPORTES.mkdir(exist_ok=True)
    JSON_PATH.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")

    with open(OUT_REPORTES / "perp-casino.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["periodo", "proveedor", "rondas", "apuesta", "premios", "ggr", "rtp"])
        for periodo, res in sorted(datos["periodos"].items()):
            for fila in res["por_proveedor"]:
                w.writerow([periodo, fila["proveedor"], fila["rondas"], fila["apuesta"],
                            fila["premios"], fila["ggr"], fila["rtp"]])

    total_general = sum(r["total_rondas"] for r in datos["periodos"].values())
    print(f"OK: {len(datos['periodos'])} periodo(s), {total_general} rondas acumuladas -> {JSON_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
