-- ============================================================
-- Agrega las columnas que falten a usuarios_novusbet, por si la
-- tabla ya existía de un intento anterior con menos columnas.
-- Seguro de correr las veces que sea, no borra datos.
-- ============================================================

ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS id_usuario TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS usuario TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS apellido TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS padre TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS correo TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS moneda TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS saldo NUMERIC(15,2) DEFAULT 0;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS saldo_retirable NUMERIC(15,2) DEFAULT 0;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS bono NUMERIC(15,2) DEFAULT 0;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS sitio TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS estado TEXT;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ;
ALTER TABLE usuarios_novusbet ADD COLUMN IF NOT EXISTS actualizado_at TIMESTAMPTZ DEFAULT NOW();

-- Asegura que id_usuario tenga índice único (lo necesita el upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'usuarios_novusbet' AND indexdef LIKE '%UNIQUE%id_usuario%'
  ) THEN
    ALTER TABLE usuarios_novusbet ADD CONSTRAINT usuarios_novusbet_id_usuario_key UNIQUE (id_usuario);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usuarios_novusbet_estado ON usuarios_novusbet(estado);

-- Verificación: deberían aparecer todas estas columnas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'usuarios_novusbet'
ORDER BY ordinal_position;
