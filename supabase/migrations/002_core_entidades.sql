-- =====================================================================
-- 002 · Entidades (usuarios y administradores)
-- =====================================================================
-- Unifica public.usuarios (huérfana) + public.usuarios_novusbet en una
-- sola entidad, y separa sus atributos por naturaleza:
--
--   core.usuario           → identidad y clasificación (estable)
--   core.usuario_contacto  → datos personales / PII  (acceso restringido)
--   core.usuario_saldo     → saldos                  (volátil, se sobrescribe)
--   core.usuario_metrica   → métricas acumuladas     (derivadas)
--
-- Columnas duplicadas de usuarios_novusbet que aquí se colapsan en una:
--   username / usuario                        → username
--   id_usuario_novusbet / id_usuario          → id_externo
--   id_padre / nombre_usuario_padre / padre   → padre_id (FK a sí misma)
--   fecha_registro / fecha_creacion           → fecha_registro
--   casa_apuestas / sitio                     → sitio_id
-- =====================================================================

-- ---------------------------------------------------------------------
-- core.usuario
-- ---------------------------------------------------------------------
create table if not exists core.usuario (
  id                bigint generated always as identity primary key,
  sitio_id          smallint not null references core.sitio(id) on update cascade,
  id_externo        text     not null,
  username          text     not null,
  nombre            text,
  apellido          text,
  padre_id          bigint   references core.usuario(id) on delete set null,
  tipo_usuario_id   smallint references core.tipo_usuario(id) on update cascade,
  sub_tipo_id       smallint references core.tipo_usuario(id) on update cascade,
  estado_cliente_id smallint references core.estado_cliente(id) on update cascade,
  conexion_id       smallint references core.conexion(id) on update cascade,
  moneda_codigo     char(3)  references core.moneda(codigo) on update cascade,
  bono_activo       boolean  not null default false,
  activo            boolean  not null default true,
  fecha_registro    timestamptz,
  primer_deposito   timestamptz,
  ultimo_acceso     timestamptz,
  creado_at         timestamptz not null default now(),
  actualizado_at    timestamptz not null default now(),

  -- Clave natural: un id externo es único dentro de su sitio, no globalmente.
  constraint usuario_sitio_externo_uk unique (sitio_id, id_externo),
  constraint usuario_no_es_su_propio_padre check (padre_id is distinct from id)
);

create index if not exists usuario_username_idx  on core.usuario(username);
create index if not exists usuario_padre_idx     on core.usuario(padre_id);
create index if not exists usuario_sitio_idx     on core.usuario(sitio_id);
create index if not exists usuario_estado_idx    on core.usuario(estado_cliente_id);

comment on table core.usuario is
  'Entidad única de usuario. Sustituye a public.usuarios y public.usuarios_novusbet.';
comment on column core.usuario.padre_id is
  'Reemplaza id_padre + nombre_usuario_padre + padre: la relación se resuelve por FK, no por texto.';

-- ---------------------------------------------------------------------
-- core.usuario_contacto  ·  DATOS PERSONALES
-- Aislados en su propia tabla para poder denegar el acceso con RLS sin
-- perder la lectura del resto del perfil (ver 007_rls.sql).
-- ---------------------------------------------------------------------
create table if not exists core.usuario_contacto (
  usuario_id      bigint primary key
                  references core.usuario(id) on delete cascade,
  correo          text,
  telefono        text,
  tipo_documento  text,
  numero_documento text,
  direccion_ip    inet,
  external_id     text,
  actualizado_at  timestamptz not null default now()
);

create index if not exists usuario_contacto_correo_idx on core.usuario_contacto(correo);

comment on table core.usuario_contacto is
  'PII: correo, teléfono, documento e IP. Separada de core.usuario para control de acceso.';

-- ---------------------------------------------------------------------
-- core.usuario_saldo  ·  estado financiero actual (se sobrescribe)
-- ---------------------------------------------------------------------
create table if not exists core.usuario_saldo (
  usuario_id      bigint primary key
                  references core.usuario(id) on delete cascade,
  saldo           numeric(14,2) not null default 0,
  saldo_retirable numeric(14,2) not null default 0,
  bono            numeric(14,2) not null default 0,
  actualizado_at  timestamptz not null default now()
);

comment on table core.usuario_saldo is
  'Saldo puntual. Separado de core.usuario porque cambia con cada sincronización.';

-- ---------------------------------------------------------------------
-- core.usuario_metrica  ·  acumulados derivados
-- Unifica: usuarios.saldo_cuenta/ganancias_totales/perdidas_totales
--          + perfil_apuestas_usuarios.promedio_apuesta
-- ---------------------------------------------------------------------
create table if not exists core.usuario_metrica (
  usuario_id        bigint primary key
                    references core.usuario(id) on delete cascade,
  promedio_apuesta  numeric(14,2) not null default 0,
  ganancias_totales numeric(14,2) not null default 0,
  perdidas_totales  numeric(14,2) not null default 0,
  ultima_actividad  timestamptz,
  actualizado_at    timestamptz not null default now()
);

comment on table core.usuario_metrica is
  'Acumulados recalculables. Sustituye a public.perfil_apuestas_usuarios.';

-- ---------------------------------------------------------------------
-- core.admin_usuario  ·  cuentas del panel
-- ---------------------------------------------------------------------
create table if not exists core.rol_admin (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

insert into core.rol_admin (codigo, nombre) values
  ('admin',      'Administrador'),
  ('supervisor', 'Supervisor'),
  ('lectura',    'Solo lectura')
on conflict (codigo) do nothing;

create table if not exists core.admin_usuario (
  id            bigint generated always as identity primary key,
  username      text not null unique,
  password_hash text not null,
  salt          text not null,
  rol_id        smallint not null references core.rol_admin(id) on update cascade,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now()
);
