-- ============================================================
-- Agrega el índice único que le falta a la columna id_usuario de
-- usuarios_novusbet (necesario para que el upsert automático
-- funcione). Seguro de correr varias veces.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE usuarios_novusbet ADD CONSTRAINT usuarios_novusbet_id_usuario_key UNIQUE (id_usuario);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
  NULL; -- ya existía, no pasa nada
END $$;

-- Verificación: debería aparecer una fila con la restricción única
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'usuarios_novusbet'::regclass
  AND contype = 'u';
