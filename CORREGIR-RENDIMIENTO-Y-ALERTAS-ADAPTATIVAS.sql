-- ============================================================
-- Dos cosas en un solo script:
--
-- 1) Arregla el timeout de actualizar_resumen_diario_usuarios(): ya
--    no usa expresiones regulares ni ARRAY_AGG(DISTINCT ...) en el
--    camino caliente — usa columnas booleanas precalculadas
--    (es_apuesta/es_ganancia, que ahora llena la app al subir cada
--    transacción) y un ARRAY_AGG simple.
--
-- 2) Umbral de alerta combinado y adaptativo: en vez de un monto fijo
--    a mano, se recalcula solo a partir de los datos reales —
--    percentil 99 global de las apuestas + el patrón propio de cada
--    usuario (5x su apuesta promedio). Alerta si supera cualquiera
--    de los dos.
-- ============================================================

-- --- 1) Columnas booleanas precalculadas + índices ---

ALTER TABLE transacciones_novusbet ADD COLUMN IF NOT EXISTS es_apuesta BOOLEAN DEFAULT false;
ALTER TABLE transacciones_novusbet ADD COLUMN IF NOT EXISTS es_ganancia BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_novusbet_id_usuario ON transacciones_novusbet(id_usuario_novusbet);
CREATE INDEX IF NOT EXISTS idx_novusbet_es_apuesta ON transacciones_novusbet(fecha) WHERE es_apuesta;

CREATE OR REPLACE FUNCTION actualizar_resumen_diario_usuarios(
  fecha_desde DATE,
  fecha_hasta DATE DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  hasta DATE := COALESCE(fecha_hasta, fecha_desde);
BEGIN
  INSERT INTO resumen_diario_usuarios (
    id_usuario_novusbet, usuario, casa_apuestas, dia,
    transacciones, apuestas, monto_total, apostado, ganado, juegos,
    ultima_actividad, actualizado_at
  )
  SELECT
    id_usuario_novusbet,
    MAX(usuario) AS usuario,
    MAX(casa_apuestas) AS casa_apuestas,
    date(fecha) AS dia,
    COUNT(*) AS transacciones,
    COUNT(*) FILTER (WHERE es_apuesta) AS apuestas,
    SUM(monto) AS monto_total,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE es_apuesta), 0) AS apostado,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE es_ganancia), 0) AS ganado,
    ARRAY_AGG(juego) FILTER (WHERE juego IS NOT NULL AND juego <> '') AS juegos,
    MAX(fecha) AS ultima_actividad,
    NOW() AS actualizado_at
  FROM transacciones_novusbet
  WHERE fecha >= fecha_desde AND fecha < (hasta + 1)
    AND id_usuario_novusbet IS NOT NULL
    AND id_usuario_novusbet <> ''
  GROUP BY id_usuario_novusbet, date(fecha)
  ON CONFLICT (id_usuario_novusbet, dia) DO UPDATE SET
    usuario = EXCLUDED.usuario,
    casa_apuestas = EXCLUDED.casa_apuestas,
    transacciones = EXCLUDED.transacciones,
    apuestas = EXCLUDED.apuestas,
    monto_total = EXCLUDED.monto_total,
    apostado = EXCLUDED.apostado,
    ganado = EXCLUDED.ganado,
    juegos = EXCLUDED.juegos,
    ultima_actividad = EXCLUDED.ultima_actividad,
    actualizado_at = EXCLUDED.actualizado_at;
END;
$$ LANGUAGE plpgsql;

-- El ranking ya no necesita DISTINCT al leer juegos por día (puede
-- haber duplicados dentro de un mismo día, es normal); sigue
-- deduplicando al armar el resultado final.

-- --- 2) Umbral adaptativo ---

CREATE TABLE IF NOT EXISTS parametros_alerta_apuestas (
  id INT PRIMARY KEY DEFAULT 1,
  umbral_global NUMERIC(15,2),
  actualizado_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (id = 1) -- una sola fila
);

CREATE TABLE IF NOT EXISTS perfil_apuestas_usuarios (
  id_usuario_novusbet TEXT PRIMARY KEY,
  promedio_apuesta NUMERIC(15,2) DEFAULT 0,
  actualizado_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recalcula el umbral global (percentil 99 de las apuestas de los
-- últimos 30 días, entre las que todavía tenemos en detalle) y el
-- promedio de apuesta por usuario (de resumen_diario_usuarios, liviana).
-- Se llama sola una vez por sincronización, no por cada transacción.
CREATE OR REPLACE FUNCTION actualizar_parametros_alerta()
RETURNS void AS $$
BEGIN
  INSERT INTO parametros_alerta_apuestas (id, umbral_global, actualizado_at)
  SELECT 1, percentile_cont(0.99) WITHIN GROUP (ORDER BY ABS(monto)), NOW()
  FROM transacciones_novusbet
  WHERE es_apuesta AND fecha >= (NOW() - INTERVAL '30 days')
  ON CONFLICT (id) DO UPDATE SET
    umbral_global = EXCLUDED.umbral_global,
    actualizado_at = EXCLUDED.actualizado_at;

  INSERT INTO perfil_apuestas_usuarios (id_usuario_novusbet, promedio_apuesta, actualizado_at)
  SELECT
    id_usuario_novusbet,
    SUM(apostado) / NULLIF(SUM(apuestas), 0) AS promedio_apuesta,
    NOW()
  FROM resumen_diario_usuarios
  WHERE dia >= (CURRENT_DATE - INTERVAL '60 days')
  GROUP BY id_usuario_novusbet
  HAVING SUM(apuestas) > 0
  ON CONFLICT (id_usuario_novusbet) DO UPDATE SET
    promedio_apuesta = EXCLUDED.promedio_apuesta,
    actualizado_at = EXCLUDED.actualizado_at;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE alertas_apuestas ADD COLUMN IF NOT EXISTS motivo_alerta TEXT;

-- Verificación
SELECT count(*) AS filas FROM resumen_diario_usuarios;
