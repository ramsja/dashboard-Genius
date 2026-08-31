-- ============================================================
-- Resumen DIARIO por usuario (reemplaza el enfoque mensual anterior,
-- que obligaba a re-escanear semanas de golpe). Cada sincronización
-- de un día llama a actualizar_resumen_diario_usuarios() SOLO para
-- ese día — rápido (~un día de transacciones) y seguro de repetir
-- (sobreescribe ese día, no lo suma dos veces).
--
-- El ranking de "últimos N meses" se arma sumando estos días con
-- obtener_ranking_jugadores(), sin tocar la tabla cruda
-- transacciones_novusbet (que puede podarse aparte para no crecer
-- sin límite, ver PODAR-TRANSACCIONES-VIEJAS.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS resumen_diario_usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario_novusbet TEXT NOT NULL,
  usuario TEXT,
  casa_apuestas TEXT,
  dia DATE NOT NULL,
  transacciones INT DEFAULT 0,
  apuestas INT DEFAULT 0,
  monto_total NUMERIC(15,2) DEFAULT 0,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  juegos TEXT[],
  ultima_actividad TIMESTAMPTZ,
  actualizado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_usuario_novusbet, dia)
);

CREATE INDEX IF NOT EXISTS idx_resumen_diario_dia ON resumen_diario_usuarios(dia);

-- Recalcula el resumen de UN rango de fechas (normalmente un solo día:
-- fecha_desde = fecha_hasta). Sobreescribe (no suma), así que es
-- seguro llamarla de nuevo para el mismo día sin duplicar.
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
    COUNT(*) FILTER (WHERE descripcion ~* '\yapuesta\y|\ybet\y') AS apuestas,
    SUM(monto) AS monto_total,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE descripcion ~* '\yapuesta\y|\ybet\y'), 0) AS apostado,
    COALESCE(SUM(ABS(monto)) FILTER (WHERE descripcion ~* '\yganancia\y|\ywin\y'), 0) AS ganado,
    ARRAY_AGG(DISTINCT juego) FILTER (WHERE juego IS NOT NULL AND juego <> '') AS juegos,
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

-- Arma el ranking final sumando los días dentro de la ventana pedida.
-- Se ejecuta entero en la base (no trae millones de filas a la app),
-- y ya descarta usuarios con actividad en un solo mes.
CREATE OR REPLACE FUNCTION obtener_ranking_jugadores(meses INT DEFAULT 6)
RETURNS TABLE (
  id_usuario_novusbet TEXT,
  usuario TEXT,
  casa_apuestas TEXT,
  transacciones BIGINT,
  apuestas BIGINT,
  monto_total NUMERIC,
  apostado NUMERIC,
  ganado NUMERIC,
  beneficio NUMERIC,
  juegos TEXT[],
  dias_activo BIGINT,
  meses_activo BIGINT,
  ultima_actividad TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id_usuario_novusbet,
    MAX(r.usuario) AS usuario,
    MAX(r.casa_apuestas) AS casa_apuestas,
    SUM(r.transacciones) AS transacciones,
    SUM(r.apuestas) AS apuestas,
    SUM(r.monto_total) AS monto_total,
    SUM(r.apostado) AS apostado,
    SUM(r.ganado) AS ganado,
    SUM(r.apostado) - SUM(r.ganado) AS beneficio,
    (
      SELECT ARRAY_AGG(DISTINCT g)
      FROM resumen_diario_usuarios rr, unnest(rr.juegos) AS g
      WHERE rr.id_usuario_novusbet = r.id_usuario_novusbet
        AND rr.dia >= (CURRENT_DATE - (meses || ' months')::interval)
    ) AS juegos,
    COUNT(DISTINCT r.dia) AS dias_activo,
    COUNT(DISTINCT to_char(r.dia, 'YYYY-MM')) AS meses_activo,
    MAX(r.ultima_actividad) AS ultima_actividad
  FROM resumen_diario_usuarios r
  WHERE r.dia >= (CURRENT_DATE - (meses || ' months')::interval)
  GROUP BY r.id_usuario_novusbet
  HAVING COUNT(DISTINCT to_char(r.dia, 'YYYY-MM')) > 1
  ORDER BY monto_total DESC;
END;
$$ LANGUAGE plpgsql;

-- Verificación (rápida, la tabla recién se está por llenar)
SELECT count(*) AS filas, min(dia) AS dia_mas_viejo, max(dia) AS dia_mas_nuevo
FROM resumen_diario_usuarios;
