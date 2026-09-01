-- ============================================================
-- Recalcula la columna "juegos" de resumen_diario_usuarios usando el
-- es_apuesta REAL guardado por transacción (no un filtro de palabras).
-- Esto corrige de raíz cosas como "N1Co" y "DitoBanx" (proveedores de
-- depósito, no juegos) que se colaron en versiones anteriores del
-- código porque agregaban CUALQUIER descripción con nombre, sin
-- chequear si era una apuesta de verdad.
--
-- Acotado a los días que ya existen en resumen_diario_usuarios (por
-- ahora 2026-08-31 y 2026-09-01) para que sea rápido — si en el futuro
-- hace falta correrlo para más días, ajustá el rango de fechas de abajo.
-- ============================================================

UPDATE resumen_diario_usuarios r
SET juegos = COALESCE(agregado.juegos, ARRAY[]::text[])
FROM (
  SELECT
    id_usuario_novusbet,
    fecha::date AS dia,
    array_agg(DISTINCT juego) AS juegos
  FROM transacciones_novusbet
  WHERE es_apuesta = true
    AND juego IS NOT NULL
    AND juego <> ''
    AND fecha >= '2026-08-31'
    AND fecha < '2026-09-02'
  GROUP BY id_usuario_novusbet, fecha::date
) AS agregado
WHERE r.id_usuario_novusbet = agregado.id_usuario_novusbet
  AND r.dia = agregado.dia;

-- Verificación: no debería aparecer ninguno de estos nombres nunca más.
SELECT dia, count(*) AS filas_con_ese_juego
FROM resumen_diario_usuarios, unnest(juegos) AS j
WHERE j IN ('N1Co', 'DitoBanx', 'Premio', '{{gamename}}', '{gameName}}')
GROUP BY dia;
