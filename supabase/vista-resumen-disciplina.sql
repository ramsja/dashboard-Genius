-- Vista que el dashboard publico consulta en vivo:
--   window.DASHBOARD_CONFIG.supabase.view = 'transaction_discipline_summary'
--   GET /rest/v1/transaction_discipline_summary
--       ?select=discipline,client_status,connection,records,total,income
--
-- Hoy esa vista NO existe en el proyecto Supabase: la peticion devuelve
-- 404 PGRST205 ("Could not find the table 'public.transaction_discipline_summary'")
-- y dashboard/app.js cae silenciosamente al JSON estatico en cada carga.
--
-- supabase/schema.sql define la misma vista, pero sobre una tabla con columnas
-- numericas que nunca se desplego. La tabla real se creo con migration_fix.sql,
-- donde total e ingresos son TEXT; por eso aqui se convierte el texto a numero
-- en vez de sumarlo directo.
--
-- Aplicar pegando este archivo en el editor SQL de Supabase.

create or replace function public.texto_a_numero(valor text)
returns numeric
language sql
immutable
as $$
    select case
        when valor is null then 0
        when replace(replace(btrim(valor), ',', ''), '$', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then replace(replace(btrim(valor), ',', ''), '$', '')::numeric
        else 0
    end;
$$;

comment on function public.texto_a_numero(text) is
    'Convierte importes guardados como TEXT a numeric; 0 si el valor no es numerico.';

create or replace view public.transaction_discipline_summary as
select
    coalesce(nullif(btrim(discipline), ''), 'otros')       as discipline,
    coalesce(nullif(btrim(client_status), ''), 'otros')    as client_status,
    coalesce(nullif(btrim(connection), ''), 'desconocido') as connection,
    count(*)                                              as records,
    sum(public.texto_a_numero(total))                      as total,
    sum(public.texto_a_numero(ingresos))                   as income
from public.transaction_records
group by 1, 2, 3;

comment on view public.transaction_discipline_summary is
    'Resumen por disciplina/estado/conexion que consume el dashboard publico.';

-- La clave anonima del sitio publicado solo necesita lectura.
grant select on public.transaction_discipline_summary to anon, authenticated;

-- Comprobacion: debe devolver filas una vez que transaction_records tenga datos.
-- select * from public.transaction_discipline_summary order by records desc;
