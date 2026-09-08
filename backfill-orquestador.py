"""Orquesta el backfill del backoffice en chunks no solapados.
Lee credenciales de .env y ejecuta extraccionDatos.py por bloques de fechas."""
from __future__ import annotations

import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path


def date_range_chunks(start_str: str, end_str: str, chunk_days: int) -> list[tuple[str, str]]:
    start = date.fromisoformat(start_str)
    end = date.fromisoformat(end_str)
    chunks: list[tuple[str, str]] = []
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end)
        chunks.append((current.isoformat(), chunk_end.isoformat()))
        current = chunk_end + timedelta(days=1)
    return chunks


def csv_for_chunk(base_dir: Path, start: str, end: str) -> Path:
    # El nombre usa CAUSAL_PRODUCT_ID vacío por defecto, generando doble guión bajo.
    return base_dir / "descargas" / f"transacciones_producto__{start}_{end}.csv"


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    log_path = base_dir / "descargas" / "backfill.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # Periodos a backfilleear (no solapados con los CSVs ya descargados).
    periods = [
        ("2026-08-01", "2026-08-27", 3),   # agosto en chunks de 3 días
        ("2026-09-05", "2026-09-08", 4),   # septiembre restante en un chunk
    ]

    chunks: list[tuple[str, str]] = []
    for start, end, size in periods:
        chunks.extend(date_range_chunks(start, end, size))

    total = len(chunks)
    failed: list[tuple[str, str]] = []

    with log_path.open("a", encoding="utf-8") as log:
        header = f"\n=== Backfill iniciado {datetime.now().isoformat(timespec='seconds')} ===\n"
        print(header.strip())
        log.write(header)
        log.flush()

        for i, (start, end) in enumerate(chunks, start=1):
            csv_path = csv_for_chunk(base_dir, start, end)
            if csv_path.exists() and csv_path.stat().st_size > 1024:
                msg = f"[{i}/{total}] SKIP {start} -> {end} (CSV ya existe: {csv_path.name})"
                print(msg)
                log.write(msg + "\n")
                log.flush()
                continue

            msg = f"[{i}/{total}] Descargando {start} -> {end}"
            print(msg)
            log.write(msg + "\n")
            log.flush()

            env = {
                "START_DATE": start,
                "END_DATE": end,
                # python-dotenv cargará el resto desde .env
            }

            with subprocess.Popen(
                [sys.executable, str(base_dir / "extraccionDatos.py")],
                cwd=str(base_dir),
                env={**dict(subprocess.os.environ), **env},
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            ) as proc:
                if proc.stdout:
                    for line in proc.stdout:
                        print(line, end="")
                        log.write(line)
                        log.flush()
                proc.wait()

            if proc.returncode != 0:
                failed.append((start, end))
                error_msg = f"[{i}/{total}] ERROR en {start} -> {end} (rc={proc.returncode})"
                print(error_msg)
                log.write(error_msg + "\n")
                log.flush()
                # Continuar con el siguiente chunk para maximizar datos descargados,
                # el operador revisará los fallos al final.
            else:
                ok_msg = f"[{i}/{total}] Completado {start} -> {end}"
                print(ok_msg)
                log.write(ok_msg + "\n")
                log.flush()

        summary = f"\nBackfill finalizado. {total - len(failed)}/{total} chunks exitosos."
        if failed:
            summary += f"\nChunks fallidos: {failed}"
        print(summary)
        log.write(summary + "\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
