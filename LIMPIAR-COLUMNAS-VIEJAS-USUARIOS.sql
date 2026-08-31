-- ============================================================
-- La tabla usuarios_novusbet tiene columnas de un esquema viejo
-- (de un intento anterior) marcadas como NOT NULL, que el sync
-- actual no llena (ej: id_usuario_novusbet). Esto quita la
-- restricción NOT NULL de cualquier columna vieja que la tenga,
-- excepto el id interno (clave primaria). Seguro de correr varias
-- veces, no borra columnas ni datos.
-- ============================================================

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'usuarios_novusbet'
      AND is_nullable = 'NO'
      AND column_name <> 'id'
  LOOP
    EXECUTE format('ALTER TABLE usuarios_novusbet ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
END $$;

-- Verificación: no debería quedar ninguna fila (salvo "id")
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios_novusbet' AND is_nullable = 'NO';
