from __future__ import annotations

import csv
import io
import json
import os
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = Path(__file__).resolve().parent
REPORTES = Path(r"C:\Users\Riesgos\.zcode\workspace\default\reportes")
DESCARGAS = BASE / "descargas"
PORT = int(os.getenv("VISOR_PORT", "8765"))
HOST = os.getenv("VISOR_HOST", "0.0.0.0")
MAX_EXCEL_ROWS = 1_048_575

try:
    from openpyxl import Workbook
except ImportError:
    Workbook = None


def source() -> Path:
    candidates = list(DESCARGAS.glob("*.csv")) + list(REPORTES.glob("lista-transacciones*.csv"))
    candidates = [item for item in candidates if item.exists()]
    if not candidates:
        raise FileNotFoundError("No hay CSV de transacciones")
    return max(candidates, key=lambda item: item.stat().st_mtime)


def csv_open(path: Path):
    return path.open("r", encoding="utf-8-sig", errors="replace", newline="")


def money(value: str) -> float:
    text = (value or "").replace("$", "").replace(",", "").strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def match(header: list[str], row: list[str], search: str, start: str, end: str) -> bool:
    values = {header[i].casefold(): row[i] if i < len(row) else "" for i in range(len(header))}
    if search and search.casefold() not in " ".join(values.get(key, "") for key in ("usuario", "id de usuario", "id de transacción", "causal", "producto causal", "descripción")).casefold():
        return False
    date = values.get("crear hora", "")[:10]
    return not (start and date and date < start) and not (end and date and date > end)


def scan(params: dict[str, list[str]], include_rows: bool = False) -> dict[str, object]:
    path = source()
    search = params.get("search", [""])[0].strip()
    start = params.get("start", [""])[0].strip()
    end = params.get("end", [""])[0].strip()
    page = max(int(params.get("page", ["1"])[0] or 1), 1)
    size = min(max(int(params.get("size", ["100"])[0] or 100), 1), 150)
    header: list[str] = []
    visible: list[list[str]] = []
    count = 0
    games: dict[str, int] = {}
    products: dict[str, int] = {}
    users: set[str] = set()
    disciplinas: dict[str, dict[str, float]] = {}
    with csv_open(path) as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        lower = [item.casefold() for item in header]
        game_index = next((i for i, item in enumerate(lower) if item.startswith("descrip")), None)
        product_index = next((i for i, item in enumerate(lower) if item == "producto causal"), None)
        user_index = next((i for i, item in enumerate(lower) if item == "id de usuario"), None)
        amount_index = next((i for i, item in enumerate(lower) if item == "total"), None)
        for row in reader:
            if not match(header, row, search, start, end):
                continue
            count += 1
            if include_rows and (page - 1) * size <= count - 1 < page * size:
                visible.append(row)
            if game_index is not None and game_index < len(row):
                name = row[game_index].strip() or "(sin nombre)"
                games[name] = games.get(name, 0) + 1
            if product_index is not None and product_index < len(row):
                name = row[product_index].strip() or "(sin producto)"
                products[name] = products.get(name, 0) + 1
                bucket = disciplinas.setdefault(name, {"count": 0, "apostado": 0.0, "pagado": 0.0})
                bucket["count"] += 1
                amount = money(row[amount_index]) if amount_index is not None and amount_index < len(row) else 0.0
                if amount < 0:
                    bucket["apostado"] += -amount
                else:
                    bucket["pagado"] += amount
            if user_index is not None and user_index < len(row) and row[user_index]:
                users.add(row[user_index])
    resumen_disciplinas = [
        {"name": name, "count": int(data["count"]), "apostado": data["apostado"], "pagado": data["pagado"], "neto": data["pagado"] - data["apostado"]}
        for name, data in sorted(disciplinas.items(), key=lambda item: item[1]["count"], reverse=True)
    ]
    return {"columns": header, "rows": visible, "total": count, "page": page, "size": size, "file": str(path), "games": sorted(games.items(), key=lambda item: item[1], reverse=True)[:12], "products": sorted(products.items(), key=lambda item: item[1], reverse=True)[:8], "users": len(users), "disciplinas": resumen_disciplinas}


def excel(params: dict[str, list[str]]) -> bytes:
    if Workbook is None:
        raise RuntimeError("Instala openpyxl para descargar Excel")
    data = scan(params, include_rows=False)
    book = Workbook(write_only=True)
    sheet = book.create_sheet("Transacciones")
    sheet.append(data["columns"])
    written = 0
    with csv_open(Path(data["file"])) as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        for row in reader:
            if match(header, row, params.get("search", [""])[0].strip(), params.get("start", [""])[0].strip(), params.get("end", [""])[0].strip()):
                sheet.append(row)
                written += 1
                if written >= MAX_EXCEL_ROWS:
                    break
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, value: object, status: int = 200):
        body = json.dumps(value, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/rows":
                self.send_json(scan(params, include_rows=True))
            elif parsed.path in ("/api/dashboard", "/api/summary"):
                self.send_json(scan(params, include_rows=False))
            elif parsed.path == "/api/meta":
                path = source()
                self.send_json({"database": "CSV actual en línea", "file": str(path), "files": [str(path)], "columns": scan({"size": ["1"]}, True)["columns"]})
            elif parsed.path == "/api/export.xlsx":
                body = excel(params)
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Disposition", "attachment; filename=transacciones_actuales.xlsx")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif parsed.path in ("/", "/index.html"):
                body = (BASE / "visor_transacciones.html").read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_json({"error": "Ruta no encontrada"}, 404)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Dashboard: http://127.0.0.1:{PORT}/")
    for address in sorted(set(socket.gethostbyname_ex(socket.gethostname())[2])):
        if not address.startswith("127."):
            print(f"Compartir: http://{address}:{PORT}/")
    server.serve_forever()
