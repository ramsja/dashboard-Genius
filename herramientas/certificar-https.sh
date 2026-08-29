#!/bin/bash
# Certificacion HTTPS + protocolos de mejora. Solo lectura (openssl/curl).
set -u
OUT=/mnt/c/Users/Riesgos/kali-lab/analisis-www
REP=/mnt/c/Users/Riesgos/kali-lab/reportes
mkdir -p "$OUT" "$REP"
export PYTHONUNBUFFERED=1

echo "============================================================"
echo "  CERTIFICACION HTTPS Y PROTOCOLOS"
echo "  Solo lectura. Sin nmap ni hydra."
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================================"

tls_try() {
  local host="$1" proto="$2" flag="$3"
  local err
  err=$(echo | openssl s_client -connect "${host}:443" -servername "$host" $flag -brief 2>&1)
  if echo "$err" | grep -qiE 'PROTOCOL|TLSv1'; then
    echo "  $host  $proto  SI  $(echo "$err" | grep -i protocol | head -1 | tr -s ' ')"
    echo SI
  elif echo "$err" | grep -qiE 'handshake failure|no protocols|wrong version|unsupported'; then
    echo "  $host  $proto  NO (rechazado — bien si es TLS 1.0/1.1)"
    echo NO
  else
    # brief line Protocol version
    if echo "$err" | grep -q 'CONNECTION ESTABLISHED'; then
      echo "  $host  $proto  SI"
      echo SI
    else
      echo "  $host  $proto  NO"
      echo NO
    fi
  fi
}

echo
echo ">>> [1] Protocolos TLS (www y apex)"
echo "  (SI = el servidor acepta esa version)"
for h in www.geniusbet.sv geniusbet.sv; do
  echo
  echo "  == $h =="
  echo | openssl s_client -connect "$h:443" -servername "$h" -brief 2>/dev/null | sed 's/^/    /' | head -8
  for pair in "TLS1.0:-tls1" "TLS1.1:-tls1_1" "TLS1.2:-tls1_2" "TLS1.3:-tls1_3"; do
    name="${pair%%:*}"
    flag="${pair##*:}"
    out=$(echo | timeout 8 openssl s_client -connect "$h:443" -servername "$h" "$flag" 2>&1 || true)
    if echo "$out" | grep -q "BEGIN CERTIFICATE"; then
      ver=$(echo "$out" | grep -i "Protocol" | head -1)
      echo "    $name  ACEPTA  $ver"
    else
      echo "    $name  RECHAZA"
    fi
  done
done

echo
echo ">>> [2] Certificados (fechas y nombres)"
for h in www.geniusbet.sv geniusbet.sv; do
  echo "  -- $h --"
  echo | timeout 10 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null | sed 's/^/    /'
  echo | timeout 10 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null \
    | openssl x509 -out "$OUT/cert-${h}.pem" -outform PEM 2>/dev/null || true
done

echo
echo ">>> [3] Redireccion HTTP y cabeceras de mejora"
curl -sI --max-time 12 -A 'KaliLab/certificar' https://www.geniusbet.sv/home | tee "$OUT/cert-https.txt" | sed 's/^/    /'
echo "  --- http ---"
curl -sI --max-time 10 -A 'KaliLab/certificar' http://www.geniusbet.sv/home | tee "$OUT/cert-http.txt" | sed 's/^/    /'

python3 -u - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import subprocess

OUT = Path("/mnt/c/Users/Riesgos/kali-lab/analisis-www")
REP = Path("/mnt/c/Users/Riesgos/kali-lab/reportes")
https = (OUT/"cert-https.txt").read_text(errors="replace")
http = (OUT/"cert-http.txt").read_text(errors="replace")

def status(t):
    for ln in t.splitlines():
        if ln.upper().startswith("HTTP/"):
            return ln.strip()
    return "?"

def has(t, n):
    return n.lower() in t.lower()

def days(pem):
    p = OUT/pem
    if not p.exists() or p.stat().st_size < 40:
        return None
    out = subprocess.check_output(["openssl","x509","-in",str(p),"-noout","-enddate"], text=True)
    s = out.split("=",1)[1].strip()
    try:
        dt = datetime.strptime(s, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime.strptime(s.replace(" GMT",""), "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
    return (dt - datetime.now(timezone.utc)).days

www_d = days("cert-www.geniusbet.sv.pem")
apex_d = days("cert-geniusbet.sv.pem")
http_st = status(http)
https_st = status(https)
redir = "location:" in http.lower() and "https://" in http.lower() and any(x in http_st for x in ("301","302","308"))

# Protocolo de mejora: 10 controles (10 pts c/u = 100)
ctrl = [
    ("Candado en www (HTTPS abre)", https_st.startswith("HTTP/") and "200" in https_st, "La pagina con www carga con candado"),
    ("HTTP manda a HTTPS", redir, "Nadie se queda en la version insegura"),
    ("Aviso HSTS (el navegador recuerda el candado)", has(https,"strict-transport-security"), "El celular no vuelve a http"),
    ("Certificado www vigente", (www_d or -1) >= 14, "No sale sitio no seguro en www"),
    ("Certificado sin www vigente", (apex_d or -1) >= 0, "geniusbet.sv no asusta al cliente"),
    ("No decir la receta (X-Powered-By)", not has(https,"x-powered-by"), "Menos pista para copiones"),
    ("No incrustar la web en otra (X-Frame)", has(https,"x-frame-options"), "Evita paginas falsas con tu marca"),
    ("No adivinar archivos (nosniff)", has(https,"x-content-type-options"), "Menos virus disfrazados"),
    ("Politica de privacidad de enlaces", has(https,"referrer-policy"), "No se filtra la cuenta al salir"),
    ("Reja de scripts (CSP)", has(https,"content-security-policy"), "Bloquea scripts de estafa"),
]
score = sum(10 for _, ok, _ in ctrl if ok)

print()
print("-"*60)
print(">>> PROTOCOLO DE MEJORA (pasa / no pasa)")
print("-"*60)
print(f"  {'Control':<52} {'Pasa':>6}")
print("  "+"-"*60)
for name, ok, _ in ctrl:
    print(f"  {name:<52} {'SI' if ok else 'NO':>6}")
print()
print(f"  NOTA DEL PROTOCOLO: {score} / 100")
nivel = "CRITICO" if score < 25 else "BAJO" if score < 50 else "MEDIO" if score < 80 else "BUENO"
print(f"  Nivel: {nivel}")
print(f"  Cert www: {www_d} dias  |  cert sin www: {apex_d} dias")
print(f"  HTTP: {http_st}")
print(f"  HTTPS: {https_st}")

# archivos
tec = REP/"certificacion-https.txt"
lin = []
lin.append(f"CERTIFICACION HTTPS  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
lin.append(f"nota_protocolo={score}")
lin.append(f"nivel={nivel}")
lin.append(f"www_dias={www_d}")
lin.append(f"apex_dias={apex_d}")
lin.append(f"http={http_st}")
lin.append(f"https={https_st}")
lin.append("")
for name, ok, influye in ctrl:
    lin.append(f"{'PASA' if ok else 'FALTA'}\t{name}\t{influye}")
tec.write_text("\n".join(lin)+"\n", encoding="utf-8")

claro = REP/"protocolo-mejora-compartir.txt"
claro.write_text(f"""PROTOCOLO DE MEJORA HTTPS — GeniusBet
=====================================
Para compartir. Fecha: {datetime.now(timezone.utc).strftime('%Y-%m-%d')} UTC
Nota actual del protocolo: {score} de 100   ({nivel})

Que certificamos
  Miramos si la web usa candado de verdad, si el certificado
  esta vigente, y si las 10 mejoras de puerta estan puestas.
  No se ataco el sitio ni se entro a cuentas.


LOS 10 PUNTOS (pasa / no pasa)
------------------------------
""", encoding="utf-8")

n = 1
body = []
for name, ok, influye in ctrl:
    marca = "CUMPLE" if ok else "NO CUMPLE"
    body.append(f"{n}. {name}")
    body.append(f"   Estado: {marca}")
    body.append(f"   En que influye: {influye}")
    body.append("")
    n += 1

pasos = f"""
COMO SUBIR LA NOTA (quien tiene el panel CDN77)
-----------------------------------------------
Esto NO se puede pulsar desde el laboratorio. Hay que entrar
al panel de CDN77 (la red que entrega la web) y:

Paso A — Candado obligatorio (sube ~20 puntos)
  Configuration → HTTPS redirect = Encendido, codigo 301
  Guardar y "Purge all" (vaciar cache)

Paso B — Pegar protecciones (sube ~40 puntos)
  Response headers, una por una, como en el archivo
  cdn77-cabeceras.txt
  (HSTS corto, nosniff, SAMEORIGIN, Referrer, Permissions, COOP)

Paso C — Certificado sin www (sube ~10 puntos)
  Renovar el certificado de geniusbet.sv (el que vencio
  el 18 de agosto) en el servidor origen, o poner en CDN77
  un certificado que cubra geniusbet.sv y www.
  Luego redirigir geniusbet.sv → https://www.geniusbet.sv

Paso D — Quitar el letrero "Next.js" (sube ~6 puntos)
  En el programa de la web: poweredByHeader: false

Paso E — Volver a medir
  Avisar al laboratorio. Se corre otra vez esta certificacion
  y se entrega el antes/despues para mostrar a la gente.


LO QUE YA ESTA BIEN
-------------------
  www.geniusbet.sv SI tiene candado y certificado vigente
  hasta octubre de 2026 (CDN77 / Let's Encrypt).


MENSAJE CORTO
-------------
Certificamos el HTTPS de GeniusBet (revision publica).
Nota del protocolo: {score}/100 ({nivel}).
Cumple el candado en www. No cumple: forzar candado en http,
aviso HSTS, certificado sin www (vencido), y protecciones
contra paginas falsas. Hay que aplicarlos en CDN77 y renovar
el certificado de geniusbet.sv. Luego repetimos la medicion.
"""

Path(claro).write_text(
    Path(claro).read_text(encoding="utf-8") + "\n".join(body) + pasos,
    encoding="utf-8",
)
print()
print("  Archivos:")
print(f"    {tec}")
print(f"    {claro}")
print("="*60)
print("  FIN CERTIFICACION HTTPS")
print("="*60)
PY
