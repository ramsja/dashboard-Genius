"""Reinicia el visor si se cae. Sin ventana."""
from __future__ import annotations

import subprocess
import time
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
PY = r"C:\Users\Riesgos\AppData\Local\Programs\Python\Python314\python.exe"
SCRIPT = str(BASE / "visor_transacciones.py")
ENV = {**os.environ, "PYTHONPATH": str(BASE / ".venv" / "Lib" / "site-packages")}


def alive(port: int = 8765) -> bool:
    import socket

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def main() -> None:
    proc = None
    while True:
        if alive():
            time.sleep(5)
            continue
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=4)
            except subprocess.TimeoutExpired:
                proc.kill()
        err = open(BASE / "visor-error.err", "ab")
        proc = subprocess.Popen(
            [PY, "-u", SCRIPT],
            cwd=str(BASE),
            env=ENV,
            stdout=err,
            stderr=err,
        )
        for _ in range(20):
            if alive():
                break
            if proc.poll() is not None:
                break
            time.sleep(0.25)
        time.sleep(5)


if __name__ == "__main__":
    main()
