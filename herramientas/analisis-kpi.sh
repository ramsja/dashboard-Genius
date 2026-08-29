#!/bin/bash
# Re-analisis solo lectura + KPIs de endurecimiento (baseline 2026-08-26 14:43).
set -u
OUT=/mnt/c/Users/Riesgos/kali-lab/analisis-www
REP=/mnt/c/Users/Riesgos/kali-lab/reportes
mkdir -p "$OUT" "$REP"
HOST=www.geniusbet.sv
URLH=https://www.geniusbet.sv/home
URLN=http://www.geniusbet.sv/home
export PYTHONUNBUFFERED=1

echo "============================================================"
echo "  RE-ANALISIS GENIUSBET + KPIs"
echo "  Modo: solo lectura. Sin nmap/hydra."
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"

echo
echo ">>> [1] HTTPS /home"
curl -sI --max-time 15 -A 'KaliLab/kpi' "$URLH" | tee "$OUT/kpi-https-home.txt" | sed 's/^/  /'

echo
echo ">>> [2] HTTP /home (debe ser 301 si aplicaron CDN77)"
curl -sI --max-time 12 -A 'KaliLab/kpi' "$URLN" | tee "$OUT/kpi-http-home.txt" | sed 's/^/  /'

echo
echo ">>> [3] TLS www + apex"
echo "  --- www ---"
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null | sed 's/^/  /'
echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -out "$OUT/kpi-www.pem" -outform PEM 2>/dev/null
echo "  --- apex geniusbet.sv ---"
echo | openssl s_client -connect "geniusbet.sv:443" -servername "geniusbet.sv" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null | sed 's/^/  /' \
  || echo "  (sin cert o timeout)"
echo | openssl s_client -connect "geniusbet.sv:443" -servername "geniusbet.sv" 2>/dev/null \
  | openssl x509 -out "$OUT/kpi-apex.pem" -outform PEM 2>/dev/null || true

python3 -u - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import subprocess, re, json

OUT = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www")
REP = Path("/mnt/c/Users/Riesgos/kali-lab/reportes")
https = (OUT / "kpi-https-home.txt").read_text(errors="replace")
http = (OUT / "kpi-http-home.txt").read_text(errors="replace")
hl, nl = https.lower(), http.lower()

def status(t):
    for ln in t.splitlines():
        if ln.upper().startswith("HTTP/"):
            return ln.strip()
    return "?"

def has(blob, name):
    return name.lower() in blob

def hdr(blob, name):
    for ln in blob.splitlines():
        if ln.lower().startswith(name.lower()+":"):
            return ln.split(":",1)[1].strip()
    return ""

def cert_days(pem):
    p = OUT / pem
    if not p.exists() or p.stat().st_size < 20:
        return None, "sin pem"
    try:
        out = subprocess.check_output(["openssl","x509","-in",str(p),"-noout","-enddate"], text=True)
        s = out.split("=",1)[1].strip()
        try:
            dt = datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        except Exception:
            dt = datetime.strptime(s.replace(" GMT",""), "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
        return (dt - datetime.now(timezone.utc)).days, s
    except Exception as e:
        return None, str(e)

www_days, www_end = cert_days("kpi-www.pem")
apex_days, apex_end = cert_days("kpi-apex.pem")

http_status = status(http)
https_status = status(https)
redir = "location:" in nl and "https://" in nl
hsts = has(hl, "strict-transport-security")
hsts_val = hdr(https, "strict-transport-security")

checks_now = {
    "https_ok": https_status.startswith("HTTP/") and "200" in https_status,
    "http_redir_301": redir and ("301" in http_status or "308" in http_status or "302" in http_status),
    "hsts": hsts,
    "nosniff": has(hl, "x-content-type-options"),
    "xfo": has(hl, "x-frame-options"),
    "referrer": has(hl, "referrer-policy"),
    "permissions": has(hl, "permissions-policy"),
    "coop": has(hl, "cross-origin-opener-policy"),
    "csp_enforce": any(
        ln.lower().startswith("content-security-policy:") and "report-only" not in ln.lower()
        for ln in https.splitlines()
    ),
    "csp_report": any("content-security-policy-report-only" in ln.lower() for ln in https.splitlines()),
    "no_xpb": not has(hl, "x-powered-by"),
    "www_cert_ok": (www_days or -1) >= 14,
    "apex_cert_ok": (apex_days or -1) >= 0,
}

# CSP: report-only counts half
csp_pts = 1.0 if checks_now["csp_enforce"] else (0.5 if checks_now["csp_report"] else 0.0)

# Baseline 2026-08-26 14:43 (analisis anterior)
base = {
    "http_redir_301": False,
    "hsts": False,
    "nosniff": False,
    "xfo": False,
    "referrer": False,
    "permissions": False,
    "coop": False,
    "csp_pts": 0.0,
    "no_xpb": False,
    "www_cert_ok": True,   # vigente
    "apex_cert_ok": False, # vencido 18 ago
}

# KPI weights (sum 100)
weights = [
    ("KPI-01 HTTP redirige a HTTPS", "http_redir_301", 20),
    ("KPI-02 HSTS", "hsts", 15),
    ("KPI-03 nosniff", "nosniff", 8),
    ("KPI-04 X-Frame-Options", "xfo", 8),
    ("KPI-05 Referrer-Policy", "referrer", 6),
    ("KPI-06 Permissions-Policy", "permissions", 5),
    ("KPI-07 COOP", "coop", 5),
    ("KPI-08 CSP (0.5 report / 1 enforce)", "csp", 12),
    ("KPI-09 Sin X-Powered-By", "no_xpb", 6),
    ("KPI-10 Cert www vigente (>=14d)", "www_cert_ok", 7),
    ("KPI-11 Cert apex vigente", "apex_cert_ok", 8),
]

def pts(key, now=True):
    if key == "csp":
        return csp_pts if now else base["csp_pts"]
    src = checks_now if now else base
    if key == "csp":
        return src.get("csp_pts", 0)
    return 1.0 if src.get(key) else 0.0

score_now = 0.0
score_base = 0.0
rows = []
print()
print("-" * 60)
print(">>> KPIs  (antes 26-ago 14:43  vs  ahora)")
print("-" * 60)
print(f"  {'KPI':<42} {'antes':>6} {'ahora':>6} {'meta':>5}")
print("  " + "-" * 62)
for name, key, w in weights:
    a = pts(key, False) * w
    b = pts(key, True) * w
    score_base += a
    score_now += b
    flag = "MEJORA" if b > a else ("IGUAL" if b == a else "PEOR")
    print(f"  {name:<42} {a:5.0f}/{w:<2} {b:5.0f}/{w:<2} {flag}")
    rows.append((name, w, a, b, flag))

delta = score_now - score_base
print()
print(f"  INDICE DE ENDURECIMIENTO")
print(f"    antes : {score_base:.0f} / 100")
print(f"    ahora : {score_now:.0f} / 100")
print(f"    delta : {delta:+.0f} puntos")
if score_now >= 80:
    nivel = "BUENO"
elif score_now >= 50:
    nivel = "MEDIO"
elif score_now >= 25:
    nivel = "BAJO"
else:
    nivel = "CRITICO"
print(f"    nivel : {nivel}")

print()
print(">>> Detalle tecnico ahora")
print(f"  HTTPS /home : {https_status}")
print(f"  HTTP  /home : {http_status}")
print(f"  Location    : {hdr(http,'location') or '(ninguna)'}")
print(f"  HSTS        : {hsts_val or 'NO'}")
print(f"  Server      : {hdr(https,'server')}")
print(f"  X-Powered-By: {hdr(https,'x-powered-by') or '(oculto)'}")
print(f"  cert www    : {www_days} dias  ({www_end})")
print(f"  cert apex   : {apex_days} dias  ({apex_end})")

faltan = []
if not checks_now["http_redir_301"]:
    faltan.append("activar HTTPS redirect 301 en CDN77")
if not checks_now["hsts"]:
    faltan.append("pegar Strict-Transport-Security max-age=300")
if not checks_now["nosniff"]:
    faltan.append("pegar X-Content-Type-Options: nosniff")
if not checks_now["xfo"]:
    faltan.append("pegar X-Frame-Options: SAMEORIGIN")
if not checks_now["referrer"]:
    faltan.append("pegar Referrer-Policy")
if not checks_now["permissions"]:
    faltan.append("pegar Permissions-Policy")
if not checks_now["coop"]:
    faltan.append("pegar Cross-Origin-Opener-Policy")
if not checks_now["csp_enforce"] and not checks_now["csp_report"]:
    faltan.append("pegar CSP-Report-Only")
if not checks_now["no_xpb"]:
    faltan.append("poweredByHeader: false en Next.js")
if not checks_now["apex_cert_ok"]:
    faltan.append("renovar certificado geniusbet.sv (apex)")

print()
print(">>> Pendiente de implementar")
if not faltan:
    print("  (nada: checklist cubierto)")
for x in faltan:
    print("  -", x)

# En que influye el score
print()
print(">>> En que influye este numero")
print("  0-24  CRITICO : Wi-Fi sucio y paginas falsas faciles; cert roto")
print("  25-49 BAJO    : candado a medias; marca facil de incrustar")
print("  50-79 MEDIO   : lo urgente hecho; falta CSP/apex/HSTS largo")
print("  80-100 BUENO  : endurecimiento de borde listo para produccion")

stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
path = REP / f"kpi-geniusbet-{stamp}.txt"
lines = [
    f"KPIs GENIUSBET {stamp}",
    f"indice_antes={score_base:.0f}",
    f"indice_ahora={score_now:.0f}",
    f"delta={delta:+.0f}",
    f"nivel={nivel}",
    f"https={https_status}",
    f"http={http_status}",
    f"hsts={hsts_val or 'NO'}",
    f"www_dias={www_days}",
    f"apex_dias={apex_days}",
    "",
]
for name, w, a, b, flag in rows:
    lines.append(f"{flag}\t{name}\t{a:.0f}->{b:.0f}/{w}")
lines.append("")
lines.append("pendiente:")
lines.extend("  - "+x for x in faltan)
path.write_text("\n".join(lines)+"\n", encoding="utf-8")
print()
print("=" * 60)
print("  FIN KPIs")
print(f"  {path}")
print("=" * 60)
PY
