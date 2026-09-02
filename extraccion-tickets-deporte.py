#!/usr/bin/env python3
"""Desglose de tickets deportivos por disciplina para el dashboard Genius.

Recorre el catalogo de deportes del filtro de la betlist V2 del back office
(headoffice.novusbet.com, sport_id[]), cuenta los tickets del periodo por
deporte (Fecha de colocacion) y, para los deportes con tickets, descarga el
export CSV (flujo Elastic: export -> scrollId -> download) para sumar importes,
cuotas y estados. Escribe:

  dashboard/data/desglose-tickets.json  (capa de datos del dashboard)
  reportes/desglose-tickets.csv         (fila por deporte y periodo)

Credenciales por entorno (.env o variables): BO_USERNAME / BO_PASSWORD.

Uso:
  python extraccion-tickets-deporte.py                  # mes en curso
  python extraccion-tickets-deporte.py --mes 2026-08    # un mes concreto
  python extraccion-tickets-deporte.py --desde 2026-08-01 --hasta 2026-08-31
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
PAGINA_V2 = "/backoffice/ticket/V2"
PATRON_CODIGO = re.compile(r"[A-Z0-9]{3}-[A-Z0-9]{6,}-\d{6,}")   # ej. GSV-W5K99V18R-788651702
PATRON_PAGINA = re.compile(r"page=(\d+)")
PAUSA_S = 0.2

# Catalogo de deportes del filtro sport_id[] de la betlist V2 (respaldo si el
# select no se puede leer de la pagina). (id, nombre sin sufijo de feed)
CATALOGO_FALLBACK = [
    (1, 'Soccer'), (2, 'Basketball'), (3, 'Baseball'), (4, 'Ice Hockey'),
    (5, 'Tennis'), (6, 'Handball'), (7, 'Floorball'), (8, 'Trotting'),
    (9, 'Golf'), (10, 'Boxing'), (11, 'Motorsport'), (12, 'Rugby'),
    (13, 'Aussie Rules'), (14, 'Winter Sports'), (15, 'Bandy'), (16, 'American Football'),
    (17, 'Cycling'), (18, 'Specials'), (19, 'Snooker'), (20, 'Table Tennis'),
    (21, 'Cricket'), (22, 'Darts'), (23, 'Volleyball'), (24, 'Field hockey'),
    (25, 'Pool'), (26, 'Waterpolo'), (27, 'Gaelic sports'), (28, 'Curling'),
    (29, 'Futsal'), (30, 'Olympics'), (31, 'Badminton'), (32, 'Bowls'),
    (33, 'Chess'), (34, 'Beach Volley'), (35, 'Netball'), (36, 'Athletics'),
    (37, 'Squash'), (38, 'Rink Hockey'), (39, 'Lacrosse'), (40, 'Formula 1'),
    (41, 'Bikes'), (42, 'DTM'), (43, 'Alpine Skiing'), (44, 'Biathlon'),
    (45, 'Bobsleigh'), (46, 'Cross-Country'), (47, 'Nordic Combined'), (48, 'Ski Jumping'),
    (49, 'Snowboard'), (50, 'Speed Skating'), (51, 'Luge'), (52, 'Swimming'),
    (53, 'Finnish Baseball'), (54, 'Softball'), (55, 'Horse racing'), (56, 'Schwingen'),
    (57, 'Inline Hockey'), (58, 'Greyhound'), (59, 'Rugby League'), (60, 'Beach Soccer'),
    (61, 'Pesapallo'), (62, 'Streethockey'), (63, 'World Championship'), (64, 'Rowing'),
    (65, 'Freestyle'), (66, 'Snowboardcross/Parallel'), (67, 'MotoGP'), (68, 'Moto2'),
    (69, 'Moto3'), (70, 'Nascar Cup Series'), (71, 'Padel'), (72, 'Canoeing'),
    (73, 'Horseball'), (74, 'Aquatics'), (75, 'Archery'), (76, 'Equestrian'),
    (77, 'Fencing'), (78, 'Gymnastics'), (79, 'Judo'), (80, 'Modern Pentathlon'),
    (81, 'Sailing'), (82, 'Shooting'), (83, 'Taekwondo'), (84, 'Triathlon'),
    (85, 'Weightlifting'), (86, 'Wrestling'), (87, 'Olympics Youth'), (88, 'Mountain Bike'),
    (89, 'Riding'), (90, 'Surfing'), (91, 'BMX racing'), (92, 'Canoe slalom'),
    (93, 'Rhythmic gymnastics'), (94, 'Trampoline Gymnastics'), (95, 'Artistic Swimming'), (96, 'Diving'),
    (97, 'Track cycling'), (98, 'Beach Tennis'), (99, 'Sumo'), (100, 'Superbike'),
    (101, 'Rally'), (102, 'Figure Skating'), (103, 'Freestyle Skiing'), (104, 'Skeleton'),
    (105, 'Short Track'), (106, 'Soccer Mythical'), (107, 'eSport'), (108, 'World Lottery'),
    (109, 'ESport Counter-Strike'), (110, 'ESport League of Legends'), (111, 'ESport Dota'), (112, 'ESport StarCraft'),
    (113, 'ESport Hearthstone'), (114, 'ESport Heroes of the Storm'), (115, 'ESport World of Tanks'), (116, 'Polo'),
    (117, 'MMA'), (118, 'ESport Call of Duty'), (119, 'ESport Smite'), (120, 'ESport Vainglory'),
    (121, 'ESport Overwatch'), (122, 'ESport WarCraft III'), (123, 'ESport Crossfire'), (124, 'ESport Halo'),
    (125, 'ESport Rainbow Six'), (126, 'Sepak Takraw'), (127, 'ESport Street Fighter V'), (128, 'ESport Rocket League'),
    (129, 'Indy Racing'), (130, 'Basque Pelota'), (131, 'Speedway'), (132, 'ESport Gears of War'),
    (133, 'ESport Clash Royale'), (134, 'ESport King of Glory'), (135, 'Gaelic Football'), (136, 'Gaelic Hurling'),
    (137, 'eSoccer'), (138, 'Kabaddi'), (139, 'ESport Quake'), (140, 'ESport PlayerUnknowns Battlegrounds'),
    (141, 'Cycling Cycle Ball'), (142, 'Formula E'), (143, '7BallRun'), (144, 'Motocross'),
    (145, 'Sprint Car Racing'), (146, 'Speed Boat Racing'), (147, 'Drag Racing'), (149, 'Modified Racing'),
    (150, 'Off Road'), (151, 'Truck &amp; Tractor Pulling'), (152, 'ESport World of Warcraft'), (153, 'eBasketball'),
    (154, 'ESport Dragon Ball FighterZ'), (155, 'Basketball 3x3'), (156, 'ESport Tekken'), (157, 'Beach Handball'),
    (158, 'ESport Arena of Valor'), (159, 'ESport TF2'), (160, 'ESport SSBM'), (161, 'ESport Paladins'),
    (162, 'ESport Artifact'), (163, 'Indoor Soccer'), (164, 'ESport Apex Legends'), (165, 'Indy Lights'),
    (166, 'ESport Pro Evolution Soccer'), (167, 'ESport Madden NFL'), (168, 'ESport Brawl Stars'), (169, 'Petanque'),
    (170, 'ESport Fortnite'), (171, 'ESport MTG'), (172, 'Fishing'), (173, 'Esport Dota Underlords'),
    (174, 'Esport Teamfight Tactics'), (175, 'Esport Auto Chess'), (176, 'Esport Fighting Games'), (177, 'DEPRECATED sc'),
    (178, 'ESport Motorsport'), (179, 'Cycling BMX Freestyle'), (180, 'Cycling BMX Racing'), (181, 'Karate'),
    (182, 'Marathon Swimming'), (183, 'Skateboarding'), (184, 'Sport Climbing'), (185, 'Nascar Camping World Truck'),
    (186, 'Nascar Xfinity Series'), (187, 'NHRA'), (188, 'Touring Car Racing'), (189, 'Formula 2'),
    (190, 'Motorcycle Racing'), (191, 'Stock Car Racing'), (192, 'Air Racing'), (193, 'Endurance Racing'),
    (194, 'ESport Valorant'), (195, 'eIce Hockey'), (196, 'eTennis'), (197, 'eCricket'),
    (198, 'eVolleyball'), (199, 'ESport Wild Rift'), (200, 'T-Basket'), (201, 'Racquetball'),
    (202, 'Muay Thai'), (203, 'Soccer Specials'), (204, 'Breaking'), (205, 'Cornhole'),
    (206, 'Pickleball'), (229, 'Customs'),
]


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


def cargar_catalogo(html_v2: str) -> list[dict]:
    ancla = html_v2.find('name="sport_id')
    if ancla >= 0:
        opts = re.findall(r'<option value="(\d+)"\s*>\s*([^<]+?)\s*</option>', html_v2[ancla:ancla + 60000])
        if opts:
            return [{"id": int(v), "deporte": t.replace(" (NFS)", "").strip()} for v, t in opts]
    return [{"id": i, "deporte": d} for i, d in CATALOGO_FALLBACK]


def contar_tickets(bo: Bo, desde: str, hasta: str, sport_id: int) -> int:
    """Total exacto: con per_page=1, la ultima pagina del paginado = total."""
    params = {"per_page": "1", "sport_id[]": str(sport_id), **filtros_base(desde, hasta)}
    st, _, body, _ = bo.call(BASE + PAGINA_V2 + "?" + urllib.parse.urlencode(params))
    if st >= 400:
        raise RuntimeError(f"HTTP {st}")
    t = body.decode("utf-8", "replace")
    pags = [int(x) for x in PATRON_PAGINA.findall(t)]
    if pags:
        return max(pags)
    return 1 if PATRON_CODIGO.search(t) else 0


def exportar_csv(bo: Bo, tok: str, desde: str, hasta: str, sport_id: int, intentos: int = 15) -> str | None:
    """Export CSV via flujo Elastic: export=yes -> scrollId -> download=1."""
    params = {"per_page": "10000", "export": "yes", "sport_id[]": str(sport_id),
              "_token": tok, **filtros_base(desde, hasta)}
    qs = urllib.parse.urlencode(params)
    st, _, body, _ = bo.call(BASE + PAGINA_V2 + "?" + qs)
    try:
        sid = urllib.parse.quote(str(json.loads(body.decode("utf-8", "replace")).get("scrollId") or ""))
    except Exception:
        return None
    if not sid:
        return None
    for _ in range(intentos):
        time.sleep(2)
        st, _, body, _ = bo.call(BASE + PAGINA_V2 + f"?{qs}&scrollId={sid}")
        try:
            j = json.loads(body.decode("utf-8", "replace"))
        except Exception:
            return None
        if j.get("download"):
            break
    else:
        return None
    st, _, body, _ = bo.call(BASE + PAGINA_V2 + f"?{qs}&scrollId={sid}&download=1")
    if st == 200 and b"<html" not in body[:300].lower():
        return body.decode("utf-8-sig", "replace")
    return None


def resumir_csv(texto: str) -> dict:
    filas = list(csv.DictReader(io.StringIO(texto)))

    def num(col: str) -> float:
        acum = 0.0
        for f in filas:
            try:
                acum += float((f.get(col) or "").replace("$", "").replace(",", "") or 0)
            except ValueError:
                pass
        return round(acum, 2)

    cuotas: list[float] = []
    estados: dict[str, int] = {}
    for f in filas:
        try:
            c = float((f.get("Cuotas Totales") or "").replace(",", "") or 0)
            if c:
                cuotas.append(c)
        except ValueError:
            pass
        e = (f.get("Estado") or "?").strip() or "?"
        estados[e] = estados.get(e, 0) + 1
    return {
        "tickets": len(filas),
        "importe": num("Importe"),
        "pendiente": num("Pendiente"),
        "ganancias": num("Ganancias"),
        "cuota_media": round(sum(cuotas) / len(cuotas), 3) if cuotas else None,
        "estados": estados,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Desglose de tickets por deporte/disciplina")
    ap.add_argument("--mes", help="periodo AAAA-MM (por defecto el mes en curso)")
    ap.add_argument("--desde", help="alternativa: fecha inicial AAAA-MM-DD")
    ap.add_argument("--hasta", help="alternativa: fecha final AAAA-MM-DD")
    ap.add_argument("--solo-prueba", action="store_true", help="valida con 3 deportes y no escribe salidas")
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

    st, _, body, _ = bo.call(BASE + PAGINA_V2)
    html_v2 = body.decode("utf-8", "replace")
    tok = token_de(html_v2)
    deportes = cargar_catalogo(html_v2)
    if args.solo_prueba:
        deportes = deportes[:3]
    print(f"periodo {desde} -> {hasta} · {len(deportes)} deportes · token={'si' if tok else 'NO'}")

    por_deporte: list[dict] = []
    errores = 0
    t0 = time.time()
    for n, d in enumerate(deportes, 1):
        try:
            total = contar_tickets(bo, desde, hasta, d["id"])
        except RuntimeError as e:
            errores += 1
            print(f"  [{n}/{len(deportes)}] {d['deporte']}: conteo fallo ({e})")
            time.sleep(1)
            continue
        fila = {"sport_id": d["id"], "deporte": d["deporte"], "tickets": total}
        if total > 0 and tok:
            csv_txt = exportar_csv(bo, tok, desde, hasta, d["id"])
            if csv_txt:
                fila.update(resumir_csv(csv_txt))
            else:
                fila["detalle"] = "conteo sin export"
        por_deporte.append(fila)
        if total or n % 20 == 0:
            print(f"  [{n}/{len(deportes)}] {d['deporte']}: {total} tickets ({time.time()-t0:.0f}s)")
        time.sleep(PAUSA_S)

    por_deporte.sort(key=lambda x: -x.get("tickets", 0))
    total_tickets = sum(f.get("tickets", 0) for f in por_deporte)
    resultado = {
        "meta": {
            "fuente": BASE + PAGINA_V2,
            "generado": datetime.now().astimezone().isoformat(timespec="seconds"),
            "periodo": clave,
            "desde": desde,
            "hasta": hasta,
            "deportes_consultados": len(deportes),
            "errores": errores,
            "duracion_s": round(time.time() - t0, 1),
        },
        "total_tickets": total_tickets,
        "por_deporte": por_deporte,
    }

    if args.solo_prueba:
        print(json.dumps(resultado, indent=1, ensure_ascii=False)[:2500])
        return 0

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_REPORTES.mkdir(exist_ok=True)
    ruta = OUT_DATA / "desglose-tickets.json"
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

    with open(OUT_REPORTES / "desglose-tickets.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["periodo", "sport_id", "deporte", "tickets", "importe", "pendiente",
                    "ganancias", "cuota_media", "estados"])
        for per, res in sorted(datos["periodos"].items()):
            for fila in res["por_deporte"]:
                if fila.get("tickets"):
                    w.writerow([per, fila["sport_id"], fila["deporte"], fila.get("tickets", 0),
                                fila.get("importe", ""), fila.get("pendiente", ""),
                                fila.get("ganancias", ""), fila.get("cuota_media", ""),
                                json.dumps(fila.get("estados", {}), ensure_ascii=False)])
    print(f"OK {clave}: {total_tickets} tickets en {len(por_deporte)} deportes -> {ruta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
