"""Test simplificado de sync a Supabase."""
import sys
import os
import csv
import json
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(line_buffering=True)

print("=== TEST SYNC SIMPLIFICADO ===", flush=True)

# Cargar variables de entorno
from dotenv import load_dotenv
load_dotenv(Path(".env"))

url = os.getenv("SUPABASE_URL", "").strip()
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

print(f"URL: {url[:30]}...", flush=True)
print(f"Key: {len(key)} chars", flush=True)

# Leer solo 10 filas del CSV
csv_path = Path("descargas/transacciones_producto__2026-08-31_2026-08-31.csv")
print(f"\nLeyendo {csv_path.name}...", flush=True)

rows = []
with csv_path.open("r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 10:
            break
        # Sanitizar nombres de columnas
        sanitized = {}
        for k, v in row.items():
            import re
            clean_key = re.sub(r'[^a-z0-9_]', '_', k.lower()).strip('_')
            sanitized[clean_key] = (v or "").strip()
        
        sanitized["discipline"] = "test"
        sanitized["client_status"] = "test"
        sanitized["connection"] = "test"
        sanitized["source_file"] = str(csv_path)
        sanitized["imported_at"] = datetime.now().isoformat(timespec="seconds")
        rows.append(sanitized)

print(f"Leídas {len(rows)} filas", flush=True)
print(f"Primera fila tiene {len(rows[0])} campos", flush=True)

# Insertar en Supabase
import requests

endpoint = f"{url}/rest/v1/transaction_records"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

print(f"\nInsertando {len(rows)} filas en Supabase...", flush=True)
print(f"Endpoint: {endpoint}", flush=True)

try:
    response = requests.post(endpoint, headers=headers, json=rows, timeout=120)
    print(f"Status: {response.status_code}", flush=True)
    print(f"Response: {response.text[:500]}", flush=True)
    
    if response.status_code in (200, 201, 204):
        print("\n✓ SYNC EXITOSO", flush=True)
    else:
        print(f"\n✗ ERROR: {response.status_code}", flush=True)
except Exception as e:
    print(f"\n✗ EXCEPTION: {e}", flush=True)
    import traceback
    traceback.print_exc()

print("\n=== TEST COMPLETADO ===", flush=True)
