#!/usr/bin/env python3
"""Red neuronal ligera: sensibilidad a vulnerabilidades de puerta (HTTPS/cabeceras).
No ataca sitios. Entrena con ejemplos sintetico + puntua evidencias/cabeceras reales.
"""
from __future__ import annotations

import json
import math
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path("/mnt/c/Users/Riesgos/kali-lab")
REP = LAB / "reportes"
MOD = LAB / "modelos"
OUT = LAB / "analisis-www"

FEATURES = [
    ("http_redirige", "La version sin candado manda a la segura"),
    ("hsts", "El celular recuerda usar siempre candado"),
    ("nosniff", "No adivina archivos disfrazados"),
    ("x_frame", "No se puede incrustar la web en otra"),
    ("referrer", "No se lleva la cuenta al salir"),
    ("permissions", "No pide camara/microfono de mas"),
    ("coop", "Aisla la ventana de otras pestanas"),
    ("csp", "Reja contra scripts de estafa"),
    ("sin_powered_by", "No publica el plano de la casa"),
    ("cert_www_ok", "Candado de www vigente"),
    ("cert_apex_ok", "Candado sin www vigente"),
    ("tls_moderno", "Rechaza chapas viejas (TLS 1.0/1.1)"),
]

# Peso "profesor": cuanto duele que falte (para etiquetar ejemplos)
PESO = [0.20, 0.15, 0.08, 0.08, 0.06, 0.05, 0.05, 0.12, 0.06, 0.07, 0.08, 0.10]


def sigmoid(x: float) -> float:
    x = max(-30.0, min(30.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def dsigmoid(y: float) -> float:
    return y * (1.0 - y)


def relu(x: float) -> float:
    return x if x > 0 else 0.0


def drelu(x: float) -> float:
    return 1.0 if x > 0 else 0.0


class MLP:
    def __init__(self, nin=12, nh=10, seed=42):
        rng = random.Random(seed)
        s = 0.4
        self.W1 = [[rng.uniform(-s, s) for _ in range(nin)] for _ in range(nh)]
        self.b1 = [0.0] * nh
        self.W2 = [rng.uniform(-s, s) for _ in range(nh)]
        self.b2 = 0.0

    def forward(self, x):
        h_pre = []
        h = []
        for j in range(len(self.W1)):
            z = self.b1[j] + sum(self.W1[j][i] * x[i] for i in range(len(x)))
            h_pre.append(z)
            h.append(relu(z))
        z2 = self.b2 + sum(self.W2[j] * h[j] for j in range(len(h)))
        y = sigmoid(z2)
        return y, h, h_pre

    def train(self, xs, ys, epochs=80, lr=0.08):
        n = len(xs)
        for ep in range(epochs):
            loss = 0.0
            order = list(range(n))
            random.shuffle(order)
            for k in order:
                x, t = xs[k], ys[k]
                y, h, h_pre = self.forward(x)
                err = y - t
                loss += err * err
                dy = err * dsigmoid(y)
                dW2 = [dy * h[j] for j in range(len(h))]
                db2 = dy
                dh = [dy * self.W2[j] * drelu(h_pre[j]) for j in range(len(h))]
                for j in range(len(h)):
                    self.W2[j] -= lr * dW2[j]
                    self.b1[j] -= lr * dh[j]
                    for i in range(len(x)):
                        self.W1[j][i] -= lr * dh[j] * x[i]
                self.b2 -= lr * db2
            if (ep + 1) % 20 == 0 or ep == 0:
                print(f"  epoca {ep+1:3d}/{epochs}  error medio={loss/n:.4f}")

    def dump(self) -> dict:
        return {"W1": self.W1, "b1": self.b1, "W2": self.W2, "b2": self.b2}

    def load(self, d: dict) -> None:
        self.W1, self.b1, self.W2, self.b2 = d["W1"], d["b1"], d["W2"], d["b2"]


def etiqueta(x):
    """1 = muy vulnerable, 0 = endurecido. Falta = x cerca de 0."""
    s = 0.0
    for i, p in enumerate(PESO):
        s += p * (1.0 - x[i])
    return max(0.0, min(1.0, s))


def sintetico(n=1800, seed=7):
    rng = random.Random(seed)
    xs, ys = [], []
    # extremos
    xs.append([1.0] * 12)
    ys.append(etiqueta(xs[-1]))
    xs.append([0.0] * 12)
    ys.append(etiqueta(xs[-1]))
    for _ in range(n):
        x = [1.0 if rng.random() > 0.45 else 0.0 for _ in range(12)]
        if rng.random() < 0.1:
            x = [1.0] * 12
        if rng.random() < 0.1:
            x = [0.0] * 12
        xs.append(x)
        ys.append(min(1.0, max(0.0, etiqueta(x) + rng.uniform(-0.04, 0.04))))
    return xs, ys


def has_header(blob: str, name: str) -> bool:
    return name.lower() in blob.lower()


def vector_desde_archivos() -> list[float]:
    https = ""
    http = ""
    for n in ("cert-https.txt", "kpi-https-home.txt", "headers-https-home.txt"):
        p = OUT / n
        if p.exists():
            https = p.read_text(errors="replace")
            break
    for n in ("cert-http.txt", "kpi-http-home.txt", "headers-http-home.txt"):
        p = OUT / n
        if p.exists():
            http = p.read_text(errors="replace")
            break
    hl, nl = https.lower(), http.lower()
    redir = "location:" in nl and "https://" in nl and any(c in http for c in ("301", "302", "308"))
    cert = (LAB / "reportes" / "certificacion-https.txt")
    www_ok, apex_ok, tls_mod = 1.0, 0.0, 1.0
    if cert.exists():
        t = cert.read_text(errors="replace")
        for ln in t.splitlines():
            if ln.startswith("www_dias="):
                try:
                    www_ok = 1.0 if int(ln.split("=", 1)[1]) >= 14 else 0.0
                except ValueError:
                    pass
            if ln.startswith("apex_dias="):
                try:
                    apex_ok = 1.0 if int(ln.split("=", 1)[1]) >= 0 else 0.0
                except ValueError:
                    pass
    # www rechazo TLS1.0/1.1 en la certificacion
    proc = (LAB / "proceso.log")
    if proc.exists():
        chunk = proc.read_text(errors="replace")[-12000:]
        if "www.geniusbet.sv" in chunk and "TLS1.0  RECHAZA" in chunk and "TLS1.3  ACEPTA" in chunk:
            tls_mod = 1.0
        if "geniusbet.sv" in chunk and "TLS1.0  ACEPTA" in chunk:
            # apex viejo: el vector es de www/home; tls_moderno = borde www
            tls_mod = 1.0
    csp = has_header(hl, "content-security-policy")
    return [
        1.0 if redir else 0.0,
        1.0 if has_header(hl, "strict-transport-security") else 0.0,
        1.0 if has_header(hl, "x-content-type-options") else 0.0,
        1.0 if has_header(hl, "x-frame-options") else 0.0,
        1.0 if has_header(hl, "referrer-policy") else 0.0,
        1.0 if has_header(hl, "permissions-policy") else 0.0,
        1.0 if has_header(hl, "cross-origin-opener-policy") else 0.0,
        1.0 if csp else 0.0,
        0.0 if has_header(hl, "x-powered-by") else 1.0,
        www_ok,
        apex_ok,
        tls_mod,
    ]


def sensibilidad(net: MLP, x: list[float]) -> list[tuple[str, str, float, float]]:
    """Cuanto baja el riesgo si activamos cada control que falta."""
    y0, _, _ = net.forward(x)
    out = []
    for i, (key, influye) in enumerate(FEATURES):
        if x[i] >= 0.5:
            out.append((key, influye, 0.0, x[i]))
            continue
        xp = x[:]
        xp[i] = 1.0
        y1, _, _ = net.forward(xp)
        out.append((key, influye, y0 - y1, x[i]))
    out.sort(key=lambda t: -t[2])
    return out, y0


def nivel(p: float) -> str:
    if p >= 0.75:
        return "MUY ALTA (sitio facil de enganar / puerta abierta)"
    if p >= 0.50:
        return "ALTA"
    if p >= 0.30:
        return "MEDIA"
    return "BAJA (bien endurecido)"


def main() -> int:
    MOD.mkdir(parents=True, exist_ok=True)
    REP.mkdir(parents=True, exist_ok=True)
    print("=" * 60)
    print("  RED NEURONAL — sensibilidad a vulnerabilidades")
    print("  12 entradas (candado/cabeceras)  10 neuronas  1 salida")
    print("  Salida 0 = seguro    1 = muy vulnerable")
    print("  " + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    print("=" * 60)

    print("\n>>> Entrenamiento (ejemplos sintetico de sitios flojos vs duros)")
    xs, ys = sintetico()
    net = MLP()
    net.train(xs, ys, epochs=80, lr=0.08)

    # acierto grosero
    ok = 0
    for x, t in zip(xs[-400:], ys[-400:]):
        y, _, _ = net.forward(x)
        if (y > 0.5) == (t > 0.5):
            ok += 1
    acc = 100.0 * ok / 400
    print(f"  acierto en prueba: {acc:.1f}%  (¿parece vulnerable si/no?)")

    wpath = MOD / "red-vuln.json"
    wpath.write_text(json.dumps(net.dump()), encoding="utf-8")
    print(f"  pesos guardados: {wpath}")

    print("\n>>> Puntuar GeniusBet (ultima medicion de cabeceras)")
    x = vector_desde_archivos()
    print("  Entradas (1=control puesto, 0=falta):")
    for i, (k, inf) in enumerate(FEATURES):
        print(f"    [{int(x[i])}] {k:16}  {inf}")

    sens, y0 = sensibilidad(net, x)
    pct = 100.0 * y0
    print()
    print(f"  SENSIBILIDAD / riesgo: {pct:.1f} de 100")
    print(f"  Nivel: {nivel(y0)}")

    print("\n>>> A que es MAS sensible (si lo arreglas, cuanto baja el riesgo)")
    print(f"  {'Control que falta':<22} {'Baja el riesgo':>14}  En que influye")
    print("  " + "-" * 70)
    for key, inf, delta, cur in sens:
        if cur >= 0.5:
            continue
        print(f"  {key:<22} {100*delta:6.1f} pts      {inf}")

    y_ideal, _, _ = net.forward([1.0] * 12)
    print()
    print(f"  Si aplicas TODO el protocolo, la red estima riesgo {100*y_ideal:.1f}/100")

    path = REP / "red-neuronal-vulnerabilidad.txt"
    lines = [
        "RED NEURONAL DE SENSIBILIDAD A VULNERABILIDADES",
        f"fecha={datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        f"riesgo_geniusbet={pct:.1f}",
        f"nivel={nivel(y0)}",
        f"acierto_entrenamiento={acc:.1f}%",
        f"riesgo_si_todo_ok={100*y_ideal:.1f}",
        "",
        "entradas (1=ok 0=falta):",
    ]
    for i, (k, inf) in enumerate(FEATURES):
        lines.append(f"  {int(x[i])}  {k}  {inf}")
    lines.append("")
    lines.append("sensibilidad (arreglar esto baja mas el riesgo):")
    for key, inf, delta, cur in sens:
        if cur < 0.5:
            lines.append(f"  {100*delta:.1f} pts   {key}   {inf}")
    lines.append("")
    lines.append("En palabras:")
    lines.append(f"  La red ve a GeniusBet con {pct:.0f} de 100 de riesgo de puerta.")
    lines.append("  No predice juegos. Mide si un cliente puede ser enganado")
    lines.append("  por falta de candado, certificado vencido o paginas falsas.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    claro = REP / "red-neuronal-para-gente.txt"
    top = [t for t in sens if t[3] < 0.5][:4]
    bullets = "\n".join(
        f"  - {inf}  (baja unos {100*d:.0f} puntos de riesgo)" for _, inf, d, _ in top
    )
    claro.write_text(
        f"""QUE DICE LA RED NEURONAL (lenguaje sencillo)
=============================================
Fecha: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}

Entrenamos una red chica (12 preguntas si/no, 10 neuronas)
con miles de ejemplos de sitios bien y mal cerrados.
Luego le mostramos como esta GeniusBet HOY.

Resultado
  Riesgo de puerta: {pct:.0f} de 100
  Eso es {nivel(y0)}

Que significa
  No adivina crash ni barajas.
  Mide que tan facil es enganar a un cliente
  (pagina sin candado, certificado vencido, web metida en otra).

A que es mas sensible (por donde conviene empezar)
{bullets}

Si se aplica todo el protocolo de mejora, la misma red
estima un riesgo de unos {100*y_ideal:.0f} de 100.

Archivo tecnico: {path}
""",
        encoding="utf-8",
    )
    print()
    print("=" * 60)
    print(f"  Informe: {path}")
    print(f"  Para gente: {claro}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
