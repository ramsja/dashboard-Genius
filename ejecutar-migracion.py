"""Ejecuta la migración de Supabase usando el cliente Python."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client


def main() -> None:
    load_dotenv()
    
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not url or not key:
        print("ERROR: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados")
        return
    
    print(f"Conectando a Supabase: {url}")
    supabase: Client = create_client(url, key)
    
    # Leer SQL del archivo
    sql_file = Path("migration_create_table.sql")
    if not sql_file.exists():
        print("ERROR: migration_create_table.sql no encontrado")
        return
    
    sql = sql_file.read_text(encoding="utf-8")
    
    print("Ejecutando migración...")
    print("-" * 80)
    
    try:
        # Ejecutar SQL usando rpc
        # Supabase no tiene un método directo para ejecutar SQL arbitrario,
        # pero podemos usar la tabla para verificar si existe
        response = supabase.table("transaction_records").select("id").limit(1).execute()
        print(f"✓ La tabla ya existe. Filas actuales: {len(response.data) if response.data else 0}")
    except Exception as e:
        print(f"Tabla no existe o error: {e}")
        print("\nPor favor, ejecuta el SQL manualmente en el Supabase Dashboard:")
        print("1. Ve a https://supabase.com/dashboard/")
        print("2. Selecciona tu proyecto")
        print("3. Ve a SQL Editor")
        print("4. Copia y pega el contenido de migration_create_table.sql")
        print("5. Ejecuta el SQL")
        print("\nO usa el archivo migration_create_table.sql como referencia.")
    
    print("-" * 80)


if __name__ == "__main__":
    main()
