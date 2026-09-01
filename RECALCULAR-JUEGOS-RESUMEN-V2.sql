-- ============================================================
-- Seguimiento de RECALCULAR-JUEGOS-RESUMEN.sql. Ese primer script
-- filtraba solo por es_apuesta=true, así que dejó pasar "{{gamename}}":
-- ES una apuesta real, pero Novusbet nunca completó el nombre del
-- juego en su propio dato — no hay forma de recuperar qué juego era.
-- Este script además:
--   1) Limpia el campo juego en transacciones_novusbet para las
--      descripciones sin nombre real (placeholders sin rellenar,
--      cupones/apuestas de bono sin juego asociado), para que quede
--      corregido de raíz y no vuelva a filtrarse en futuros recálculos.
--   2) Unifica "Live Casino" / "Live casino" (mayúscula distinta del
--      mismo dato real de Novusbet) en un solo nombre.
--   3) Vuelve a armar resumen_diario_usuarios.juegos con los datos ya
--      corregidos.
-- Acotado a los días que ya existen en resumen_diario_usuarios (por
-- ahora 2026-08-31 y 2026-09-01).
-- ============================================================

-- 1) Limpia nombres sin juego real (placeholder sin rellenar, cupón/
--    apuesta de bono sin juego asociado).
UPDATE transacciones_novusbet
SET juego = ''
WHERE fecha >= '2026-08-31' AND fecha < '2026-09-02'
  AND juego IS NOT NULL AND juego <> ''
  AND (
    juego ~* '\{\{|\}\}'
    OR juego ~* '^apuesta de bono\y'
    OR juego ~* '^cup[oó]n\y'
    OR juego ~* '^premio$'
    OR juego ~* '^solicitud\y'
  );

-- 2) Unifica mayúsculas de "Live Casino".
UPDATE transacciones_novusbet
SET juego = 'Live Casino'
WHERE fecha >= '2026-08-31' AND fecha < '2026-09-02'
  AND juego ~* '^live casino$'
  AND juego <> 'Live Casino';

-- 3) Vuelve a armar el resumen con los datos ya corregidos.
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

-- Verificación: debería devolver 0 filas.
SELECT dia, count(*) AS filas_con_ese_juego
FROM resumen_diario_usuarios, unnest(juegos) AS j
WHERE j IN ('N1Co', 'DitoBanx', 'Premio', '{{gamename}}', '{gameName}}', 'Live casino')
GROUP BY dia;
