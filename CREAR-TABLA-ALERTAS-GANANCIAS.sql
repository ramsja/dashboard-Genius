-- ============================================================
-- Alertas de GANANCIA (pago/win) grande — módulo separado de
-- alertas_apuestas. Cualquier transacción clasificada como ganancia
-- (es_ganancia) con monto absoluto >= UMBRAL_ALERTA_GANANCIA (env var,
-- default $15,000) queda registrada acá automáticamente en cada sync.
-- ============================================================

CREATE TABLE IF NOT EXISTS alertas_ganancias (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_transaccion_novusbet TEXT UNIQUE NOT NULL,
  id_usuario_novusbet TEXT,
  usuario TEXT,
  casa_apuestas TEXT,
  monto NUMERIC(15,2) NOT NULL,
  disciplina TEXT,
  juego TEXT,
  descripcion TEXT,
  fecha TIMESTAMPTZ,
  umbral_usado NUMERIC(15,2),
  vista BOOLEAN DEFAULT false,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tendencia del usuario (alza/baja/estable/sin_dato), calculada con
-- estadística simple sobre su historial reciente en resumen_diario_usuarios
-- (ver clasificarTendencia en sync-novusbet.js) — seguro de correr de
-- nuevo si ya habías creado la tabla sin esta columna.
ALTER TABLE alertas_ganancias ADD COLUMN IF NOT EXISTS patron TEXT;

CREATE INDEX IF NOT EXISTS idx_alertas_ganancias_fecha ON alertas_ganancias(fecha DESC);

-- Verificación
SELECT count(*) AS total FROM alertas_ganancias;
