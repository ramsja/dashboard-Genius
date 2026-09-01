-- ============================================================
-- Optimización de estructura para el plan gratuito de Supabase.
-- Esto es un complemento de dos fixes de código:
--   - /api/transacciones-novusbet ya no hace COUNT exacto + select(*)
--     sobre 350,000+ filas en cada carga del dashboard.
--   - /api/usuarios-matriz ya no trae hasta 100,000 filas crudas de
--     transacciones_novusbet (ni las ~39,000 de usuarios_novusbet
--     completas) en cada refresh de 30 segundos — ahora usa
--     resumen_diario_usuarios, que es chico y ya viene agregado.
-- Esos dos eran, con diferencia, los pedidos más caros y más
-- frecuentes contra la base — la causa real de que el plan gratuito
-- se quedara sin recursos una y otra vez. Este script ataca lo que
-- queda del lado de la base: índices que solo agregan trabajo en
-- cada sincronización sin que nada los use para leer, una columna
-- nueva que ese fix necesita, y estadísticas desactualizadas por
-- toda la carga de las últimas semanas.
-- ============================================================

-- 0) Columna nueva que necesita el fix de /api/usuarios-matriz: qué
--    disciplinas (casino/deportes) jugó cada usuario cada día, para no
--    tener que volver a leer transacciones_novusbet para eso.
ALTER TABLE resumen_diario_usuarios ADD COLUMN IF NOT EXISTS disciplinas TEXT[];

-- 1) Índices muertos en transacciones_novusbet: ningún endpoint filtra
--    por "usuario" (texto crudo), "disciplina" ni "created_at" — todo
--    se filtra por fecha, id_usuario_novusbet o es_apuesta, que sí
--    tienen su índice. Estos tres no sirven para leer nada, pero SÍ
--    hay que actualizarlos en cada fila que se sincroniza (14,000 a
--    107,000+ por día). Sacarlos aligera cada sync sin perder nada.
DROP INDEX IF EXISTS idx_novusbet_usuario;
DROP INDEX IF EXISTS idx_novusbet_disciplina;
DROP INDEX IF EXISTS idx_novusbet_created;

-- 2) Autovacuum más seguido en las dos tablas con más movimiento.
--    Por defecto Postgres espera a que ~20% de una tabla sean filas
--    muertas antes de limpiarla — en una instancia tan chica (t4g.nano)
--    eso deja demasiada basura acumulada entre limpiezas, lo que
--    infla la tabla y sus índices y hace más lenta cada consulta.
--    Bajarlo a 5% hace que limpie más seguido, en pasadas más chicas.
ALTER TABLE transacciones_novusbet SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE resumen_diario_usuarios SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- 3) Limpieza y estadísticas frescas ya mismo (no espera al autovacuum
--    automático). VACUUM ANALYZE no bloquea la tabla para lectura/
--    escritura, es seguro correrlo con la app en producción.
VACUUM ANALYZE transacciones_novusbet;
VACUUM ANALYZE resumen_diario_usuarios;
VACUUM ANALYZE alertas_apuestas;
VACUUM ANALYZE alertas_ganancias;
VACUUM ANALYZE ranking_historico_base;
VACUUM ANALYZE usuarios_novusbet;

-- Verificación: índices que quedan en transacciones_novusbet.
SELECT indexname FROM pg_indexes WHERE tablename = 'transacciones_novusbet';
