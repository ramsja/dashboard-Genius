-- Vistas y permisos para conectar Looker Studio al resumen del dashboard.
--
-- Ejecutar DESPUÉS de la primera pasada de dashboard/publicar-looker.py, que
-- es quien crea las tablas looker_*.  En Supabase: SQL Editor -> pegar -> Run.
--
-- Por qué hacen falta las vistas: las tablas de serie guardan una foto por
-- snapshot, así que si Looker Studio consulta la tabla cruda suma todas las
-- fotos y los totales salen multiplicados.  Las vistas «_actual» dejan solo el
-- último snapshot, que es lo que se quiere en un cuadro de mando.

-- ---------------------------------------------------------------------------
-- 1) Último snapshot: una sola foto, la buena para KPIs y tartas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW looker_kpis_actual AS
SELECT indicador, valor, unidad, generado
FROM looker_kpis
WHERE generado = (SELECT max(generado) FROM looker_kpis);

CREATE OR REPLACE VIEW looker_modulos_actual AS
SELECT modulo, indicador, valor, unidad, generado
FROM looker_resumen_modulos
WHERE generado = (SELECT max(generado) FROM looker_resumen_modulos);

CREATE OR REPLACE VIEW looker_matriz_actual AS
SELECT disciplina, conexion, transacciones, generado
FROM looker_matriz
WHERE generado = (SELECT max(generado) FROM looker_matriz)
  AND transacciones > 0;

CREATE OR REPLACE VIEW looker_dinero_actual AS
SELECT disciplina, ingresos_usd, total_usd, comision_usd, generado
FROM looker_dinero_disciplina
WHERE generado = (SELECT max(generado) FROM looker_dinero_disciplina);

CREATE OR REPLACE VIEW looker_estados_actual AS
SELECT estado, transacciones, generado
FROM looker_estados_cliente
WHERE generado = (SELECT max(generado) FROM looker_estados_cliente)
  AND transacciones > 0;

CREATE OR REPLACE VIEW looker_productos_actual AS
SELECT posicion, producto, transacciones, generado
FROM looker_productos
WHERE generado = (SELECT max(generado) FROM looker_productos);

CREATE OR REPLACE VIEW looker_rankings_actual AS
SELECT ranking, periodo, posicion, entidad, categoria, canal,
       apostado_usd, ganado_usd, neto_usd, movimientos, generado
FROM looker_rankings
WHERE generado = (SELECT max(generado) FROM looker_rankings);

-- ---------------------------------------------------------------------------
-- 2) Serie temporal: cómo evoluciona cada indicador snapshot a snapshot.
--    Para gráficos de línea con `generado` en el eje de tiempo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW looker_kpis_serie AS
SELECT generado, generado::date AS dia, indicador, valor, unidad
FROM looker_kpis;

-- ---------------------------------------------------------------------------
-- 3) Vista de cabecera: una fila por snapshot con los KPIs en columnas.
--    Cómoda para las tarjetas de puntuación (scorecards) de Looker Studio.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW looker_cabecera AS
SELECT
  generado,
  generado::date AS dia,
  max(valor) FILTER (WHERE indicador = 'Transacciones totales')  AS transacciones,
  max(valor) FILTER (WHERE indicador = 'Transacciones casino')   AS transacciones_casino,
  max(valor) FILTER (WHERE indicador = 'Transacciones deportes') AS transacciones_deportes,
  max(valor) FILTER (WHERE indicador = 'Ingresos')               AS ingresos_usd,
  max(valor) FILTER (WHERE indicador = 'Usuarios únicos')        AS usuarios,
  max(valor) FILTER (WHERE indicador = 'Volumen apostado')       AS volumen_apostado_usd,
  max(valor) FILTER (WHERE indicador = 'Tickets del periodo')    AS tickets
FROM looker_kpis
GROUP BY generado;

-- ---------------------------------------------------------------------------
-- 4) Tickets deportivos con los estados ya girados a columnas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW looker_tickets_actual AS
SELECT
  d.periodo, d.deporte, d.tickets, d.importe_usd, d.pendiente_usd,
  d.ganancias_usd, d.cuota_media,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Running'),  0) AS running,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Won'),      0) AS won,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Lost'),     0) AS lost,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Cashout'),  0) AS cashout,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Void'),     0) AS void,
  coalesce(sum(e.tickets) FILTER (WHERE e.estado = 'Rejected'), 0) AS rejected,
  d.generado
FROM looker_tickets_deporte d
LEFT JOIN looker_tickets_estado e USING (periodo, deporte)
GROUP BY d.periodo, d.deporte, d.tickets, d.importe_usd, d.pendiente_usd,
         d.ganancias_usd, d.cuota_media, d.generado;

-- ---------------------------------------------------------------------------
-- 5) Usuario de solo lectura para Looker Studio.
--    Nunca se le dan a Looker las credenciales de administración ni la
--    service role key: solo este rol, y solo sobre las tablas looker_*.
--    Cambia 'CLAVE_LARGA_AQUI' antes de ejecutar.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'looker_lector') THEN
    CREATE ROLE looker_lector LOGIN PASSWORD 'CLAVE_LARGA_AQUI';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO looker_lector;

-- Solo lectura, y solo sobre el resumen agregado: nada de transaction_records.
GRANT SELECT ON
  looker_kpis, looker_resumen_modulos, looker_matriz, looker_dinero_disciplina,
  looker_estados_cliente, looker_productos, looker_rankings,
  looker_historico_dia, looker_juegos, looker_tickets_deporte, looker_tickets_estado,
  looker_kpis_actual, looker_modulos_actual, looker_matriz_actual,
  looker_dinero_actual, looker_estados_actual, looker_productos_actual,
  looker_rankings_actual, looker_kpis_serie, looker_cabecera, looker_tickets_actual
TO looker_lector;

-- ---------------------------------------------------------------------------
-- 6) Blindaje en Supabase.
--
--    Supabase publica por su API REST todo lo que tenga permisos para los
--    roles `anon` y `authenticated` en el esquema public, y deja privilegios
--    por defecto que se los conceden a cualquier tabla nueva.  La anon key
--    viaja dentro de dashboard/config.js, que es publico en GitHub Pages: sin
--    esto, los KPIs y los rankings quedarian accesibles para cualquiera que
--    abriera el dashboard.
--
--    Se revocan esos permisos y se activa RLS como segunda barrera, por si
--    alguien vuelve a conceder un GRANT mas adelante.  El publicador sigue
--    escribiendo sin problema: se conecta como propietario de las tablas y el
--    propietario no pasa por RLS.
--
--    En un PostgreSQL que no sea Supabase estos roles no existen y el bloque
--    se salta solo.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  objeto text;
  publicos text[] := ARRAY['anon', 'authenticated'];
  rol text;
BEGIN
  FOREACH rol IN ARRAY publicos LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOR objeto IN
        SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'looker\_%'
          AND c.relkind IN ('r', 'v')
      LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', objeto, rol);
      END LOOP;
      RAISE NOTICE 'Permisos revocados a %', rol;
    END IF;
  END LOOP;
END
$$;

-- RLS sin politica abierta: nadie lee las tablas salvo el propietario (que las
-- escribe) y looker_lector (por la politica de abajo).
DO $$
DECLARE
  tabla text;
BEGIN
  FOR tabla IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'looker\_%' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('DROP POLICY IF EXISTS looker_lector_lee ON public.%I', tabla);
    EXECUTE format(
      'CREATE POLICY looker_lector_lee ON public.%I FOR SELECT TO looker_lector USING (true)',
      tabla);
  END LOOP;
END
$$;
