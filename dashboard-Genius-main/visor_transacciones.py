from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "descargas"
REPORTES = Path(r"C:\Users\Riesgos\.zcode\workspace\default\reportes")
TOTALES_JSON = REPORTES / "lista-transacciones-totales.json"
PORT = int(os.getenv("VISOR_PORT", "8765"))
EXCEL_MAX_ROWS = 8_000

try:
    from openpyxl import Workbook
except ImportError:
    Workbook = None


def csv_paths() -> list[Path]:
    ordered = [
        REPORTES / "lista-transacciones-hoy.csv",
        REPORTES / "lista-transacciones.csv",
        DATA_DIR / "transacciones_producto_5_2026-07-26_2026-07-31.csv",
    ]
    extra = []
    if DATA_DIR.exists():
        extra.extend(sorted(DATA_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True))
    if REPORTES.exists():
        extra.extend(sorted(REPORTES.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True))
    seen = set()
    out: list[Path] = []
    for path in ordered + extra:
        if path.exists() and path.resolve() not in seen:
            seen.add(path.resolve())
            out.append(path)
    return out


def main_csv() -> Path:
    paths = csv_paths()
    if not paths:
        raise FileNotFoundError("No hay CSV de transacciones")
    return paths[0]


def totales() -> dict:
    if not TOTALES_JSON.exists():
        return {}
    try:
        return json.loads(TOTALES_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}


def money_text(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).replace("$", "").replace(",", "").replace(" ", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def open_csv(path: Path):
    return path.open("r", encoding="utf-8-sig", newline="", errors="replace")


def match_row(header: list[str], row: list[str], search: str, start: str, end: str) -> bool:
    if len(row) < len(header):
        row = row + [""] * (len(header) - len(row))
    indexed = {header[i].casefold(): row[i] if i < len(row) else "" for i in range(len(header))}
    if search:
        blob = " ".join(indexed.get(k, "") for k in ("usuario", "id de usuario", "id de transacción", "causal", "producto causal", "descripción")).casefold()
        if search.casefold() not in blob:
            return False
    created = (indexed.get("crear hora") or "")[:10]
    if start and created and created < start:
        return False
    if end and created and created > end:
        return False
    return True


def rows(params: dict[str, list[str]]) -> dict[str, object]:
    page = max(int(params.get("page", ["1"])[0] or 1), 1)
    size = min(max(int(params.get("size", ["80"])[0] or 80), 1), 150)
    search = params.get("search", [""])[0].strip()
    start = params.get("start", [""])[0].strip()
    end = params.get("end", [""])[0].strip()
    path = main_csv()
    skip = (page - 1) * size
    shown: list[list[str]] = []
    matched = 0
    header: list[str] = []
    with open_csv(path) as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        filtered = bool(search or start or end)
        for row in reader:
            if filtered and not match_row(header, row, search, start, end):
                continue
            if matched >= skip and len(shown) < size:
                shown.append(row)
            matched += 1
            if not filtered and len(shown) >= size and page == 1:
                break
            if filtered and len(shown) >= size and page > 1 and matched > skip + size:
                # keep counting for pager only on filtered scans of modest size
                if matched > 250000:
                    break
    known = totales().get("total")
    if not search and not start and not end and known:
        total = int(known)
    elif not search and not start and not end:
        total = skip + len(shown) + (1 if len(shown) == size else 0)
    else:
        total = matched
    return {"columns": header, "rows": shown, "total": total, "page": page, "size": size, "file": str(path)}


def dashboard(params: dict[str, list[str]]) -> dict[str, object]:
    data = totales()
    payload = {
        "records": data.get("total") or 0,
        "income": money_text(data.get("incomes")),
        "total": money_text(data.get("profit")),
        "users": None,
        "games": [],
        "products": [],
    }
    search = params.get("search", [""])[0].strip()
    start = params.get("start", [""])[0].strip()
    end = params.get("end", [""])[0].strip()
    path = main_csv()
    games: dict[str, int] = {}
    products: dict[str, int] = {}
    users = set()
    scanned = 0
    with open_csv(path) as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        lower = [h.casefold() for h in header]
        i_game = next((i for i, h in enumerate(lower) if h == "descripción"), None)
        i_prod = next((i for i, h in enumerate(lower) if h == "producto causal"), None)
        i_user = next((i for i, h in enumerate(lower) if h == "id de usuario"), None)
        for row in reader:
            if not match_row(header, row, search, start, end):
                continue
            scanned += 1
            if i_game is not None and i_game < len(row):
                key = row[i_game].strip() or "(sin nombre)"
                games[key] = games.get(key, 0) + 1
            if i_prod is not None and i_prod < len(row):
                key = row[i_prod].strip() or "(sin producto)"
                products[key] = products.get(key, 0) + 1
            if i_user is not None and i_user < len(row) and row[i_user]:
                users.add(row[i_user])
            if scanned >= 8000:
                break
    payload["games"] = sorted(games.items(), key=lambda x: x[1], reverse=True)[:12]
    payload["products"] = sorted(products.items(), key=lambda x: x[1], reverse=True)[:8]
    payload["users"] = len(users) if users else None
    if search or start or end:
        payload["records"] = scanned
    return payload


def export_excel(params: dict[str, list[str]]) -> bytes:
    if Workbook is None:
        raise RuntimeError("Excel no disponible")
    search = params.get("search", [""])[0].strip()
    start = params.get("start", [""])[0].strip()
    end = params.get("end", [""])[0].strip()
    path = main_csv()
    book = Workbook(write_only=True)
    sheet = book.create_sheet("Transacciones")
    with open_csv(path) as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        sheet.append(header)
        n = 0
        for row in reader:
            if not match_row(header, row, search, start, end):
                continue
            sheet.append(row)
            n += 1
            if n >= EXCEL_MAX_ROWS:
                break
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


class Handler(BaseHTTPRequestHandler):
    def send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/rows":
                self.send_json(rows(params))
            elif parsed.path in ("/api/dashboard", "/api/summary"):
                self.send_json(dashboard(params))
            elif parsed.path == "/api/preview":
                self.send_json(rows({"page": ["1"], "size": ["80"]}))
            elif parsed.path == "/api/meta":
                paths = csv_paths()
                main = paths[0] if paths else None
                mtime = datetime.fromtimestamp(main.stat().st_mtime).isoformat(timespec="seconds") if main else ""
                self.send_json({
                    "database": "csv-paginado (sin DuckDB en RAM)",
                    "file": str(main) if main else "",
                    "updated": mtime,
                    "files": [str(p) for p in paths],
                    "columns": rows({"page": ["1"], "size": ["1"]}).get("columns", []),
                })
            elif parsed.path == "/api/export.xlsx":
                body = export_excel(params)
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Disposition", "attachment; filename=transacciones_filtradas.xlsx")
                self.send_header("Content-Length", str(len(body)))
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            elif parsed.path in ("/", "/index.html"):
                body = (BASE_DIR / "visor_transacciones.html").read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_cors()
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_json({"error": "Ruta no encontrada"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def log_message(self, format: str, *args: object) -> None:
        return


class Server(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    log = BASE_DIR / "visor-error.err"
    try:
        # 0.0.0.0: el clon Docker (host.docker.internal) no entra a 127.0.0.1
        httpd = Server(("0.0.0.0", PORT), Handler)
        log.write_text("visor escuchando 0.0.0.0:%s\n" % PORT, encoding="utf-8")
        httpd.serve_forever()
    except Exception:
        import traceback
        log.write_text(traceback.format_exc(), encoding="utf-8")
        raise
