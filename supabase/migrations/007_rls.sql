-- =====================================================================
-- 007 · Row Level Security
-- =====================================================================
-- En Supabase, cualquiera con la clave `anon` (la que va incrustada en el
-- dashboard, en el navegador del cliente) puede leer toda tabla que no
-- tenga RLS activo. Hoy eso incluye correos, teléfonos, documentos e IPs.
--
-- Regla aplicada aquí:
--   · Catálogos                → lectura pública (no hay nada sensible)
--   · Hechos y agregados       → solo usuarios autenticados
--   · Datos personales (PII)   → solo service_role
-- =====================================================================

begin;

-- Activar RLS en todo el esquema
alter table core.sitio             enable row level security;
alter table core.disciplina        enable row level security;
alter table core.juego             enable row level security;
alter table core.tipo_transaccion  enable row level security;
alter table core.estado_cliente    enable row level security;
alter table core.conexion          enable row level security;
alter table core.tipo_usuario      enable row level security;
alter table core.moneda            enable row level security;
alter table core.billetera         enable row level security;
alter table core.grupo_causal      enable row level security;
alter table core.causal            enable row level security;
alter table core.tipo_alerta       enable row level security;
alter table core.severidad         enable row level security;
alter table core.rol_admin         enable row level security;

alter table core.usuario           enable row level security;
alter table core.usuario_contacto  enable row level security;
alter table core.usuario_saldo     enable row level security;
alter table core.usuario_metrica   enable row level security;
alter table core.admin_usuario     enable row level security;

alter table core.transaccion       enable row level security;
alter table core.apuesta_deportiva enable row level security;
alter table core.alerta            enable row level security;
alter table core.parametro         enable row level security;

alter table core.resumen_diario_usuario       enable row level security;
alter table core.resumen_diario_usuario_juego enable row level security;
alter table core.resumen_diario_juego         enable row level security;
alter table core.metrica_diaria               enable row level security;
alter table core.historico_diario             enable row level security;
alter table core.historico_diario_juego       enable row level security;
alter table core.estadistica_juego            enable row level security;

-- ---------------------------------------------------------------------
-- Catálogos: lectura para todos
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sitio','disciplina','juego','tipo_transaccion','estado_cliente',
    'conexion','tipo_usuario','moneda','billetera','grupo_causal',
    'causal','tipo_alerta','severidad'
  ] loop
    execute format(
      'create policy %I on core.%I for select to anon, authenticated using (true)',
      'lectura_publica_' || t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Hechos y agregados: solo sesión autenticada
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'usuario','usuario_saldo','usuario_metrica','transaccion',
    'apuesta_deportiva','alerta','parametro',
    'resumen_diario_usuario','resumen_diario_usuario_juego',
    'resumen_diario_juego','metrica_diaria','historico_diario',
    'historico_diario_juego','estadistica_juego'
  ] loop
    execute format(
      'create policy %I on core.%I for select to authenticated using (true)',
      'lectura_autenticada_' || t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- PII y credenciales: sin política de lectura.
-- Al tener RLS activo y ninguna policy, nadie los ve salvo service_role,
-- que ignora RLS por diseño.
-- ---------------------------------------------------------------------
comment on table core.usuario_contacto is
  'PII. RLS activo sin políticas: solo accesible con service_role (backend).';
comment on table core.admin_usuario is
  'Credenciales. RLS activo sin políticas: solo accesible con service_role.';

-- ---------------------------------------------------------------------
-- Permisos de tabla
-- ---------------------------------------------------------------------
-- RLS decide QUÉ FILAS se ven; GRANT decide si la tabla es visible.
-- Hacen falta los dos: sin GRANT, una policy permisiva no sirve de nada.
grant select on all tables in schema core to authenticated;

grant select on
  core.sitio, core.disciplina, core.juego, core.tipo_transaccion,
  core.estado_cliente, core.conexion, core.tipo_usuario, core.moneda,
  core.billetera, core.grupo_causal, core.causal, core.tipo_alerta,
  core.severidad
to anon;

-- PII y credenciales: fuera del alcance de las claves públicas
revoke all on core.usuario_contacto, core.admin_usuario from anon, authenticated;

alter default privileges in schema core
  grant select on tables to authenticated;

commit;

-- =====================================================================
-- Comprobación: ninguna tabla debe quedar sin RLS.
-- =====================================================================
-- select schemaname, tablename
--   from pg_tables
--  where schemaname in ('core', 'public')
--    and not rowsecurity;
