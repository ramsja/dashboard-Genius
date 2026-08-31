-- ============================================================
-- Resumen mensual por usuario (para el ranking de "jugadores que
-- más juegan"). Se acumula mes a mes hacia adelante — no hace
-- falta bajar el historial crudo viejo, cada sync solo refresca
-- los últimos ~35 días para no escanear todo transacciones_novusbet
-- cada vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS resumen_mensual_usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario_novusbet TEXT NOT NULL,
  usuario TEXT,
  casa_apuestas TEXT,
  mes TEXT NOT NULL, -- 'YYYY-MM'
  transacciones INT DEFAULT 0,
  monto_total NUMERIC(15,2) DEFAULT 0,
  ultima_actividad TIMESTAMPTZ,
  actualizado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_usuario_novusbet, mes)
);

CREATE INDEX IF NOT EXISTS idx_resumen_mensual_mes ON resumen_mensual_usuarios(mes);
CREATE INDEX IF NOT EXISTS idx_resumen_mensual_monto ON resumen_mensual_usuarios(monto_total DESC);

-- Función que recalcula el resumen de los últimos ~35 días agrupado
-- por usuario y mes. Se llama sola después de cada sincronización.
CREATE OR REPLACE FUNCTION actualizar_resumen_mensual_usuarios()
RETURNS void AS $$
BEGIN
  INSERT INTO resumen_mensual_usuarios (
    id_usuario_novusbet, usuario, casa_apuestas, mes,
    transacciones, monto_total, ultima_actividad, actualizado_at
  )
  SELECT
    id_usuario_novusbet,
    MAX(usuario) AS usuario,
    MAX(casa_apuestas) AS casa_apuestas,
    to_char(fecha, 'YYYY-MM') AS mes,
    COUNT(*) AS transacciones,
    SUM(monto) AS monto_total,
    MAX(fecha) AS ultima_actividad,
    NOW() AS actualizado_at
  FROM transacciones_novusbet
  WHERE fecha >= (NOW() - INTERVAL '35 days')
    AND id_usuario_novusbet IS NOT NULL
    AND id_usuario_novusbet <> ''
  GROUP BY id_usuario_novusbet, to_char(fecha, 'YYYY-MM')
  ON CONFLICT (id_usuario_novusbet, mes) DO UPDATE SET
    usuario = EXCLUDED.usuario,
    casa_apuestas = EXCLUDED.casa_apuestas,
    transacciones = EXCLUDED.transacciones,
    monto_total = EXCLUDED.monto_total,
    ultima_actividad = EXCLUDED.ultima_actividad,
    actualizado_at = EXCLUDED.actualizado_at;
END;
$$ LANGUAGE plpgsql;

-- Primera corrida manual (opcional, para no esperar al próximo sync)
SELECT actualizar_resumen_mensual_usuarios();

-- Verificación
SELECT count(*) AS filas, min(mes) AS mes_mas_viejo, max(mes) AS mes_mas_nuevo
FROM resumen_mensual_usuarios;
