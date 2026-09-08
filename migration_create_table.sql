
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
