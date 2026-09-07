-- =====================================================================
-- 003 · Hechos (transacciones, apuestas y alertas)
-- =====================================================================
-- core.transaccion unifica las DOS tablas de transacciones que hoy
-- conviven guardando lo mismo:
--     public.transacciones_novusbet  (pipeline NovusBet, en español)
--     public.transaction_records     (pipeline extraccionDatos.py, en inglés)
--
-- Se eliminan las columnas que dependían del usuario y no de la
-- transacción — dependencias transitivas, 3FN:
--     usuario, casa_apuestas, estado_cliente, moneda, connection,
--     username, user_type, parent_id, site
-- Todas se obtienen ahora con un JOIN a core.usuario.
-- =====================================================================

create table if not exists core.transaccion (
  id                  bigint generated always as identity primary key,

  -- Identidad del hecho
  sitio_id            smallint not null references core.sitio(id) on update cascade,
  id_externo          text     not null,
  usuario_id          bigint   not null references core.usuario(id),
  fecha               timestamptz not null,

  -- Clasificación (todo por FK, nunca texto libre)
  tipo_transaccion_id smallint references core.tipo_transaccion(id) on update cascade,
  disciplina_id       smallint not null references core.disciplina(id) on update cascade,
  juego_id            integer  references core.juego(id) on update cascade,
  causal_id           integer  references core.causal(id) on update cascade,
  billetera_id        smallint references core.billetera(id) on update cascade,
  moneda_codigo       char(3)  references core.moneda(codigo) on update cascade,

  -- Medidas
  monto               numeric(14,2) not null default 0,
  ingresos            numeric(14,2) not null default 0,
  comision            numeric(14,2) not null default 0,
  saldo               numeric(14,2) not null default 0,
  saldo_actual        numeric(14,2) not null default 0,

  -- Texto libre real (no clasificable)
  descripcion         text,
  nota                text,

  -- Trazabilidad de la carga
  origen              text not null default 'novusbet',
  archivo_origen      text,
  raw                 jsonb not null default '{}'::jsonb,
  importado_at        timestamptz not null default now(),

  -- Una transacción externa no puede entrar dos veces por el mismo sitio.
  constraint transaccion_sitio_externo_uk unique (sitio_id, id_externo),
  constraint transaccion_origen_ck check (origen in ('novusbet', 'backoffice', 'csv'))
);

create index if not exists transaccion_fecha_idx      on core.transaccion(fecha desc);
create index if not exists transaccion_usuario_idx    on core.transaccion(usuario_id, fecha desc);
create index if not exists transaccion_disciplina_idx on core.transaccion(disciplina_id);
create index if not exists transaccion_juego_idx      on core.transaccion(juego_id);
create index if not exists transaccion_tipo_idx       on core.transaccion(tipo_transaccion_id);

comment on table core.transaccion is
  'Tabla de hechos única. Sustituye a transacciones_novusbet y transaction_records.';
comment on column core.transaccion.raw is
  'Fila original del CSV. Se conserva para auditoría, no para consultar.';

-- ---------------------------------------------------------------------
-- core.apuesta_deportiva  ·  tickets de deporte
-- Sustituye a public.apuestas_deportivas.
-- Cambios: owner/id_usuario_externo/site → usuario_id;
--          `dia` eliminado (dependía de `fecha`, dependencia parcial);
--          `pendiente` eliminado (equivale a outcome is null).
-- ---------------------------------------------------------------------
create table if not exists core.apuesta_deportiva (
  id               bigint generated always as identity primary key,
  ticket_id        text not null,
  ticket_code      text,
  sitio_id         smallint not null references core.sitio(id) on update cascade,
  usuario_id       bigint   not null references core.usuario(id),
  moneda_codigo    char(3)  references core.moneda(codigo) on update cascade,

  coupon_type      text,
  bet_type         text,
  bono             text,

  fecha            timestamptz not null,
  fecha_outcome    timestamptz,
  fecha_pago       timestamptz,

  monto            numeric(14,2) not null default 0,
  comision         numeric(14,2) not null default 0,
  total_odds       numeric(12,4) not null default 0,
  no_eventos       integer not null default 0,
  bono_pagado      numeric(14,2) not null default 0,
  ganancia_base    numeric(14,2) not null default 0,
  ganancia         numeric(14,2) not null default 0,
  ganancia_impuesto numeric(14,2) not null default 0,

  outcome          text,
  aplicacion       text,
  navegador        text,
  fuente           text not null default 'csv',
  importado_at     timestamptz not null default now(),

  constraint apuesta_sitio_ticket_uk unique (sitio_id, ticket_id),
  constraint apuesta_no_eventos_ck check (no_eventos >= 0)
);

create index if not exists apuesta_fecha_idx   on core.apuesta_deportiva(fecha desc);
create index if not exists apuesta_usuario_idx on core.apuesta_deportiva(usuario_id, fecha desc);
create index if not exists apuesta_outcome_idx on core.apuesta_deportiva(outcome);

comment on column core.apuesta_deportiva.outcome is
  'NULL = pendiente. Sustituye a la columna redundante `pendiente`.';

-- ---------------------------------------------------------------------
-- core.alerta  ·  una sola tabla para los dos tipos
-- Sustituye a public.alertas_apuestas + public.alertas_ganancias,
-- que tenían columnas idénticas salvo `motivo_alerta` / `patron`.
--
-- Se eliminan usuario, casa_apuestas, disciplina, juego, descripcion y
-- fecha: todos se obtienen de la transacción referenciada.
-- ---------------------------------------------------------------------
create table if not exists core.alerta (
  id             bigint generated always as identity primary key,
  tipo_alerta_id smallint not null references core.tipo_alerta(id) on update cascade,
  transaccion_id bigint   not null references core.transaccion(id) on delete cascade,
  severidad_id   smallint not null references core.severidad(id) on update cascade,
  monto          numeric(14,2) not null,
  umbral_usado   numeric(14,2),
  motivo         text,
  vista          boolean not null default false,
  creado_at      timestamptz not null default now(),

  -- Una transacción genera como máximo una alerta de cada tipo.
  constraint alerta_transaccion_tipo_uk unique (transaccion_id, tipo_alerta_id)
);

create index if not exists alerta_pendientes_idx
  on core.alerta(creado_at desc) where not vista;
create index if not exists alerta_tipo_idx on core.alerta(tipo_alerta_id);

comment on table core.alerta is
  'Alertas de apuestas y ganancias unificadas; el tipo distingue el origen.';

-- ---------------------------------------------------------------------
-- core.parametro  ·  configuración clave-valor
-- Sustituye a public.parametros_alerta_apuestas, que usaba el patrón
-- "tabla de una sola fila" (id integer default 1 check (id = 1)).
-- ---------------------------------------------------------------------
create table if not exists core.parametro (
  clave          text primary key,
  valor_numerico numeric,
  valor_texto    text,
  descripcion    text,
  actualizado_at timestamptz not null default now()
);

insert into core.parametro (clave, valor_numerico, descripcion) values
  ('umbral_alerta_apuesta',  null, 'Umbral global de monto para alertar una apuesta'),
  ('umbral_alerta_ganancia', null, 'Umbral global de monto para alertar una ganancia')
on conflict (clave) do nothing;
