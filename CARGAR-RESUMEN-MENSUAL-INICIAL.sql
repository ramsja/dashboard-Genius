-- ============================================================
-- Primera carga del resumen mensual. Correr DESPUÉS de
-- CREAR-TABLA-RESUMEN-MENSUAL.sql.
--
-- Con el volumen actual (80k-100k+ transacciones/día), pedir muchos
-- días de una sola vez puede superar el timeout del editor de
-- Supabase. Corré esta línea (7 días, es la misma ventana que usa
-- la app automáticamente) y esperá a que termine:
-- ============================================================

SELECT actualizar_resumen_mensual_usuarios(7);

-- Si termina bien y querés más historial hacia atrás, corré ESTA
-- LÍNEA SOLA (borrá o comentá la de arriba) con un número más
-- grande, de a poco: 14, después 21, después 30... Cada corrida es
-- segura de repetir (upsert), así que no hay problema si repetís
-- días ya cargados.
-- SELECT actualizar_resumen_mensual_usuarios(14);

-- Verificación
SELECT count(*) AS filas, min(mes) AS mes_mas_viejo, max(mes) AS mes_mas_nuevo
FROM resumen_mensual_usuarios;
