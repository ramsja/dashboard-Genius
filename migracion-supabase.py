"""Crea la tabla transaction_records en Supabase con el esquema correcto."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def generate_create_table_sql() -> str:
    """Genera el SQL para crear la tabla con todas las columnas necesarias."""
    return """
-- Crear tabla de registros de transacciones
CREATE TABLE IF NOT EXISTS transaction_records (
    id BIGSERIAL PRIMARY KEY,
    crear_hora TEXT,
    casa_apuestas TEXT,
    id_padre TEXT,
    id_usuario TEXT,
    usuario TEXT,
    tipo TEXT,
    id_transaccion TEXT,
    nombre_usuario_emisor TEXT,
    moneda TEXT,
    ingresos TEXT,
    estado TEXT,
    total TEXT,
    comision TEXT,
    saldo TEXT,
    saldo_actual TEXT,
    billeteras TEXT,
    tipo_transaccion TEXT,
    grupo_causal TEXT,
    causal TEXT,
    producto_causal TEXT,
    descripcion TEXT,
    nota TEXT,
    direccion_ip TEXT,
    discipline TEXT,
    client_status TEXT,
    connection TEXT,
    source_file TEXT,
    imported_at TEXT,
    raw JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transaction_id_usuario ON transaction_records(id_usuario);
CREATE INDEX IF NOT EXISTS idx_transaction_crear_hora ON transaction_records(crear_hora);
CREATE INDEX IF NOT EXISTS idx_transaction_discipline ON transaction_records(discipline);
CREATE INDEX IF NOT EXISTS idx_transaction_client_status ON transaction_records(client_status);
CREATE INDEX IF NOT EXISTS idx_transaction_tipo ON transaction_records(tipo);

-- Comentarios
COMMENT ON TABLE transaction_records IS 'Registros de transacciones importadas desde el backoffice de GeniusBet';
COMMENT ON COLUMN transaction_records.raw IS 'Fila completa en formato JSON para flexibilidad';
"""


def main() -> None:
    load_dotenv()
    
    sql = generate_create_table_sql()
    
    print("=" * 80)
    print("MIGRACIÓN DE SUPABASE - Crear tabla transaction_records")
    print("=" * 80)
    print()
    print("Para crear la tabla en Supabase, tienes dos opciones:")
    print()
    print("OPCIÓN 1: Usar el Supabase Dashboard (recomendado)")
    print("-" * 80)
    print("1. Ve a https://supabase.com/dashboard/")
    print("2. Selecciona tu proyecto: lkxqhutzlgkiiirtbohv")
    print("3. Ve a SQL Editor (menú lateral)")
    print("4. Haz click en 'New Query'")
    print("5. Copia y pega el SQL de abajo")
    print("6. Haz click en 'Run'")
    print()
    print("OPCIÓN 2: Usar la CLI de Supabase")
    print("-" * 80)
    print("Si tienes la CLI instalada:")
    print("  supabase db push")
    print()
    print("=" * 80)
    print("SQL A EJECUTAR:")
    print("=" * 80)
    print(sql)
    print("=" * 80)
    
    # Guardar SQL en archivo para referencia
    sql_file = Path("migration_create_table.sql")
    sql_file.write_text(sql, encoding="utf-8")
    print(f"\nSQL guardado en: {sql_file}")


if __name__ == "__main__":
    main()
