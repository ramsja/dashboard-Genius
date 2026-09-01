-- ============================================================
-- Tabla para el nuevo "Dashboard de Históricos": a diferencia de
-- ranking_historico_base (que guarda UN solo snapshot, se borra y
-- reimporta cada vez), esta tabla guarda MÚLTIPLES períodos —
-- cada CSV que subís queda etiquetado con su propio "periodo"
-- (ej. "2026-08"), sin pisar los anteriores. Así se puede comparar
-- mes a mes. Completamente separada de ranking_historico_base y de
-- los datos en vivo: no se mezcla con el Top 25 ni con el resto del
-- dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS historico_csv_mensual (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo TEXT NOT NULL,
  id_usuario_novusbet TEXT NOT NULL,
  usuario TEXT,
  casa_apuestas TEXT,
  apuestas INT DEFAULT 0,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  beneficio NUMERIC(15,2) DEFAULT 0,
  moneda TEXT,
  importado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (periodo, id_usuario_novusbet)
);

CREATE INDEX IF NOT EXISTS idx_historico_csv_mensual_periodo ON historico_csv_mensual(periodo);

-- Verificación
SELECT count(*) AS total FROM historico_csv_mensual;
