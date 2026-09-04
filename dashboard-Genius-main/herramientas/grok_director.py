#!/usr/bin/env python3
"""Director Grok: conecta el lab y ejecuta solo lo que permiten las directivas."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path("/mnt/c/Users/Riesgos/kali-lab")
CX = LAB / "conexion"
ESTADO = CX / "ESTADO.txt"
ORDEN = CX / "orden.txt"
DONE = CX / "done"
REPORTES = LAB / "reportes"
EVID = LAB / "evidencias"

BLOQUEADOS = (
    "geniusbet.sv",
    "www.geniusbet.sv",
    "51.15.150.4",
)
LOCAL_OK = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}

SCRIPTS = {
    "P0": LAB / "herramientas" / "inventario.sh",
    "P1": LAB / "herramientas" / "localizar-ip.sh",
    "P2": LAB / "herramientas" / "detectar-fuerza-bruta.sh",
    "P3": LAB / "herramientas" / "extraer-datos.sh",
    "P4": LAB / "herramientas" / "demo-fuerza-bruta-local.sh",
    "P5": LAB / "check-lab.sh",
    "P7": LAB / "pruebas-lab.sh",
    "MIP": LAB / "herramientas" / "mi-ip.sh",
    "P10": LAB / "herramientas" / "informe-forense.sh",
    "P11": LAB / "herramientas" / "auditoria-lab.sh",
    "P12": LAB / "herramientas" / "pcap-forense.sh",
}


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def write_estado(ultima: str, extra: str = "") -> None:
    CX.mkdir(parents=True, exist_ok=True)
    DONE.mkdir(parents=True, exist_ok=True)
    lines = [
        "ESTADO=CONECTADO",
        "DIRECTOR=Grok",
        f"DESDE={now()}",
        "DIRECTIVAS=00-SCOPE.txt",
        f"ULTIMA={ultima}",
        extra.strip(),
        "",
    ]
    ESTADO.write_text("\n".join(x for x in lines if x is not None) + "\n", encoding="utf-8")


def bloqueado(texto: str) -> str | None:
    low = texto.lower()
    for b in BLOQUEADOS:
        if b in low:
            return b
    if re.search(r"\b(exploit|msfconsole|meterpreter|ransomware|payload\.exe)\b", low):
        return "herramienta ofensiva prohibida"
    return None


def run_script(title: str, script: Path, args: list[str]) -> int:
    cmd = ["bash", str(script), *args]
    print(f"  director ejecuta: {title}")
    print(f"  {' '.join(cmd)}")
    p = subprocess.run(cmd)
    return p.returncode


def refuse(why: str) -> int:
    print()
    print("  RECHAZADO POR DIRECTIVAS")
    print(f"  motivo: {why}")
    print("  ver: /mnt/c/Users/Riesgos/kali-lab/00-SCOPE.txt")
    write_estado(f"RECHAZADO {why[:80]}")
    return 2


def dispatch(proc: str, args: list[str]) -> int:
    proc = proc.upper()
    blob = " ".join([proc, *args])
    hit = bloqueado(blob)
    if hit:
        return refuse(f"objetivo/herramienta bloqueada: {hit}")

    if proc == "P8":
        return refuse("P8 apunta a geniusbet.sv — fuera de alcance sin autorizacion escrita")

    if proc == "P4":
        dest = args[0] if args else "127.0.0.1"
        if dest not in LOCAL_OK:
            return refuse(f"hydra solo localhost, no {dest}")
        args = []

    if proc == "P7":
        if any(bloqueado(a) for a in args):
            return refuse("pruebas locales no aceptan ese objetivo")

    if proc == "P1" and args:
        for a in args:
            if a in LOCAL_OK:
                continue
            if bloqueado(a):
                return refuse(f"no localizar host bloqueado {a}")

    if proc == "P2" and not args:
        args = [str(EVID)]
    if proc == "P3" and not args:
        args = [str(EVID)]
    if proc == "P1" and not args:
        args = ["1.1.1.1"]

    if proc == "CICLO":
        return ciclo()
    if proc == "CONECTAR":
        return conectar()
    if proc == "MIP":
        return run_script("Mi IP publica", SCRIPTS["MIP"], [])

    path = SCRIPTS.get(proc)
    if not path:
        return refuse(f"proceso desconocido: {proc}")
    if not path.exists():
        return refuse(f"falta script {path}")
    titles = {
        "P0": "Listar procesos",
        "P1": f"Localizar IP {' '.join(args)}",
        "P2": "Detectar fuerza bruta",
        "P3": "Extraer datos",
        "P4": "Demo fuerza bruta LOCAL",
        "P5": "Estado del lab",
        "P7": "Pruebas locales",
    }
    rc = run_script(titles.get(proc, proc), path, args)
    write_estado(f"{proc} rc={rc}")
    return rc


def ips_alto() -> list[str]:
    files = sorted(REPORTES.glob("fuerza-bruta-*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return []
    ips = []
    for ln in files[0].read_text(errors="replace").splitlines():
        if ln.startswith("ALTO"):
            m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", ln)
            if m and m.group(1) not in ips:
                ips.append(m.group(1))
    return ips[:3]


def conectar() -> int:
    CX.mkdir(parents=True, exist_ok=True)
    DONE.mkdir(parents=True, exist_ok=True)
    write_estado("handshake")
    print("=" * 60)
    print("  CONEXION GROK  <->  KALI LINUX LAB")
    print(f"  {now()}")
    print("=" * 60)
    print()
    print("  Director     : Grok")
    print("  Canal        : conexion/ESTADO.txt + conexion/orden.txt")
    print("  Directivas   : 00-SCOPE.txt")
    print("  Estado       : CONECTADO")
    print()
    print("  Permitido    : forense evidencias, localhost, WHOIS/geo")
    print("  Bloqueado    : geniusbet.sv, 51.15.150.4, hydra remoto, exploits")
    print()
    scope = LAB / "00-SCOPE.txt"
    if scope.exists():
        print("  --- directivas cargadas ---")
        for ln in scope.read_text(encoding="utf-8", errors="replace").splitlines()[:22]:
            print("   ", ln)
    print()
    print("  Lab listo. Grok dirige el siguiente ciclo.")
    print("=" * 60)
    return 0


def ciclo() -> int:
    conectar()
    print()
    print("-" * 60)
    print(">>> CICLO DIRIGIDO POR GROK (segun directivas)")
    print("-" * 60)
    rc = 0
    rc |= dispatch("P5", [])
    rc |= dispatch("P0", [])
    rc |= dispatch("P2", [str(EVID)])
    rc |= dispatch("P3", [str(EVID)])
    altos = ips_alto()
    print()
    print(f"  IPs ALTO a localizar (forense, no atacar): {altos or '(ninguna)'}")
    for ip in altos:
        rc |= dispatch("P1", [ip])
    write_estado("CICLO terminado", f"IPS_ALTO={','.join(altos)}")
    print()
    print("=" * 60)
    print("  CICLO GROK TERMINADO — conexion sigue activa")
    print("  Ordenes: escribe P1/P2/P3... en conexion/orden.txt")
    print("=" * 60)
    return rc


def from_orden() -> int:
    if not ORDEN.exists():
        print("  no hay orden en conexion/orden.txt")
        return 0
    raw = ORDEN.read_text(encoding="utf-8", errors="replace").strip()
    if not raw or raw.startswith("#"):
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = DONE / f"orden-{stamp}.txt"
    dest.write_text(raw + "\n", encoding="utf-8")
    ORDEN.write_text("", encoding="utf-8")
    parts = raw.split()
    print(f"  orden recibida: {raw}")
    return dispatch(parts[0], parts[1:])


def main() -> int:
    os.chdir(LAB)
    args = sys.argv[1:]
    if not args:
        args = ["CONECTAR"]
    cmd = args[0]
    rest = args[1:]
    if cmd.upper() == "ORDEN":
        return from_orden()
    return dispatch(cmd, rest)


if __name__ == "__main__":
    sys.exit(main())
