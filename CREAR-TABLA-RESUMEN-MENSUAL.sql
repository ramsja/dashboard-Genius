-- ============================================================
-- Resumen mensual por usuario (para el ranking de "jugadores que
-- más juegan"). Se acumula mes a mes hacia adelante — no hace
-- falta bajar el historial crudo viejo, cada sync solo refresca
-- los últimos ~35 días para no escanear todo transacciones_novusbet
-- cada vez.
--
-- Seguro de correr de nuevo si ya habías corrido una versión
-- anterior de este archivo (agrega las columnas nuevas que falten).
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

-- Apuestas realizadas (solo las transacciones tipo Bet/Apuesta, sin
-- contar depósitos, retiros ni ganancias) y los juegos jugados.
ALTER TABLE resumen_mensual_usuarios ADD COLUMN IF NOT EXISTS apuestas INT DEFAULT 0;
ALTER TABLE resumen_mensual_usuarios ADD COLUMN IF NOT EXISTS juegos TEXT[];

-- Cuánto apostó (dinero que jugó) y cuánto ganó (dinero que le pagaron).
-- El beneficio para la casa es apostado - ganado (se calcula al leer,
-- no hace falta guardarlo aparte).
ALTER TABLE resumen_mensual_usuarios ADD COLUMN IF NOT EXISTS apostado NUMERIC(15,2) DEFAULT 0;
ALTER TABLE resumen_mensual_usuarios ADD COLUMN IF NOT EXISTS ganado NUMERIC(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_resumen_mensual_mes ON resumen_mensual_usuarios(mes);
CREATE INDEX IF NOT EXISTS idx_resumen_mensual_monto ON resumen_mensual_usuarios(monto_total DESC);

-- Función que recalcula el resumen de los últimos N días agrupado por
-- usuario y mes (parametrizable: en cada sync la app pide solo unos
-- pocos días hacia atrás, para no escanear millones de filas cada vez;
-- la primera carga histórica se hace aparte con más días, ver abajo).
CREATE OR REPLACE FUNCTION actualizar_resumen_mensual_usuarios(dias_atras INT DEFAULT 7)
RETURNS void AS $$
BEGIN
  INSERT INTO resumen_mensual_usuarios (
    id_usuario_novusbet, usuario, casa_apuestas, mes,
    transacciones, apuestas, monto_total, juegos, apostado, ganado,
    ultima_actividad, actualizado_at
  )
  SELECT
    id_usuario_novusbet,
    MAX(usuario) AS usuario,
    MAX(casa_apuestas) AS casa_apuestas,
    to_char(fecha, 'YYYY-MM') AS mes,
    COUNT(*) AS transacciones,
    COUNT(*) FILTER (WHERE descripcion ~* '\yapuesta\y|\ybet\y') AS apuestas,
    SUM(monto) AS monto_total,
    ARRAY_AGG(DISTINCT juego) FILTER (WHERE juego IS NOT NULL AND juego <> '') AS juegos,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE descripcion ~* '\yapuesta\y|\ybet\y'), 0) AS apostado,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE descripcion ~* '\yganancia\y|\ywin\y'), 0) AS ganado,
    MAX(fecha) AS ultima_actividad,
    NOW() AS actualizado_at
  FROM transacciones_novusbet
  WHERE fecha >= (NOW() - (dias_atras || ' days')::interval)
    AND id_usuario_novusbet IS NOT NULL
    AND id_usuario_novusbet <> ''
  GROUP BY id_usuario_novusbet, to_char(fecha, 'YYYY-MM')
  ON CONFLICT (id_usuario_novusbet, mes) DO UPDATE SET
    usuario = EXCLUDED.usuario,
    casa_apuestas = EXCLUDED.casa_apuestas,
    transacciones = EXCLUDED.transacciones,
    apuestas = EXCLUDED.apuestas,
    monto_total = EXCLUDED.monto_total,
    juegos = EXCLUDED.juegos,
    apostado = EXCLUDED.apostado,
    ganado = EXCLUDED.ganado,
    ultima_actividad = EXCLUDED.ultima_actividad,
    actualizado_at = EXCLUDED.actualizado_at;
END;
$$ LANGUAGE plpgsql;

-- No corre la primera carga acá — con el volumen actual (80k-100k+
-- transacciones/día) recalcular varios días de una sola vez puede
-- superar el timeout del editor de Supabase. Corré
-- CARGAR-RESUMEN-MENSUAL-INICIAL.sql aparte, un día a la vez.

-- Verificación (esto sí es rápido, solo cuenta filas)
SELECT count(*) AS filas, min(mes) AS mes_mas_viejo, max(mes) AS mes_mas_nuevo
FROM resumen_mensual_usuarios;
