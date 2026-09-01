-- ============================================================
-- Borra las alertas de apuestas generadas por el sistema de umbral
-- ADAPTATIVO viejo (reemplazado hace tiempo por el umbral fijo de
-- $15,000 / $2,500 deportes). Esas filas usaron umbrales de $6-$9.31
-- (verificado: motivo_alerta IN ('global','relativo','global+relativo'),
-- ninguna dice 'fijo') — es decir, casi cualquier apuesta quedaba
-- marcada como "alerta", sin relación con los montos grandes reales
-- que el sistema actual busca.
--
-- Por qué nunca se limpiaron solas: el código guarda alertas con
-- ignoreDuplicates=true sobre el id de transacción — una vez que una
-- fila vieja existe, el sistema nuevo nunca la vuelve a tocar.
--
-- Después de este DELETE, "Alertas de Apuestas Grandes", "Radar de
-- Actividad por Jugador" y "Análisis de Riesgo" van a reflejar
-- únicamente alertas reales del sistema de monto fijo actual (que
-- hoy son 0 — es normal, significa que todavía no hubo ninguna
-- apuesta que cruzara $15,000 o $2,500 en deportes desde que arrancó
-- el sistema actual).
-- ============================================================

DELETE FROM alertas_apuestas
WHERE motivo_alerta IS DISTINCT FROM 'fijo';

-- Verificación: debería devolver 0.
SELECT count(*) AS filas_viejas_restantes
FROM alertas_apuestas
WHERE motivo_alerta IS DISTINCT FROM 'fijo';
