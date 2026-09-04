#!/usr/bin/env python3
"""Login de laboratorio con panel en vivo. SOLO 0.0.0.0:18080 / 127.0.0.1."""
from __future__ import annotations

import html
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, unquote_plus

HOST = "0.0.0.0"
PORT = int(os.environ.get("LAB_LOGIN_PORT", "18080"))
USER = "labuser"
PASS = "labpass"
LOG = os.environ.get(
    "LAB_LOGIN_LOG",
    "/mnt/c/Users/Riesgos/kali-lab/evidencias/demo-login.log",
)
EVENTS: list[str] = []


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def log_line(ip: str, user: str, pw: str, ok: bool) -> None:
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%d/%b/%Y:%H:%M:%S +0000")
    code = 200 if ok else 401
    line = f'{ip} - {user} [{ts}] "POST /login HTTP/1.1" {code} 4 "-" "lab-demo"\n'
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line)
    shown = (pw[:12] + "…") if len(pw) > 12 else pw
    msg = (
        f"{stamp()}  {ip}  user={user or '(vacio)'}  pass={shown}  "
        f"{'ACEPTADO' if ok else 'RECHAZADO'}"
    )
    EVENTS.append(msg)
    print(msg, flush=True)


def page() -> bytes:
    rows = EVENTS[-40:][::-1]
    if rows:
        body_log = "\n".join(html.escape(x) for x in rows)
    else:
        body_log = "(esperando intentos de Hydra o del formulario…)"
    n_fail = sum(1 for x in EVENTS if "RECHAZADO" in x)
    n_ok = sum(1 for x in EVENTS if "ACEPTADO" in x)
    html_doc = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="1"/>
  <title>LAB LOGIN — ataque en vivo</title>
  <style>
    body {{ margin:0; background:#0b100b; color:#9f6; font-family:Consolas,monospace; }}
    .wrap {{ display:flex; gap:24px; padding:24px; }}
    .card {{ background:#121a12; border:1px solid #2a4a2a; padding:20px; width:360px; }}
    h1 {{ color:#6f6; font-size:18px; margin:0 0 12px; }}
    label {{ display:block; margin:10px 0 4px; color:#8c8; }}
    input {{ width:100%; padding:8px; background:#0a0; color:#cfc; border:1px solid #3a3; box-sizing:border-box; }}
    button {{ margin-top:14px; padding:8px 16px; background:#163; color:#cfc; border:1px solid #4a4; cursor:pointer; }}
    .log {{ flex:1; background:#050805; border:1px solid #2a4a2a; padding:16px; overflow:auto; height:70vh; white-space:pre; }}
    .ok {{ color:#6f6; }} .bad {{ color:#f66; }}
    .meta {{ color:#8a8; font-size:12px; margin-bottom:10px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>LOGIN DE LABORATORIO</h1>
      <div class="meta">127.0.0.1:18080 — no es GeniusBet<br/>
      usuario demo: labuser</div>
      <form method="POST" action="/login">
        <label>Usuario</label>
        <input name="user" autocomplete="off"/>
        <label>Clave</label>
        <input name="pass" type="password"/>
        <button>Entrar</button>
      </form>
      <p class="meta">Fallos: {n_fail} &nbsp; Aciertos: {n_ok}<br/>
      Esta pagina se refresca sola cada 1 s.</p>
    </div>
    <div class="log"><b>INTENTOS EN VIVO</b>\n\n{body_log}</div>
  </div>
</body>
</html>"""
    return html_doc.encode("utf-8")


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(page())

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(n).decode("utf-8", "replace")
        fields = {k: unquote_plus(v[0]) for k, v in parse_qs(raw, keep_blank_values=True).items()}
        user = fields.get("user", "")
        pw = fields.get("pass", "")
        ok = user == USER and pw == PASS
        log_line(self.client_address[0], user, pw, ok)
        time.sleep(0.35)
        accept = "text/html" in (self.headers.get("Accept") or "")
        self.send_response(200)
        if accept:
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(page())
        else:
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK" if ok else b"FAIL")


if __name__ == "__main__":
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    print(f"demo-login http://127.0.0.1:{PORT}/  user={USER} pass={PASS}", flush=True)
    HTTPServer((HOST, PORT), H).serve_forever()
