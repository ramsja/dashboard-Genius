-- ============================================================
-- Alertas de apuestas por monto muy alto. Se generan solas en
-- cada sincronización: cualquier transacción clasificada como
-- apuesta (no depósito/retiro) cuyo monto absoluto supere el
-- umbral configurado (UMBRAL_ALERTA_APUESTA, ver sync-novusbet.js)
-- queda registrada acá.
-- ============================================================

CREATE TABLE IF NOT EXISTS alertas_apuestas (
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

-- 'critica' si el monto es >= UMBRAL_SEVERIDAD_CRITICA (ver sync-novusbet.js,
-- default $20,000), 'normal' si no. Seguro de correr de nuevo si la tabla
-- ya existía sin esta columna.
ALTER TABLE alertas_apuestas ADD COLUMN IF NOT EXISTS severidad TEXT DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_alertas_apuestas_fecha ON alertas_apuestas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_apuestas_vista ON alertas_apuestas(vista);

-- Verificación
SELECT count(*) AS total FROM alertas_apuestas;
