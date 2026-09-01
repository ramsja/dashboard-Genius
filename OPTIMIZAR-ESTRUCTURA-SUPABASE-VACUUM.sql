-- ============================================================
-- VACUUM ANALYZE por separado de OPTIMIZAR-ESTRUCTURA-SUPABASE.sql.
--
-- IMPORTANTE: VACUUM no puede correr dentro de una transacción, y el
-- editor SQL de Supabase agrupa todo lo que pegás y ejecutás junto en
-- una sola transacción. Por eso hay que correr CADA LÍNEA por separado:
-- seleccioná (con el mouse) solo una línea a la vez y ejecutá solo esa
-- selección, repetí para cada una. No pegues el archivo entero y le
-- des "Run" de una — va a fallar con el mismo error de antes.
--
-- No bloquea la tabla para lectura/escritura, es seguro correrlo con
-- la app en producción.
-- ============================================================

VACUUM ANALYZE transacciones_novusbet;

VACUUM ANALYZE resumen_diario_usuarios;

VACUUM ANALYZE alertas_apuestas;

VACUUM ANALYZE alertas_ganancias;

VACUUM ANALYZE ranking_historico_base;

VACUUM ANALYZE usuarios_novusbet;
