#!/usr/bin/env python3
"""Caso forense: copia de trabajo, SHA-256, cadena de custodia, informe."""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LAB = Path("/mnt/c/Users/Riesgos/kali-lab")
EVID = LAB / "evidencias"
CASOS = LAB / "casos"
YARA = LAB / "yara" / "lab.yar"
SKIP = {".keep", "00-CADENA-CUSTODIA.txt", "00-LEEME.txt"}


def utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def list_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.name in SKIP or p.suffix.lower() in {".pid"}:
            continue
        if p.stat().st_size > 30_000_000:
            continue
        out.append(p)
    return out


def nuevo_caso(origen: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    caso = CASOS / f"CASO-{stamp}"
    orig_dir = caso / "01_ORIGINAL_INDICE"
    work = caso / "02_COPIA_TRABAJO"
    anal = caso / "04_ANALISIS"
    for d in (orig_dir, work, anal):
        d.mkdir(parents=True, exist_ok=True)

    files = list_files(origen)
    print("=" * 60)
    print("  NUEVO CASO FORENSE")
    print(f"  {caso.name}")
    print(f"  UTC {utc()}")
    print("  Originales NO se modifican. Se hashea y se copia.")
    print("=" * 60)
    print(f"  archivos: {len(files)}")

    lines = [
        f"caso={caso.name}",
        f"abierto_utc={utc()}",
        "analista=Grok / Kali Lab",
        f"origen={origen}",
        "metodo=copia + SHA-256 (NIST: no trabajar sobre el original)",
        "",
        "archivo\ttamano\tsha256",
    ]
    for src in files:
        digest = sha256(src)
        rel = src.relative_to(origen) if src.is_relative_to(origen) else Path(src.name)
        dst = work / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        d2 = sha256(dst)
        ok = "OK" if d2 == digest else "FALLO HASH"
        print(f"  {ok}  {rel}  {digest[:16]}…")
        lines.append(f"{rel}\t{src.stat().st_size}\t{digest}")
        if d2 != digest:
            lines.append(f"ERROR copia distinta: {rel}")
        (orig_dir / "NO_TOCAR.txt").write_text(
            "Los originales estan en:\n" + str(origen) + "\nNo editar.\n",
            encoding="utf-8",
        )

    (caso / "03_HASHES.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (caso / "00_CADENA_CUSTODIA.txt").write_text(
        "\n".join(
            [
                f"CASO {caso.name}",
                f"Abierto: {utc()}",
                "Custodio: laboratorio Kali WSL (esta PC)",
                f"Fuente: {origen}",
                "Accion: intake — hash SHA-256 — copia de trabajo",
                "Siguiente: P2 fuerza bruta, P3 extraer, linea de tiempo, YARA",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"  hashes: {caso / '03_HASHES.txt'}")
    return caso


def timeline(work: Path, dest: Path) -> None:
    rows = ["utc_aprox,fuente,evento,detalle"]
    syslog = re.compile(
        r"^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+(\S+):\s+(.*)$"
    )
    comb = re.compile(
        r'(\d{1,3}(?:\.\d{1,3}){3}) - .* \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3})'
    )
    for p in list_files(work):
        try:
            text = p.read_text(errors="replace")
        except Exception:
            continue
        for ln in text.splitlines():
            m = syslog.match(ln)
            if m:
                rows.append(f"{m.group(1)},{p.name},{m.group(2)},{m.group(3)[:120]}")
                continue
            m = comb.search(ln)
            if m:
                rows.append(
                    f"{m.group(2)},{p.name},http-{m.group(5)},{m.group(1)} {m.group(3)} {m.group(4)}"
                )
    dest.write_text("\n".join(rows[:2000]) + "\n", encoding="utf-8")
    print(f"  timeline eventos: {len(rows)-1}  → {dest.name}")


def yara_scan(work: Path, dest: Path) -> None:
    if shutil.which("yara") and YARA.exists():
        try:
            p = subprocess.run(
                ["yara", "-r", "-s", str(YARA), str(work)],
                capture_output=True,
                text=True,
                timeout=30,
                errors="replace",
            )
            dest.write_text(p.stdout or p.stderr or "(sin hits)\n", encoding="utf-8")
            hits = [ln for ln in (p.stdout or "").splitlines() if ln.strip()]
            print(f"  yara hits: {len(hits)}")
            return
        except Exception as e:
            dest.write_text(f"yara error: {e}\n", encoding="utf-8")
            print("  yara no disponible, regex de respaldo")
    # fallback
    pats = [
        ("Hydra/sqlmap/ncrack", re.compile(r"hydra|sqlmap|ncrack|nikto", re.I)),
        ("AKIA/key", re.compile(r"AKIA[0-9A-Z]{16}")),
        ("JWT", re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")),
        ("password=", re.compile(r"password=", re.I)),
    ]
    lines = []
    for p in list_files(work):
        try:
            t = p.read_text(errors="replace")
        except Exception:
            continue
        for name, rx in pats:
            if rx.search(t):
                lines.append(f"{name}\t{p.name}")
    dest.write_text("\n".join(lines) or "(sin hits)\n", encoding="utf-8")
    print(f"  yara-fallback hits: {len(lines)}")


def run(cmd: list[str]) -> None:
    print(" >>>", " ".join(cmd[-4:]))
    subprocess.run(cmd, check=False)


def informe(origen: Path) -> Path:
    caso = nuevo_caso(origen)
    work = caso / "02_COPIA_TRABAJO"
    anal = caso / "04_ANALISIS"
    print()
    print("-" * 60)
    print(">>> Analisis sobre la COPIA (original intacto)")
    print("-" * 60)
    run(["python3", "-u", str(LAB / "herramientas" / "detectar_fuerza_bruta.py"), str(work)])
    run(["python3", "-u", str(LAB / "herramientas" / "extraer_datos.py"), str(work)])
    timeline(work, anal / "timeline.csv")
    yara_scan(work, anal / "yara.txt")

    # copiar ultimos reportes
    rep = LAB / "reportes"
    for pat in ("fuerza-bruta-*.txt", "datos-*.txt"):
        files = sorted(rep.glob(pat), key=lambda x: x.stat().st_mtime, reverse=True)
        if files:
            shutil.copy2(files[0], anal / files[0].name)

    inf = caso / "05_INFORME.txt"
    inf.write_text(
        "\n".join(
            [
                f"INFORME FORENSE {caso.name}",
                f"UTC {utc()}",
                "Alcance: evidencias propias. Sin ataques a terceros.",
                "",
                "1. Cadena de custodia: 00_CADENA_CUSTODIA.txt",
                "2. Hashes SHA-256:     03_HASHES.txt",
                "3. Copia de trabajo:   02_COPIA_TRABAJO/",
                "4. Fuerza bruta / IOCs: 04_ANALISIS/",
                "5. Linea de tiempo:    04_ANALISIS/timeline.csv",
                "6. YARA:               04_ANALISIS/yara.txt",
                "",
                "Siguiente (ciberseguridad defensiva):",
                " - bloquear IPs ALTO del ranking (firewall), no atacarlas",
                " - rate-limit en logins",
                " - conservar originales + hashes",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print()
    print("=" * 60)
    print("  INFORME LISTO")
    print(f"  {inf}")
    print("=" * 60)
    return caso


def main() -> int:
    args = sys.argv[1:]
    origen = Path(args[1]) if len(args) > 1 else EVID
    if not origen.exists():
        print("no existe", origen)
        return 1
    cmd = (args[0] if args else "informe").lower()
    if cmd in ("caso", "nuevo"):
        nuevo_caso(origen)
    else:
        informe(origen)
    return 0


if __name__ == "__main__":
    sys.exit(main())
