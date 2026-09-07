-- =====================================================================
-- 001 · Dimensiones (catálogos)
-- =====================================================================
-- Reemplaza todas las columnas de texto libre repetidas en las tablas de
-- hechos (casa_apuestas, disciplina, juego, moneda, billeteras,
-- grupo_causal, estado_cliente, tipo...) por catálogos con clave numérica.
--
-- Se construye en el esquema `core` para poder convivir con las tablas
-- actuales de `public` durante la migración. Nada de lo existente se toca.
-- =====================================================================

create schema if not exists core;
comment on schema core is
  'Modelo normalizado (3FN) del dashboard. Ver supabase/NORMALIZACION.md';

grant usage on schema core to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Sitio / casa de apuestas
-- Unifica: public.dim_casa_apuestas, transacciones_novusbet.casa_apuestas,
--          transaction_records.site, usuarios_novusbet.sitio
-- ---------------------------------------------------------------------
create table if not exists core.sitio (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  activo      boolean not null default true,
  creado_at   timestamptz not null default now()
);
comment on table core.sitio is 'Casas de apuestas / sitios origen de los datos.';

-- ---------------------------------------------------------------------
-- Disciplina
-- Unifica: public.disciplinas (huérfana), transaction_records.discipline,
--          transacciones_novusbet.disciplina, daily_metrics.discipline
-- ---------------------------------------------------------------------
create table if not exists core.disciplina (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  icono       text,
  activa      boolean not null default true,
  creado_at   timestamptz not null default now()
);
comment on table core.disciplina is
  'Catálogo de disciplinas. Los códigos coinciden con classify_discipline() en extraccionDatos.py.';

insert into core.disciplina (codigo, nombre) values
  ('casino',   'Casino'),
  ('deportes', 'Deportes'),
  ('otros',    'Otros')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Juego  (depende de disciplina)
-- Unifica: public.dim_juego, game_stats.juego + game_stats.proveedor
-- ---------------------------------------------------------------------
create table if not exists core.juego (
  id            integer generated always as identity primary key,
  nombre        text not null,
  proveedor     text,
  disciplina_id smallint not null
                references core.disciplina(id) on update cascade,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now(),
  constraint juego_nombre_proveedor_uk unique (nombre, proveedor)
);
create index if not exists juego_disciplina_idx on core.juego(disciplina_id);

-- ---------------------------------------------------------------------
-- Tipo de transacción
-- Unifica: public.dim_tipo_transaccion, transaction_records.transaction_type
-- ---------------------------------------------------------------------
create table if not exists core.tipo_transaccion (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  es_apuesta  boolean not null default false,
  es_ganancia boolean not null default false,
  creado_at   timestamptz not null default now()
);
comment on column core.tipo_transaccion.es_apuesta is
  'Sustituye a transacciones_novusbet.es_apuesta: la naturaleza depende del tipo, no de la fila.';

-- ---------------------------------------------------------------------
-- Estado del cliente
-- Unifica: public.estados_usuario (huérfana),
--          transaction_records.client_status, transacciones_novusbet.estado_cliente
-- ---------------------------------------------------------------------
create table if not exists core.estado_cliente (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  activo      boolean not null default true
);

insert into core.estado_cliente (codigo, nombre) values
  ('activo',   'Activo'),
  ('inactivo', 'Inactivo'),
  ('otros',    'Sin clasificar')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Tipo de conexión
-- Unifica: transaction_records.connection, daily_metrics.connection_type,
--          daily_metrics.online_users / retail_users (columnas-valor)
-- ---------------------------------------------------------------------
create table if not exists core.conexion (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

insert into core.conexion (codigo, nombre) values
  ('online',      'Online'),
  ('retail',      'Retail'),
  ('desconocido', 'Desconocido')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Tipo de usuario
-- Unifica: public.tipos_usuario (huérfana), transaction_records.user_type,
--          usuarios_novusbet.tipo / sub_tipo
-- ---------------------------------------------------------------------
create table if not exists core.tipo_usuario (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  permisos    jsonb not null default '{}'::jsonb,
  creado_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Moneda
-- Unifica: transaction_records.currency, transacciones_novusbet.moneda,
--          usuarios_novusbet.moneda, apuestas_deportivas.moneda
-- ---------------------------------------------------------------------
create table if not exists core.moneda (
  codigo  char(3) primary key,
  nombre  text not null,
  simbolo text
);

insert into core.moneda (codigo, nombre, simbolo) values
  ('USD', 'Dólar estadounidense', '$'),
  ('PEN', 'Sol peruano',          'S/'),
  ('EUR', 'Euro',                 '€')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Billetera
-- Unifica: transaction_records.wallet, transacciones_novusbet.billeteras
-- ---------------------------------------------------------------------
create table if not exists core.billetera (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

-- ---------------------------------------------------------------------
-- Grupo causal → Causal  (jerarquía de 2 niveles)
-- Unifica: transaction_records.causal_group / causal / causal_product,
--          transacciones_novusbet.grupo_causal
-- ---------------------------------------------------------------------
create table if not exists core.grupo_causal (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

create table if not exists core.causal (
  id              integer generated always as identity primary key,
  grupo_causal_id smallint not null
                  references core.grupo_causal(id) on update cascade,
  codigo          text not null,
  producto        text,
  constraint causal_grupo_codigo_uk unique (grupo_causal_id, codigo, producto)
);
create index if not exists causal_grupo_idx on core.causal(grupo_causal_id);

-- ---------------------------------------------------------------------
-- Alertas: tipo y severidad
-- Unifica: public.alertas_apuestas + public.alertas_ganancias
--          (dos tablas idénticas que solo se diferencian en el tipo)
-- ---------------------------------------------------------------------
create table if not exists core.tipo_alerta (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text
);

insert into core.tipo_alerta (codigo, nombre, descripcion) values
  ('apuesta',  'Apuesta atípica',  'Sustituye a public.alertas_apuestas'),
  ('ganancia', 'Ganancia atípica', 'Sustituye a public.alertas_ganancias')
on conflict (codigo) do nothing;

create table if not exists core.severidad (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  orden  smallint not null default 0
);

insert into core.severidad (codigo, nombre, orden) values
  ('normal', 'Normal', 1),
  ('alta',   'Alta',   2),
  ('critica','Crítica',3)
on conflict (codigo) do nothing;
