-- Crear tabla para transacciones Novusbet
CREATE TABLE IF NOT EXISTS transacciones_novusbet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario TEXT NOT NULL,
  tipo_transaccion TEXT,
  monto NUMERIC(15,2) DEFAULT 0,
  disciplina TEXT DEFAULT 'otros',
  descripcion TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  datos_raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_novusbet_usuario ON transacciones_novusbet(usuario);
CREATE INDEX IF NOT EXISTS idx_novusbet_disciplina ON transacciones_novusbet(disciplina);
CREATE INDEX IF NOT EXISTS idx_novusbet_fecha ON transacciones_novusbet(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_novusbet_created ON transacciones_novusbet(created_at DESC);

-- Vista para resumen por disciplina
CREATE OR REPLACE VIEW vw_transacciones_novusbet_resumen AS
SELECT
  disciplina,
  COUNT(*) as total_transacciones,
  SUM(monto) as monto_total,
  AVG(monto) as monto_promedio,
  MIN(monto) as monto_minimo,
  MAX(monto) as monto_maximo
FROM transacciones_novusbet
GROUP BY disciplina;

-- Vista para estadísticas por usuario
CREATE OR REPLACE VIEW vw_transacciones_novusbet_usuarios AS
SELECT
  usuario,
  COUNT(*) as total_transacciones,
  SUM(monto) as monto_total,
  AVG(monto) as monto_promedio,
  MAX(fecha) as ultima_transaccion
FROM transacciones_novusbet
GROUP BY usuario
ORDER BY monto_total DESC;

-- Habilitar RLS si necesario
ALTER TABLE transacciones_novusbet ENABLE ROW LEVEL SECURITY;

-- Política para acceso público (si lo necesitas)
CREATE POLICY "Allow public read" ON transacciones_novusbet
  FOR SELECT USING (true);

-- Verificar que está creada
SELECT
  (SELECT COUNT(*) FROM transacciones_novusbet) as total_transacciones,
  (SELECT COUNT(DISTINCT disciplina) FROM transacciones_novusbet) as disciplinas_unicas,
  (SELECT COUNT(DISTINCT usuario) FROM transacciones_novusbet) as usuarios_unicos,
  (SELECT SUM(monto) FROM transacciones_novusbet) as monto_total,
  NOW() as verificado_en;
