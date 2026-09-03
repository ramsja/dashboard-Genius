#!/usr/bin/env python3
"""Desglose PERP (Per-Provider Report) de casino para el dashboard Genius.

Mismo patron que extraccion-tickets-deporte.py pero para el reporte "PERP"
de casino del back office (headoffice.novusbet.com): cuenta rondas por
proveedor/juego del periodo y, para los que tienen actividad, descarga el
export CSV (flujo Elastic: export -> scrollId -> download) para sumar
apuesta, premios pagados, GGR y RTP. Escribe:

  dashboard/data/perp-casino.json   (capa de datos del dashboard)
  reportes/perp-casino.csv          (fila por proveedor/juego y periodo)

Credenciales por entorno (.env o variables): BO_USERNAME / BO_PASSWORD.

AJUSTAR ANTES DE USAR (no se conoce todavia la pantalla exacta del PERP):
  - PERP_PATH:   ruta del reporte PERP en el backoffice (hoy es un
                 placeholder). Se configura con la variable de entorno
                 PERP_PATH o editando la constante mas abajo.
  - PERP_FILTRO: nombre del parametro de filtro por proveedor/juego que usa
                 esa pantalla (ej. provider_id[], game_id[]). Variable
                 PERP_FILTRO.
  - Nombres de columnas del CSV exportado: resumir_csv() busca varios
    nombres candidatos (Apuesta/Bet/Wagered, etc.); si el export real usa
    otros encabezados, agregalos a las listas CANDIDATOS_*.

Uso:
  python extraccion-perp-casino.py                  # mes en curso
  python extraccion-perp-casino.py --mes 2026-08     # un mes concreto
  python extraccion-perp-casino.py --desde 2026-08-01 --hasta 2026-08-31
"""
from __future__ import annotations

import argparse
import csv
import http.cookiejar
import io
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DATA = ROOT / "dashboard" / "data"
OUT_REPORTES = ROOT / "reportes"
BASE = "https://headoffice.novusbet.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36"

# TODO: ajustar a la ruta real del reporte PERP en el backoffice.
PERP_PATH = os.getenv("PERP_PATH", "/backoffice/casino/perp")
# TODO: confirmar el nombre real del parametro de filtro por proveedor/juego.
PERP_FILTRO = os.getenv("PERP_FILTRO", "provider_id")

PATRON_CODIGO = re.compile(r"[A-Z0-9]{3}-[A-Z0-9]{6,}-\d{6,}")
PATRON_PAGINA = re.compile(r"page=(\d+)")
PAUSA_S = 0.2

# Catalogo de respaldo (proveedores habituales de casino online). Sin IDs
# reales todavia: se usa solo si no se puede leer el filtro de la pagina.
# TODO: reemplazar por el catalogo real (id, nombre) de PERP_FILTRO.
CATALOGO_FALLBACK: list[tuple[int, str]] = []


def cargar_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for linea in env.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


def creds() -> tuple[str, str]:
    user = (os.getenv("BO_USERNAME") or "").strip()
    pw = (os.getenv("BO_PASSWORD") or "").strip()
    if not user or not pw:
        raise SystemExit("Faltan BO_USERNAME / BO_PASSWORD (.env o entorno)")
    return user, pw


class Bo:
    """Sesion minimalista contra el back office (cookies + CSRF)."""

    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )

    def call(self, url: str, token: str | None = None):
        headers = {"User-Agent": UA, "Origin": BASE, "Referer": BASE + "/backoffice/dashboard"}
        req = urllib.request.Request(url, headers=headers)
        if token:
            req.add_header("X-CSRF-TOKEN", token)
        t0 = time.perf_counter()
        try:
            with self.opener.open(req, timeout=60) as r:
                return r.status, str(r.geturl()), r.read(), int((time.perf_counter() - t0) * 1000)
        except urllib.error.HTTPError as e:
            return e.code, url, e.read() or b"", int((time.perf_counter() - t0) * 1000)

    def login(self, user: str, pw: str) -> bool:
        st, _, body, _ = self.call(BASE + "/backoffice/auth/login")
        m = re.search(r'name="_token"\s+value="([^"]+)"', body.decode("utf-8", "replace"))
        if not m:
            return False
        data = urllib.parse.urlencode({"_token": m.group(1), "username": user, "password": pw}).encode()
        req = urllib.request.Request(
            BASE + "/backoffice/auth/login", data=data, method="POST",
            headers={"User-Agent": UA, "Origin": BASE, "Content-Type": "application/x-www-form-urlencoded"},
        )
        with self.opener.open(req, timeout=60) as r:
            url_final = str(r.geturl())
            html = r.read().decode("utf-8", "replace")
        return "/auth/login" not in url_final.lower() and 'name="password"' not in html.lower()


def token_de(html: str) -> str:
    for patron in (
        r'return\s+"([A-Za-z0-9]+)"\s*;\s*\n\s*\}',
        r"'_token'\s*:\s*'([^']+)'",
        r'name="_token"\s+value="([^"]+)"',
    ):
        m = re.search(patron, html)
        if m:
            return m.group(1)
    return ""


def rango_mes(mes: str | None) -> tuple[str, str]:
    hoy = date.today()
    anio, m = (int(mes[:4]), int(mes[5:7])) if mes else (hoy.year, hoy.month)
    return (date(anio, m, 1).strftime("%Y-%m-%d 00:00"),
            date(anio, m, monthrange(anio, m)[1]).strftime("%Y-%m-%d 23:59"))


def filtros_base(desde: str, hasta: str) -> dict:
    return {"date_filter_type": "placement_date", "from_date": desde, "to_date": hasta}


def cargar_catalogo(html_perp: str) -> list[dict]:
    ancla = html_perp.find(f'name="{PERP_FILTRO}')
    if ancla >= 0:
        opts = re.findall(r'<option value="(\d+)"\s*>\s*([^<]+?)\s*</option>', html_perp[ancla:ancla + 60000])
        if opts:
            return [{"id": int(v), "proveedor": t.strip()} for v, t in opts]
    return [{"id": i, "proveedor": p} for i, p in CATALOGO_FALLBACK]


def contar_rondas(bo: Bo, desde: str, hasta: str, proveedor_id: int) -> int:
    """Total exacto: con per_page=1, la ultima pagina del paginado = total."""
    params = {"per_page": "1", f"{PERP_FILTRO}[]": str(proveedor_id), **filtros_base(desde, hasta)}
    st, _, body, _ = bo.call(BASE + PERP_PATH + "?" + urllib.parse.urlencode(params))
    if st >= 400:
        raise RuntimeError(f"HTTP {st}")
    t = body.decode("utf-8", "replace")
    pags = [int(x) for x in PATRON_PAGINA.findall(t)]
    if pags:
        return max(pags)
    return 1 if PATRON_CODIGO.search(t) else 0


def exportar_csv(bo: Bo, tok: str, desde: str, hasta: str, proveedor_id: int, intentos: int = 15) -> str | None:
    """Export CSV via flujo Elastic: export=yes -> scrollId -> download=1."""
    params = {"per_page": "10000", "export": "yes", f"{PERP_FILTRO}[]": str(proveedor_id),
              "_token": tok, **filtros_base(desde, hasta)}
    qs = urllib.parse.urlencode(params)
    st, _, body, _ = bo.call(BASE + PERP_PATH + "?" + qs)
    try:
        sid = urllib.parse.quote(str(json.loads(body.decode("utf-8", "replace")).get("scrollId") or ""))
    except Exception:
        return None
    if not sid:
        return None
    for _ in range(intentos):
        time.sleep(2)
        st, _, body, _ = bo.call(BASE + PERP_PATH + f"?{qs}&scrollId={sid}")
        try:
            j = json.loads(body.decode("utf-8", "replace"))
        except Exception:
            return None
        if j.get("download"):
            break
    else:
        return None
    st, _, body, _ = bo.call(BASE + PERP_PATH + f"?{qs}&scrollId={sid}&download=1")
    if st == 200 and b"<html" not in body[:300].lower():
        return body.decode("utf-8-sig", "replace")
    return None


CANDIDATOS_APUESTA = ("Apuesta", "Bet", "Wagered", "Total Bet", "Stake")
CANDIDATOS_PREMIOS = ("Premios", "Payout", "Win", "Ganancias pagadas", "Total Win")
CANDIDATOS_JUEGO = ("Juego", "Game", "Game Name")


def _num_col(filas: list[dict], candidatos: tuple[str, ...]) -> float:
    col = next((c for c in candidatos if filas and c in filas[0]), None)
    if not col:
        return 0.0
    acum = 0.0
    for f in filas:
        try:
            acum += float((f.get(col) or "").replace("$", "").replace(",", "") or 0)
        except ValueError:
            pass
    return round(acum, 2)


def resumir_csv(texto: str) -> dict:
    filas = list(csv.DictReader(io.StringIO(texto)))
    apuesta = _num_col(filas, CANDIDATOS_APUESTA)
    premios = _num_col(filas, CANDIDATOS_PREMIOS)
    juego_col = next((c for c in CANDIDATOS_JUEGO if filas and c in filas[0]), None)
    juegos: dict[str, int] = {}
    if juego_col:
        for f in filas:
            j = (f.get(juego_col) or "?").strip() or "?"
            juegos[j] = juegos.get(j, 0) + 1
    ggr = round(apuesta - premios, 2)
    return {
        "rondas": len(filas),
        "apuesta": apuesta,
        "premios": premios,
        "ggr": ggr,
        "rtp": round(premios / apuesta * 100, 2) if apuesta else None,
        "top_juegos": sorted(juegos.items(), key=lambda kv: -kv[1])[:10],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Desglose PERP por proveedor/juego de casino")
    ap.add_argument("--mes", help="periodo AAAA-MM (por defecto el mes en curso)")
    ap.add_argument("--desde", help="alternativa: fecha inicial AAAA-MM-DD")
    ap.add_argument("--hasta", help="alternativa: fecha final AAAA-MM-DD")
    ap.add_argument("--solo-prueba", action="store_true", help="valida con 3 proveedores y no escribe salidas")
    args = ap.parse_args()

    if args.desde and args.hasta:
        desde, hasta = args.desde + " 00:00", args.hasta + " 23:59"
        clave = args.desde[:7]
    else:
        desde, hasta = rango_mes(args.mes)
        clave = args.mes or date.today().strftime("%Y-%m")

    cargar_dotenv()
    user, pw = creds()
    bo = Bo()
    if not bo.login(user, pw):
        print("login fallido")
        return 3

    st, _, body, _ = bo.call(BASE + PERP_PATH)
    if st >= 400:
        print(f"No se pudo abrir {PERP_PATH} (HTTP {st}). Ajusta PERP_PATH/.env a la ruta real del reporte PERP.")
        return 4
    html_perp = body.decode("utf-8", "replace")
    tok = token_de(html_perp)
    proveedores = cargar_catalogo(html_perp)
    if not proveedores:
        print(f"Catalogo vacio: no se encontro el filtro '{PERP_FILTRO}' en {PERP_PATH} y no hay respaldo. "
              "Ajusta PERP_PATH/PERP_FILTRO o completa CATALOGO_FALLBACK.")
        return 5
    if args.solo_prueba:
        proveedores = proveedores[:3]
    print(f"periodo {desde} -> {hasta} · {len(proveedores)} proveedores · token={'si' if tok else 'NO'}")

    por_proveedor: list[dict] = []
    errores = 0
    t0 = time.time()
    for n, p in enumerate(proveedores, 1):
        try:
            total = contar_rondas(bo, desde, hasta, p["id"])
        except RuntimeError as e:
            errores += 1
            print(f"  [{n}/{len(proveedores)}] {p['proveedor']}: conteo fallo ({e})")
            time.sleep(1)
            continue
        fila = {"provider_id": p["id"], "proveedor": p["proveedor"], "rondas": total}
        if total > 0 and tok:
            csv_txt = exportar_csv(bo, tok, desde, hasta, p["id"])
            if csv_txt:
                fila.update(resumir_csv(csv_txt))
            else:
                fila["detalle"] = "conteo sin export"
        por_proveedor.append(fila)
        if total or n % 20 == 0:
            print(f"  [{n}/{len(proveedores)}] {p['proveedor']}: {total} rondas ({time.time()-t0:.0f}s)")
        time.sleep(PAUSA_S)

    por_proveedor.sort(key=lambda x: -x.get("rondas", 0))
    total_rondas = sum(f.get("rondas", 0) for f in por_proveedor)
    resultado = {
        "meta": {
            "fuente": BASE + PERP_PATH,
            "generado": datetime.now().astimezone().isoformat(timespec="seconds"),
            "periodo": clave,
            "desde": desde,
            "hasta": hasta,
            "proveedores_consultados": len(proveedores),
            "errores": errores,
            "duracion_s": round(time.time() - t0, 1),
        },
        "total_rondas": total_rondas,
        "por_proveedor": por_proveedor,
    }

    if args.solo_prueba:
        print(json.dumps(resultado, indent=1, ensure_ascii=False)[:2500])
        return 0

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_REPORTES.mkdir(exist_ok=True)
    ruta = OUT_DATA / "perp-casino.json"
    datos = {"meta": {}, "periodos": {}}
    if ruta.exists():
        try:
            datos = json.loads(ruta.read_text(encoding="utf-8"))
        except Exception:
            pass
    datos.setdefault("periodos", {})[clave] = resultado
    datos["meta"] = dict(resultado["meta"]) | {"actualizado": resultado["meta"]["generado"]}
    datos["meta"]["periodos_disponibles"] = sorted(datos["periodos"])
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")

    with open(OUT_REPORTES / "perp-casino.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["periodo", "provider_id", "proveedor", "rondas", "apuesta", "premios",
                    "ggr", "rtp", "top_juegos"])
        for per, res in sorted(datos["periodos"].items()):
            for fila in res["por_proveedor"]:
                if fila.get("rondas"):
                    w.writerow([per, fila["provider_id"], fila["proveedor"], fila.get("rondas", 0),
                                fila.get("apuesta", ""), fila.get("premios", ""),
                                fila.get("ggr", ""), fila.get("rtp", ""),
                                json.dumps(fila.get("top_juegos", []), ensure_ascii=False)])
    print(f"OK {clave}: {total_rondas} rondas en {len(por_proveedor)} proveedores -> {ruta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
