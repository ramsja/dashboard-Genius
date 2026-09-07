-- ============================================================================
--  DASHBOARD GENIUS · NORMALIZACIÓN COMPLETA
--  Un solo archivo. Pégalo entero en el SQL Editor de Supabase y ejecútalo.
-- ============================================================================
--
--  QUÉ HACE
--    1. Crea el esquema `core` con el modelo normalizado (3FN).
--    2. Copia tus datos de `public` a `core`.
--    3. Se verifica a sí mismo: cuenta las filas de origen y destino.
--    4. Solo si cuadra, mueve tus tablas a `legacy` y deja vistas en `public`
--       con los mismos nombres y columnas de siempre.
--    5. Activa la seguridad por fila (RLS) y cierra el acceso a los datos
--       personales y a las credenciales.
--
--  SEGURIDAD
--    Todo va dentro de UNA transacción. Si algo falla —o si la verificación
--    no cuadra— se deshace por completo y tu base queda exactamente como
--    estaba. No se borra ninguna tabla: las originales quedan intactas en el
--    esquema `legacy`.
--
--  SE PUEDE EJECUTAR VARIAS VECES
--    No duplica datos ni vuelve a mover lo ya movido.
--
--  PARA REVERTIR EL CORTE (si algo no te convence)
--    drop view public.transacciones_novusbet;   -- y las demás vistas
--    alter table legacy.transacciones_novusbet set schema public;
--
--  DESPUÉS DE EJECUTARLO
--    Las vistas de `public` son de SOLO LECTURA. Los procesos que escriben
--    (extraccionDatos.py y los importadores) deben pasar a insertar en `core`,
--    o seguir apuntando a `legacy` mientras los adaptas.
-- ============================================================================

begin;

set local statement_timeout = 0;

-- ============================================================================
--  PASO 0 · Comprobación previa
--  Verifica que estén todas las tablas que el proceso necesita leer.
-- ============================================================================
do $$
declare
  faltan text[] := array[]::text[];
  t text;
begin
  foreach t in array array[
    'dim_casa_apuestas','dim_juego','dim_tipo_transaccion',
    'transacciones_novusbet','transaction_records','usuarios_novusbet',
    'tipos_usuario','perfil_apuestas_usuarios','admin_usuarios',
    'alertas_apuestas','alertas_ganancias','parametros_alerta_apuestas',
    'resumen_diario_usuarios','resumen_diario_juegos','daily_metrics',
    'historico_csv_mensual','historico_csv_juegos','apuestas_deportivas',
    'game_stats'
  ] loop
    if to_regclass('public.' || t) is null then
      faltan := faltan || t;
    end if;
  end loop;

  if array_length(faltan, 1) > 0 then
    raise exception
      'No se encontraron estas tablas en el esquema public: %. No se ha modificado nada.',
      array_to_string(faltan, ', ');
  end if;

  raise notice 'Paso 0 · Comprobación previa correcta.';
end $$;

-- Los pasos 1-4 usan "if not exists": en una segunda ejecución avisarían de
-- cada objeto ya creado. Se silencian esos avisos, no los errores.
set local client_min_messages = warning;


-- ============================================================================
--  PASO 1 · Catálogos
--  Sustituyen a las columnas de texto libre repetidas en cada fila.
-- ============================================================================

create schema if not exists core;
comment on schema core is 'Modelo normalizado (3FN). Ver supabase/NORMALIZACION.md';

grant usage on schema core to anon, authenticated, service_role;

-- Sitio / casa de apuestas
-- Unifica: dim_casa_apuestas, transacciones_novusbet.casa_apuestas,
--          transaction_records.site, usuarios_novusbet.sitio
create table if not exists core.sitio (
  id        smallint generated always as identity primary key,
  codigo    text not null unique,
  nombre    text not null,
  activo    boolean not null default true,
  creado_at timestamptz not null default now()
);

-- Disciplina
-- Unifica: public.disciplinas, discipline, disciplina
create table if not exists core.disciplina (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  icono       text,
  activa      boolean not null default true,
  creado_at   timestamptz not null default now()
);

insert into core.disciplina (codigo, nombre) values
  ('casino','Casino'), ('deportes','Deportes'), ('otros','Otros')
on conflict (codigo) do nothing;

-- Juego (la disciplina viaja con el juego)
create table if not exists core.juego (
  id            integer generated always as identity primary key,
  nombre        text not null,
  proveedor     text,
  disciplina_id smallint not null references core.disciplina(id) on update cascade,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now(),
  constraint juego_nombre_proveedor_uk unique (nombre, proveedor)
);
create index if not exists juego_disciplina_idx on core.juego(disciplina_id);

-- Tipo de transacción
create table if not exists core.tipo_transaccion (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  es_apuesta  boolean not null default false,
  es_ganancia boolean not null default false,
  creado_at   timestamptz not null default now()
);
comment on column core.tipo_transaccion.es_apuesta is
  'Sustituye a transacciones_novusbet.es_apuesta: depende del tipo, no de la fila.';

-- Estado del cliente
create table if not exists core.estado_cliente (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  activo      boolean not null default true
);

insert into core.estado_cliente (codigo, nombre) values
  ('activo','Activo'), ('inactivo','Inactivo'), ('otros','Sin clasificar')
on conflict (codigo) do nothing;

-- Tipo de conexión
create table if not exists core.conexion (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

insert into core.conexion (codigo, nombre) values
  ('online','Online'), ('retail','Retail'), ('desconocido','Desconocido')
on conflict (codigo) do nothing;

-- Tipo de usuario
create table if not exists core.tipo_usuario (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  permisos    jsonb not null default '{}'::jsonb,
  creado_at   timestamptz not null default now()
);

-- Moneda
create table if not exists core.moneda (
  codigo  char(3) primary key,
  nombre  text not null,
  simbolo text
);

insert into core.moneda (codigo, nombre, simbolo) values
  ('USD','Dólar estadounidense','$'), ('PEN','Sol peruano','S/'), ('EUR','Euro','€')
on conflict (codigo) do nothing;

-- Billetera
create table if not exists core.billetera (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

-- Grupo causal → Causal
create table if not exists core.grupo_causal (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

create table if not exists core.causal (
  id              integer generated always as identity primary key,
  grupo_causal_id smallint not null references core.grupo_causal(id) on update cascade,
  codigo          text not null,
  producto        text,
  constraint causal_grupo_codigo_uk unique (grupo_causal_id, codigo, producto)
);
create index if not exists causal_grupo_idx on core.causal(grupo_causal_id);

-- Alertas: tipo y severidad
create table if not exists core.tipo_alerta (
  id          smallint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text
);

insert into core.tipo_alerta (codigo, nombre, descripcion) values
  ('apuesta','Apuesta atípica','Sustituye a public.alertas_apuestas'),
  ('ganancia','Ganancia atípica','Sustituye a public.alertas_ganancias')
on conflict (codigo) do nothing;

create table if not exists core.severidad (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  orden  smallint not null default 0
);

insert into core.severidad (codigo, nombre, orden) values
  ('normal','Normal',1), ('alta','Alta',2), ('critica','Crítica',3)
on conflict (codigo) do nothing;

create table if not exists core.rol_admin (
  id     smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null
);

insert into core.rol_admin (codigo, nombre) values
  ('admin','Administrador'), ('supervisor','Supervisor'), ('lectura','Solo lectura')
on conflict (codigo) do nothing;


-- ============================================================================
--  PASO 2 · Usuarios
--  Unifica public.usuarios y public.usuarios_novusbet en una sola entidad, y
--  separa sus atributos por naturaleza. Las columnas duplicadas se colapsan:
--    username / usuario                       -> username
--    id_usuario_novusbet / id_usuario         -> id_externo
--    id_padre / nombre_usuario_padre / padre  -> padre_id (clave foránea)
--    fecha_registro / fecha_creacion          -> fecha_registro
--    casa_apuestas / sitio                    -> sitio_id
-- ============================================================================

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
  constraint usuario_sitio_externo_uk unique (sitio_id, id_externo),
  constraint usuario_no_es_su_propio_padre check (padre_id is distinct from id)
);

create index if not exists usuario_username_idx on core.usuario(username);
create index if not exists usuario_padre_idx    on core.usuario(padre_id);
create index if not exists usuario_sitio_idx    on core.usuario(sitio_id);
create index if not exists usuario_estado_idx   on core.usuario(estado_cliente_id);

-- DATOS PERSONALES · aislados para poder cerrarles el acceso con RLS
create table if not exists core.usuario_contacto (
  usuario_id       bigint primary key references core.usuario(id) on delete cascade,
  correo           text,
  telefono         text,
  tipo_documento   text,
  numero_documento text,
  direccion_ip     inet,
  external_id      text,
  actualizado_at   timestamptz not null default now()
);
create index if not exists usuario_contacto_correo_idx on core.usuario_contacto(correo);

comment on table core.usuario_contacto is
  'PII: correo, teléfono, documento e IP. Separada de core.usuario para control de acceso.';

-- Saldo actual (volátil, se sobrescribe en cada sincronización)
create table if not exists core.usuario_saldo (
  usuario_id      bigint primary key references core.usuario(id) on delete cascade,
  saldo           numeric(14,2) not null default 0,
  saldo_retirable numeric(14,2) not null default 0,
  bono            numeric(14,2) not null default 0,
  actualizado_at  timestamptz not null default now()
);

-- Acumulados derivados (sustituye a perfil_apuestas_usuarios)
create table if not exists core.usuario_metrica (
  usuario_id        bigint primary key references core.usuario(id) on delete cascade,
  promedio_apuesta  numeric(14,2) not null default 0,
  ganancias_totales numeric(14,2) not null default 0,
  perdidas_totales  numeric(14,2) not null default 0,
  ultima_actividad  timestamptz,
  actualizado_at    timestamptz not null default now()
);

create table if not exists core.admin_usuario (
  id            bigint generated always as identity primary key,
  username      text not null unique,
  password_hash text not null,
  salt          text not null,
  rol_id        smallint not null references core.rol_admin(id) on update cascade,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now()
);


-- ============================================================================
--  PASO 3 · Hechos
--  core.transaccion unifica las DOS tablas que hoy guardan lo mismo:
--    public.transacciones_novusbet  (pipeline NovusBet, en español)
--    public.transaction_records     (pipeline extraccionDatos.py, en inglés)
--  Se eliminan las columnas que dependían del usuario y no de la transacción
--  (usuario, casa_apuestas, estado_cliente, moneda, site, username...):
--  ahora se obtienen con un JOIN a core.usuario.
-- ============================================================================

create table if not exists core.transaccion (
  id                  bigint generated always as identity primary key,
  sitio_id            smallint not null references core.sitio(id) on update cascade,
  id_externo          text     not null,
  usuario_id          bigint   not null references core.usuario(id),
  fecha               timestamptz not null,
  tipo_transaccion_id smallint references core.tipo_transaccion(id) on update cascade,
  disciplina_id       smallint not null references core.disciplina(id) on update cascade,
  juego_id            integer  references core.juego(id) on update cascade,
  causal_id           integer  references core.causal(id) on update cascade,
  billetera_id        smallint references core.billetera(id) on update cascade,
  moneda_codigo       char(3)  references core.moneda(codigo) on update cascade,
  monto               numeric(14,2) not null default 0,
  ingresos            numeric(14,2) not null default 0,
  comision            numeric(14,2) not null default 0,
  saldo               numeric(14,2) not null default 0,
  saldo_actual        numeric(14,2) not null default 0,
  descripcion         text,
  nota                text,
  origen              text not null default 'novusbet',
  archivo_origen      text,
  raw                 jsonb not null default '{}'::jsonb,
  importado_at        timestamptz not null default now(),
  constraint transaccion_sitio_externo_uk unique (sitio_id, id_externo),
  constraint transaccion_origen_ck check (origen in ('novusbet','backoffice','csv'))
);

create index if not exists transaccion_fecha_idx      on core.transaccion(fecha desc);
create index if not exists transaccion_usuario_idx    on core.transaccion(usuario_id, fecha desc);
create index if not exists transaccion_disciplina_idx on core.transaccion(disciplina_id);
create index if not exists transaccion_juego_idx      on core.transaccion(juego_id);
create index if not exists transaccion_tipo_idx       on core.transaccion(tipo_transaccion_id);

-- Tickets de deporte. `dia` se quita (se deducía de `fecha`) y `pendiente`
-- también (equivalía a outcome is null).
create table if not exists core.apuesta_deportiva (
  id                bigint generated always as identity primary key,
  ticket_id         text not null,
  ticket_code       text,
  sitio_id          smallint not null references core.sitio(id) on update cascade,
  usuario_id        bigint   not null references core.usuario(id),
  moneda_codigo     char(3)  references core.moneda(codigo) on update cascade,
  coupon_type       text,
  bet_type          text,
  bono              text,
  fecha             timestamptz not null,
  fecha_outcome     timestamptz,
  fecha_pago        timestamptz,
  monto             numeric(14,2) not null default 0,
  comision          numeric(14,2) not null default 0,
  total_odds        numeric(12,4) not null default 0,
  no_eventos        integer not null default 0,
  bono_pagado       numeric(14,2) not null default 0,
  ganancia_base     numeric(14,2) not null default 0,
  ganancia          numeric(14,2) not null default 0,
  ganancia_impuesto numeric(14,2) not null default 0,
  outcome           text,
  aplicacion        text,
  navegador         text,
  fuente            text not null default 'csv',
  importado_at      timestamptz not null default now(),
  constraint apuesta_sitio_ticket_uk unique (sitio_id, ticket_id),
  constraint apuesta_no_eventos_ck check (no_eventos >= 0)
);

create index if not exists apuesta_fecha_idx   on core.apuesta_deportiva(fecha desc);
create index if not exists apuesta_usuario_idx on core.apuesta_deportiva(usuario_id, fecha desc);
create index if not exists apuesta_outcome_idx on core.apuesta_deportiva(outcome);

-- Una sola tabla para los dos tipos de alerta. Se eliminan usuario,
-- casa_apuestas, disciplina, juego, descripcion y fecha: vienen de la
-- transacción referenciada.
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
  constraint alerta_transaccion_tipo_uk unique (transaccion_id, tipo_alerta_id)
);

create index if not exists alerta_pendientes_idx on core.alerta(creado_at desc) where not vista;
create index if not exists alerta_tipo_idx       on core.alerta(tipo_alerta_id);

-- Configuración clave-valor. Sustituye a la tabla de una sola fila
-- parametros_alerta_apuestas (id integer default 1 check (id = 1)).
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


-- ============================================================================
--  PASO 4 · Agregados
--  Tres correcciones:
--    1FN  resumen_diario_usuarios.juegos y .disciplinas eran columnas ARRAY.
--         Un array dentro de una celda no se puede filtrar ni sumar. Pasa a
--         una tabla hija con una fila por juego.
--    2FN  los resúmenes repetían usuario y casa_apuestas pese a depender solo
--         del usuario. Ahora es clave foránea.
--    ---  resumen_mensual_usuarios y ranking_historico_base no aportan datos
--         nuevos: son sumas de las tablas diarias. Pasan a ser vistas.
-- ============================================================================

create table if not exists core.resumen_diario_usuario (
  usuario_id       bigint not null references core.usuario(id) on delete cascade,
  dia              date   not null,
  transacciones    integer not null default 0,
  apuestas         integer not null default 0,
  monto_total      numeric(14,2) not null default 0,
  apostado         numeric(14,2) not null default 0,
  ganado           numeric(14,2) not null default 0,
  beneficio        numeric(14,2) generated always as (ganado - apostado) stored,
  ultima_actividad timestamptz,
  actualizado_at   timestamptz not null default now(),
  primary key (usuario_id, dia)
);
create index if not exists resumen_diario_usuario_dia_idx on core.resumen_diario_usuario(dia desc);

comment on column core.resumen_diario_usuario.beneficio is
  'Columna calculada: ganado - apostado. No se puede almacenar un valor incoherente.';

-- Corrige la 1FN: reemplaza a resumen_diario_usuarios.juegos (ARRAY)
create table if not exists core.resumen_diario_usuario_juego (
  usuario_id bigint  not null,
  dia        date    not null,
  juego_id   integer not null references core.juego(id) on update cascade,
  apuestas   integer not null default 0,
  apostado   numeric(14,2) not null default 0,
  ganado     numeric(14,2) not null default 0,
  primary key (usuario_id, dia, juego_id),
  foreign key (usuario_id, dia)
    references core.resumen_diario_usuario(usuario_id, dia) on delete cascade
);
create index if not exists resumen_diario_juego_fk_idx on core.resumen_diario_usuario_juego(juego_id);

create table if not exists core.resumen_diario_juego (
  juego_id            integer not null references core.juego(id) on update cascade,
  dia                 date    not null,
  apostado            numeric(14,2) not null default 0,
  ganado              numeric(14,2) not null default 0,
  apuestas            integer not null default 0,
  ganancias           integer not null default 0,
  jugadores_distintos integer not null default 0,
  actualizado_at      timestamptz not null default now(),
  primary key (juego_id, dia)
);
create index if not exists resumen_diario_juego_dia_idx on core.resumen_diario_juego(dia desc);

-- Sustituye a daily_metrics. online_users/retail_users eran columnas-valor:
-- la conexión ya forma parte de la clave.
create table if not exists core.metrica_diaria (
  dia                 date     not null,
  disciplina_id       smallint not null references core.disciplina(id) on update cascade,
  conexion_id         smallint not null references core.conexion(id) on update cascade,
  total_transacciones integer not null default 0,
  usuarios_unicos     integer not null default 0,
  ingresos            numeric(14,2) not null default 0,
  monto_total         numeric(14,2) not null default 0,
  comision            numeric(14,2) not null default 0,
  archivo_origen      text,
  actualizado_at      timestamptz not null default now(),
  primary key (dia, disciplina_id, conexion_id)
);
create index if not exists metrica_diaria_dia_idx on core.metrica_diaria(dia desc);

create table if not exists core.historico_diario (
  usuario_id   bigint not null references core.usuario(id) on delete cascade,
  dia          date   not null,
  apuestas     integer not null default 0,
  apostado     numeric(14,2) not null default 0,
  ganado       numeric(14,2) not null default 0,
  beneficio    numeric(14,2) generated always as (ganado - apostado) stored,
  importado_at timestamptz not null default now(),
  primary key (usuario_id, dia)
);
create index if not exists historico_diario_dia_idx on core.historico_diario(dia desc);

create table if not exists core.historico_diario_juego (
  juego_id            integer not null references core.juego(id) on update cascade,
  dia                 date    not null,
  apostado            numeric(14,2) not null default 0,
  ganado              numeric(14,2) not null default 0,
  apuestas            integer not null default 0,
  ganancias           integer not null default 0,
  jugadores_distintos integer not null default 0,
  importado_at        timestamptz not null default now(),
  primary key (juego_id, dia)
);

create table if not exists core.estadistica_juego (
  juego_id    integer not null references core.juego(id) on update cascade,
  periodo     text    not null,
  rondas      integer not null default 0,
  apuesta     numeric(14,2) not null default 0,
  ggr         numeric(14,2) not null default 0,
  actualizado timestamptz not null default now(),
  primary key (juego_id, periodo)
);

-- --- Vistas que reemplazan tablas redundantes -------------------------------

create or replace view core.v_resumen_mensual_usuario as
select
  r.usuario_id,
  to_char(r.dia, 'YYYY-MM')     as mes,
  sum(r.transacciones)::integer as transacciones,
  sum(r.apuestas)::integer      as apuestas,
  sum(r.monto_total)            as monto_total,
  sum(r.apostado)               as apostado,
  sum(r.ganado)                 as ganado,
  sum(r.ganado - r.apostado)    as beneficio,
  max(r.ultima_actividad)       as ultima_actividad
from core.resumen_diario_usuario r
group by r.usuario_id, to_char(r.dia, 'YYYY-MM');

create or replace view core.v_ranking_historico as
select
  h.usuario_id,
  u.username,
  s.nombre                   as sitio,
  u.moneda_codigo,
  sum(h.apuestas)::integer   as apuestas,
  sum(h.apostado)            as apostado,
  sum(h.ganado)              as ganado,
  sum(h.ganado - h.apostado) as beneficio
from core.historico_diario h
join core.usuario u on u.id = h.usuario_id
join core.sitio   s on s.id = u.sitio_id
group by h.usuario_id, u.username, s.nombre, u.moneda_codigo;

-- Devuelve el formato "ancho" de siempre, resuelto por JOIN
create or replace view core.v_transaccion_detalle as
select
  t.id, t.id_externo, t.fecha,
  s.nombre        as casa_apuestas,
  u.username      as usuario,
  u.id_externo    as id_usuario_externo,
  ec.codigo       as estado_cliente,
  cx.codigo       as conexion,
  d.codigo        as disciplina,
  j.nombre        as juego,
  tt.codigo       as tipo_transaccion,
  tt.es_apuesta, tt.es_ganancia,
  gc.codigo       as grupo_causal,
  b.codigo        as billetera,
  t.moneda_codigo as moneda,
  t.monto, t.ingresos, t.comision, t.saldo, t.saldo_actual,
  t.descripcion
from core.transaccion t
join core.usuario    u on u.id = t.usuario_id
join core.sitio      s on s.id = t.sitio_id
join core.disciplina d on d.id = t.disciplina_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.conexion         cx on cx.id = u.conexion_id
left join core.juego            j  on j.id  = t.juego_id
left join core.tipo_transaccion tt on tt.id = t.tipo_transaccion_id
left join core.causal           c  on c.id  = t.causal_id
left join core.grupo_causal     gc on gc.id = c.grupo_causal_id
left join core.billetera        b  on b.id  = t.billetera_id;

set local client_min_messages = notice;

do $$ begin raise notice 'Pasos 1-4 · Modelo creado (30 tablas, 3 vistas).'; end $$;


-- ============================================================================
--  PASO 5 · Carga de datos: public -> core
--  No modifica ni borra ninguna tabla de origen. Es idempotente.
-- ============================================================================

-- --- Sitios, desde las tres columnas que hoy guardan lo mismo ---------------
insert into core.sitio (codigo, nombre)
select distinct nombre, nombre from public.dim_casa_apuestas where nombre is not null
union
select distinct casa_apuestas, casa_apuestas
  from public.transacciones_novusbet where casa_apuestas is not null
union
select distinct site, site
  from public.transaction_records where site is not null and site <> ''
on conflict (codigo) do nothing;

insert into core.sitio (codigo, nombre) values ('desconocido','Sin identificar')
on conflict (codigo) do nothing;

-- --- Disciplinas presentes en los datos ------------------------------------
insert into core.disciplina (codigo, nombre)
select distinct lower(disciplina), initcap(disciplina)
  from public.transacciones_novusbet
 where disciplina is not null and disciplina <> ''
on conflict (codigo) do nothing;

insert into core.disciplina (codigo, nombre)
select distinct lower(discipline), initcap(discipline)
  from public.transaction_records
 where discipline is not null and discipline <> ''
on conflict (codigo) do nothing;

-- --- Monedas ---------------------------------------------------------------
insert into core.moneda (codigo, nombre)
select distinct upper(left(m,3)), upper(left(m,3))
  from (
    select moneda   as m from public.transacciones_novusbet
    union select currency from public.transaction_records
    union select moneda   from public.usuarios_novusbet
    union select moneda   from public.apuestas_deportivas
  ) s
 where m is not null and length(trim(m)) = 3
on conflict (codigo) do nothing;

-- --- Tipos de transacción · es_apuesta/es_ganancia suben al catálogo -------
insert into core.tipo_transaccion (codigo, nombre)
select distinct nombre, nombre from public.dim_tipo_transaccion where nombre is not null
union
select distinct tipo_transaccion, tipo_transaccion
  from public.transacciones_novusbet where tipo_transaccion is not null
union
select distinct transaction_type, transaction_type
  from public.transaction_records
 where transaction_type is not null and transaction_type <> ''
on conflict (codigo) do nothing;

update core.tipo_transaccion tt
   set es_apuesta = agg.es_apuesta, es_ganancia = agg.es_ganancia
  from (
    select tipo_transaccion,
           bool_or(es_apuesta)  as es_apuesta,
           bool_or(es_ganancia) as es_ganancia
      from public.transacciones_novusbet
     where tipo_transaccion is not null
     group by tipo_transaccion
  ) agg
 where tt.codigo = agg.tipo_transaccion;

-- --- Juegos ----------------------------------------------------------------
insert into core.juego (nombre, proveedor, disciplina_id)
select distinct dj.nombre, null::text,
       coalesce((select id from core.disciplina where codigo = lower(dj.disciplina)),
                (select id from core.disciplina where codigo = 'otros'))
  from public.dim_juego dj
 where dj.nombre is not null
on conflict (nombre, proveedor) do nothing;

insert into core.juego (nombre, proveedor, disciplina_id)
select distinct gs.juego, gs.proveedor,
       (select id from core.disciplina where codigo = 'casino')
  from public.game_stats gs
 where gs.juego is not null
on conflict (nombre, proveedor) do nothing;

-- --- Billeteras ------------------------------------------------------------
insert into core.billetera (codigo, nombre)
select distinct billeteras, billeteras
  from public.transacciones_novusbet where billeteras is not null and billeteras <> ''
union
select distinct wallet, wallet
  from public.transaction_records where wallet is not null and wallet <> ''
on conflict (codigo) do nothing;

-- --- Grupos causales y causales --------------------------------------------
insert into core.grupo_causal (codigo, nombre)
select distinct grupo_causal, grupo_causal
  from public.transacciones_novusbet where grupo_causal is not null and grupo_causal <> ''
union
select distinct causal_group, causal_group
  from public.transaction_records where causal_group is not null and causal_group <> ''
on conflict (codigo) do nothing;

insert into core.causal (grupo_causal_id, codigo, producto)
select distinct gc.id, tr.causal, nullif(tr.causal_product, '')
  from public.transaction_records tr
  join core.grupo_causal gc on gc.codigo = tr.causal_group
 where tr.causal is not null and tr.causal <> ''
on conflict (grupo_causal_id, codigo, producto) do nothing;

-- --- Tipos de usuario ------------------------------------------------------
insert into core.tipo_usuario (codigo, nombre)
select distinct tipo, tipo from public.usuarios_novusbet where tipo is not null and tipo <> ''
union
select distinct sub_tipo, sub_tipo from public.usuarios_novusbet where sub_tipo is not null and sub_tipo <> ''
union
select distinct user_type, user_type from public.transaction_records where user_type is not null and user_type <> ''
on conflict (codigo) do nothing;

-- La tabla del diseño abandonado puede no existir; se usa solo si está.
do $$
begin
  if to_regclass('public.tipos_usuario') is not null then
    insert into core.tipo_usuario (codigo, nombre)
    select distinct nombre, nombre from public.tipos_usuario where nombre is not null
    on conflict (codigo) do nothing;
  end if;
end $$;


-- --- Usuarios · aquí se colapsan las columnas duplicadas --------------------
insert into core.usuario (
  sitio_id, id_externo, username, nombre, apellido,
  tipo_usuario_id, sub_tipo_id, estado_cliente_id, moneda_codigo,
  bono_activo, fecha_registro, primer_deposito, ultimo_acceso
)
select
  coalesce(s.id, (select id from core.sitio where codigo = 'desconocido')),
  src.id_externo, src.username, src.nombre, src.apellido,
  tu.id, st.id,
  coalesce(ec.id, (select id from core.estado_cliente where codigo = 'otros')),
  case when length(trim(coalesce(src.moneda,''))) = 3 then upper(trim(src.moneda)) end,
  coalesce(src.bono_activo, false),
  src.fecha_registro, src.primer_deposito, src.ultimo_acceso
from (
  select distinct on (coalesce(un.id_usuario_novusbet, un.id_usuario))
         coalesce(un.id_usuario_novusbet, un.id_usuario) as id_externo,
         coalesce(un.username, un.usuario, 'sin_nombre') as username,
         un.nombre, un.apellido,
         coalesce(un.casa_apuestas, un.sitio)            as sitio,
         un.tipo, un.sub_tipo, un.estado, un.moneda, un.bono_activo,
         coalesce(un.fecha_registro, un.fecha_creacion)  as fecha_registro,
         un.primer_deposito, un.ultimo_acceso
    from public.usuarios_novusbet un
   where coalesce(un.id_usuario_novusbet, un.id_usuario) is not null
   order by coalesce(un.id_usuario_novusbet, un.id_usuario), un.actualizado_at desc nulls last
) src
left join core.sitio          s  on s.codigo  = src.sitio
left join core.tipo_usuario   tu on tu.codigo = src.tipo
left join core.tipo_usuario   st on st.codigo = src.sub_tipo
left join core.estado_cliente ec on ec.codigo = lower(src.estado)
on conflict (sitio_id, id_externo) do nothing;

-- Usuarios que solo aparecen en las transacciones y no tenían ficha propia
insert into core.usuario (sitio_id, id_externo, username)
select distinct
       coalesce(s.id, (select id from core.sitio where codigo = 'desconocido')),
       t.id_usuario_novusbet,
       coalesce(t.usuario, t.id_usuario_novusbet)
  from public.transacciones_novusbet t
  left join core.sitio s on s.codigo = t.casa_apuestas
 where t.id_usuario_novusbet is not null
on conflict (sitio_id, id_externo) do nothing;

insert into core.usuario (sitio_id, id_externo, username)
select distinct
       coalesce(s.id, (select id from core.sitio where codigo = 'desconocido')),
       tr.user_id,
       coalesce(nullif(tr.username,''), tr.user_id)
  from public.transaction_records tr
  left join core.sitio s on s.codigo = tr.site
 where tr.user_id is not null and tr.user_id <> ''
on conflict (sitio_id, id_externo) do nothing;

-- Jerarquía padre/hijo, ahora como clave foránea. Las tres columnas heredadas
-- guardan cosas distintas: primero se intenta por id externo, luego por nombre.
update core.usuario u
   set padre_id = p.id
  from public.usuarios_novusbet un
  join core.usuario p on p.id_externo = coalesce(un.id_padre, un.padre)
 where u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
   and p.sitio_id = u.sitio_id and p.id <> u.id and u.padre_id is null;

update core.usuario u
   set padre_id = (
     select p.id from core.usuario p
      where p.username = coalesce(un.nombre_usuario_padre, un.padre) and p.id <> u.id
      order by (p.sitio_id = u.sitio_id) desc, p.id
      limit 1
   )
  from public.usuarios_novusbet un
 where u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
   and coalesce(un.nombre_usuario_padre, un.padre) is not null
   and u.padre_id is null;

-- Contacto (datos personales)
insert into core.usuario_contacto (
  usuario_id, correo, telefono, tipo_documento, numero_documento, direccion_ip, external_id
)
select distinct on (u.id)
       u.id, un.correo, un.telefono, un.tipo_documento, un.numero_documento,
       case when un.direccion_ip ~ '^\d+\.\d+\.\d+\.\d+$' then un.direccion_ip::inet end,
       un.external_id
  from public.usuarios_novusbet un
  join core.usuario u on u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
 order by u.id, un.actualizado_at desc nulls last
on conflict (usuario_id) do nothing;

insert into core.usuario_saldo (usuario_id, saldo, saldo_retirable, bono)
select distinct on (u.id)
       u.id, coalesce(un.saldo,0), coalesce(un.saldo_retirable,0), coalesce(un.bono,0)
  from public.usuarios_novusbet un
  join core.usuario u on u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
 order by u.id, un.actualizado_at desc nulls last
on conflict (usuario_id) do nothing;

insert into core.usuario_metrica (usuario_id, promedio_apuesta)
select u.id, coalesce(p.promedio_apuesta, 0)
  from public.perfil_apuestas_usuarios p
  join core.usuario u on u.id_externo = p.id_usuario_novusbet
on conflict (usuario_id) do nothing;

insert into core.admin_usuario (username, password_hash, salt, rol_id, creado_at)
select a.username, a.password_hash, a.salt,
       coalesce((select id from core.rol_admin where codigo = a.rol),
                (select id from core.rol_admin where codigo = 'admin')),
       a.created_at
  from public.admin_usuarios a
on conflict (username) do nothing;


-- --- Transacciones · las dos tablas convergen en una ------------------------
insert into core.transaccion (
  sitio_id, id_externo, usuario_id, fecha,
  tipo_transaccion_id, disciplina_id, juego_id, billetera_id, moneda_codigo,
  monto, ingresos, comision, saldo, saldo_actual,
  descripcion, origen, raw, importado_at
)
select
  u.sitio_id, t.id_transaccion_novusbet, u.id,
  coalesce(t.fecha, t.created_at, now()),
  tt.id,
  coalesce(d.id, (select id from core.disciplina where codigo = 'otros')),
  j.id, b.id,
  case when length(trim(coalesce(t.moneda,''))) = 3 then upper(trim(t.moneda)) end,
  coalesce(t.monto,0), coalesce(t.ingresos,0), coalesce(t.comision,0),
  coalesce(t.saldo,0), coalesce(t.saldo_actual,0),
  t.descripcion, 'novusbet',
  coalesce(t.datos_raw, '{}'::jsonb),
  coalesce(t.created_at, now())
from public.transacciones_novusbet t
join core.usuario u on u.id_externo = t.id_usuario_novusbet
left join core.tipo_transaccion tt on tt.codigo = t.tipo_transaccion
left join core.disciplina       d  on d.codigo  = lower(t.disciplina)
left join core.juego            j  on j.nombre  = t.juego and j.proveedor is null
left join core.billetera        b  on b.codigo  = t.billeteras
where t.id_transaccion_novusbet is not null
on conflict (sitio_id, id_externo) do nothing;

insert into core.transaccion (
  sitio_id, id_externo, usuario_id, fecha,
  tipo_transaccion_id, disciplina_id, causal_id, billetera_id, moneda_codigo,
  monto, ingresos, comision, saldo, saldo_actual,
  descripcion, nota, origen, archivo_origen, raw, importado_at
)
select
  u.sitio_id, tr.source_transaction_id, u.id,
  coalesce(tr.created_at, now()),
  tt.id,
  coalesce(d.id, (select id from core.disciplina where codigo = 'otros')),
  c.id, b.id,
  case when length(trim(coalesce(tr.currency,''))) = 3 then upper(trim(tr.currency)) end,
  coalesce(tr.total,0), coalesce(tr.income,0), coalesce(tr.commission,0),
  coalesce(tr.balance,0), coalesce(tr.current_balance,0),
  tr.description, tr.note, 'backoffice', tr.source_file, tr.raw, tr.imported_at
from public.transaction_records tr
join core.usuario u on u.id_externo = tr.user_id
left join core.tipo_transaccion tt on tt.codigo = tr.transaction_type
left join core.disciplina       d  on d.codigo  = lower(tr.discipline)
left join core.grupo_causal     gc on gc.codigo = tr.causal_group
left join core.causal           c  on c.grupo_causal_id = gc.id
                                  and c.codigo = tr.causal
                                  and c.producto is not distinct from nullif(tr.causal_product,'')
left join core.billetera        b  on b.codigo  = tr.wallet
where tr.source_transaction_id is not null and tr.source_transaction_id <> ''
on conflict (sitio_id, id_externo) do nothing;

-- La IP vive en el contacto del usuario, no repetida en cada transacción
insert into core.usuario_contacto (usuario_id, direccion_ip)
select distinct on (u.id) u.id, tr.ip_address
  from public.transaction_records tr
  join core.usuario u on u.id_externo = tr.user_id
 where tr.ip_address is not null
 order by u.id, tr.created_at desc nulls last
on conflict (usuario_id) do update
  set direccion_ip = coalesce(core.usuario_contacto.direccion_ip, excluded.direccion_ip);


-- --- Apuestas deportivas ---------------------------------------------------
insert into core.usuario (sitio_id, id_externo, username)
select distinct
       coalesce(s.id, (select id from core.sitio where codigo = 'desconocido')),
       ad.id_usuario_externo,
       coalesce(ad.owner, ad.id_usuario_externo)
  from public.apuestas_deportivas ad
  left join core.sitio s on s.codigo = ad.site
 where ad.id_usuario_externo is not null
on conflict (sitio_id, id_externo) do nothing;

insert into core.apuesta_deportiva (
  ticket_id, ticket_code, sitio_id, usuario_id, moneda_codigo,
  coupon_type, bet_type, bono, fecha, fecha_outcome, fecha_pago,
  monto, comision, total_odds, no_eventos, bono_pagado,
  ganancia_base, ganancia, ganancia_impuesto,
  outcome, aplicacion, navegador, fuente, importado_at
)
select
  ad.ticket_id, ad.ticket_code, u.sitio_id, u.id,
  case when length(trim(coalesce(ad.moneda,''))) = 3 then upper(trim(ad.moneda)) end,
  ad.coupon_type, ad.bet_type, ad.bono,
  coalesce(ad.fecha, now()), ad.fecha_outcome, ad.fecha_pago,
  coalesce(ad.monto,0), coalesce(ad.comision,0), coalesce(ad.total_odds,0),
  coalesce(ad.no_eventos,0), coalesce(ad.bono_pagado,0),
  coalesce(ad.ganancia_base,0), coalesce(ad.ganancia,0), coalesce(ad.ganancia_impuesto,0),
  case when coalesce(ad.pendiente,false) then null else ad.outcome end,
  ad.aplicacion, ad.navegador, coalesce(ad.fuente,'csv'), ad.importado_at
from public.apuestas_deportivas ad
join core.usuario u on u.id_externo = ad.id_usuario_externo
on conflict (sitio_id, ticket_id) do nothing;


-- --- Alertas · las dos tablas se funden en core.alerta ---------------------
insert into core.alerta (
  tipo_alerta_id, transaccion_id, severidad_id, monto, umbral_usado, motivo, vista, creado_at
)
select (select id from core.tipo_alerta where codigo = 'apuesta'),
       t.id,
       coalesce((select id from core.severidad where codigo = lower(a.severidad)),
                (select id from core.severidad where codigo = 'normal')),
       a.monto, a.umbral_usado, a.motivo_alerta, coalesce(a.vista,false), a.creado_at
  from public.alertas_apuestas a
  join core.transaccion t on t.id_externo = a.id_transaccion_novusbet
on conflict (transaccion_id, tipo_alerta_id) do nothing;

insert into core.alerta (
  tipo_alerta_id, transaccion_id, severidad_id, monto, umbral_usado, motivo, vista, creado_at
)
select (select id from core.tipo_alerta where codigo = 'ganancia'),
       t.id,
       coalesce((select id from core.severidad where codigo = lower(a.severidad)),
                (select id from core.severidad where codigo = 'normal')),
       a.monto, a.umbral_usado, a.patron, coalesce(a.vista,false), a.creado_at
  from public.alertas_ganancias a
  join core.transaccion t on t.id_externo = a.id_transaccion_novusbet
on conflict (transaccion_id, tipo_alerta_id) do nothing;

update core.parametro p
   set valor_numerico = pa.umbral_global,
       actualizado_at = coalesce(pa.actualizado_at, now())
  from public.parametros_alerta_apuestas pa
 where p.clave = 'umbral_alerta_apuesta' and pa.id = 1;


-- --- Agregados -------------------------------------------------------------
insert into core.resumen_diario_usuario (
  usuario_id, dia, transacciones, apuestas, monto_total, apostado, ganado, ultima_actividad
)
select u.id, r.dia,
       coalesce(r.transacciones,0), coalesce(r.apuestas,0),
       coalesce(r.monto_total,0), coalesce(r.apostado,0), coalesce(r.ganado,0),
       r.ultima_actividad
  from public.resumen_diario_usuarios r
  join core.usuario u on u.id_externo = r.id_usuario_novusbet
on conflict (usuario_id, dia) do nothing;

-- El array `juegos` se despliega en filas: aquí se corrige la 1FN
insert into core.resumen_diario_usuario_juego (usuario_id, dia, juego_id)
select distinct u.id, r.dia, j.id
  from public.resumen_diario_usuarios r
  join core.usuario u on u.id_externo = r.id_usuario_novusbet
  cross join lateral unnest(coalesce(r.juegos, array[]::text[])) as g(nombre)
  join core.juego j on j.nombre = g.nombre and j.proveedor is null
on conflict (usuario_id, dia, juego_id) do nothing;

insert into core.resumen_diario_juego (
  juego_id, dia, apostado, ganado, apuestas, ganancias, jugadores_distintos, actualizado_at
)
select j.id, r.dia,
       coalesce(r.apostado,0), coalesce(r.ganado,0), coalesce(r.apuestas,0),
       coalesce(r.ganancias,0), coalesce(r.jugadores_distintos,0),
       coalesce(r.actualizado_at, now())
  from public.resumen_diario_juegos r
  join core.juego j on j.nombre = r.juego and j.proveedor is null
on conflict (juego_id, dia) do nothing;

insert into core.metrica_diaria (
  dia, disciplina_id, conexion_id, total_transacciones, usuarios_unicos,
  ingresos, monto_total, comision, archivo_origen
)
select dm.metric_date,
       coalesce(d.id,  (select id from core.disciplina where codigo = 'otros')),
       coalesce(cx.id, (select id from core.conexion   where codigo = 'desconocido')),
       coalesce(dm.total_transactions,0), coalesce(dm.unique_users,0),
       coalesce(dm.total_income,0), coalesce(dm.total_amount,0),
       coalesce(dm.total_commission,0), dm.source_file
  from public.daily_metrics dm
  left join core.disciplina d  on d.codigo  = lower(dm.discipline)
  left join core.conexion   cx on cx.codigo = lower(dm.connection_type)
on conflict (dia, disciplina_id, conexion_id) do nothing;

insert into core.historico_diario (usuario_id, dia, apuestas, apostado, ganado, importado_at)
select u.id, h.dia,
       coalesce(h.apuestas,0), coalesce(h.apostado,0), coalesce(h.ganado,0),
       coalesce(h.importado_at, now())
  from public.historico_csv_mensual h
  join core.usuario u on u.id_externo = h.id_usuario_novusbet
on conflict (usuario_id, dia) do nothing;

insert into core.historico_diario_juego (
  juego_id, dia, apostado, ganado, apuestas, ganancias, jugadores_distintos, importado_at
)
select j.id, h.dia,
       coalesce(h.apostado,0), coalesce(h.ganado,0), coalesce(h.apuestas,0),
       coalesce(h.ganancias,0), coalesce(h.jugadores_distintos,0),
       coalesce(h.importado_at, now())
  from public.historico_csv_juegos h
  join core.juego j on j.nombre = h.juego and j.proveedor is null
on conflict (juego_id, dia) do nothing;

insert into core.estadistica_juego (juego_id, periodo, rondas, apuesta, ggr, actualizado)
select j.id, gs.periodo,
       coalesce(gs.rondas,0), coalesce(gs.apuesta,0), coalesce(gs.ggr,0),
       coalesce(gs.actualizado, now())
  from public.game_stats gs
  join core.juego j on j.nombre = gs.juego
                   and j.proveedor is not distinct from gs.proveedor
on conflict (juego_id, periodo) do nothing;

do $$ begin raise notice 'Paso 5 · Datos copiados a core.'; end $$;


-- ============================================================================
--  PASO 6 · VERIFICACIÓN AUTOMÁTICA
--  Compara las filas de origen con las de destino. Si algo falta, lanza un
--  error y TODA la transacción se deshace: tu base queda como estaba y el
--  corte del paso 7 no llega a ejecutarse.
-- ============================================================================
do $$
declare
  esp_nb bigint; act_nb bigint;
  esp_bo bigint; act_bo bigint;
  esp_ap bigint; act_ap bigint;
begin
  -- Transacciones NovusBet
  select count(*) into esp_nb from (
    select distinct id_transaccion_novusbet
      from public.transacciones_novusbet
     where id_transaccion_novusbet is not null
       and id_usuario_novusbet is not null) x;
  select count(*) into act_nb from core.transaccion where origen = 'novusbet';

  if act_nb < esp_nb then
    raise exception
      'VERIFICACIÓN FALLIDA · transacciones NovusBet: se esperaban % y se cargaron %. No se ha modificado nada.',
      esp_nb, act_nb;
  end if;

  -- Transacciones del back office
  select count(*) into esp_bo from (
    select distinct source_transaction_id
      from public.transaction_records
     where source_transaction_id is not null and source_transaction_id <> ''
       and user_id is not null and user_id <> '') x;
  select count(*) into act_bo from core.transaccion where origen = 'backoffice';

  if act_bo < esp_bo then
    raise exception
      'VERIFICACIÓN FALLIDA · transacciones back office: se esperaban % y se cargaron %. No se ha modificado nada.',
      esp_bo, act_bo;
  end if;

  -- Apuestas deportivas
  select count(*) into esp_ap from (
    select distinct ticket_id from public.apuestas_deportivas
     where id_usuario_externo is not null) x;
  select count(*) into act_ap from core.apuesta_deportiva;

  if act_ap < esp_ap then
    raise exception
      'VERIFICACIÓN FALLIDA · apuestas deportivas: se esperaban % y se cargaron %. No se ha modificado nada.',
      esp_ap, act_ap;
  end if;

  raise notice 'Paso 6 · Verificación correcta: % transacciones NovusBet, % del back office, % apuestas.',
    act_nb, act_bo, act_ap;
end $$;


-- ============================================================================
--  PASO 7 · El corte
--  Mueve las tablas originales al esquema `legacy` (NO las borra) y crea en
--  `public` vistas con los mismos nombres y columnas. El código que ya tienes
--  —extraccionDatos.py, el visor, el dashboard— sigue leyendo igual.
--
--  Regla: solo se mueve una tabla si a continuación se le crea su vista.
--  Por eso `usuarios`, `tipos_usuario`, `estados_usuario`, `disciplinas` y
--  `resumen_normalizacion` se quedan intactas en `public`: no forman parte
--  del modelo y moverlas sin vista rompería cualquier consulta externa.
-- ============================================================================

set local client_min_messages = warning;
create schema if not exists legacy;
set local client_min_messages = notice;

comment on schema legacy is 'Tablas originales conservadas tras la normalización.';

do $$
declare
  t text;
  movidas int := 0;
begin
  foreach t in array array[
    'transacciones_novusbet','transaction_records','usuarios_novusbet',
    'alertas_apuestas','alertas_ganancias','resumen_diario_usuarios',
    'resumen_mensual_usuarios','resumen_diario_juegos','perfil_apuestas_usuarios',
    'ranking_historico_base','parametros_alerta_apuestas','apuestas_deportivas',
    'historico_csv_mensual','historico_csv_juegos','daily_metrics','game_stats',
    'admin_usuarios','dim_casa_apuestas','dim_juego','dim_tipo_transaccion'
  ] loop
    -- Solo si sigue siendo una tabla real en public (en una segunda ejecución
    -- ya será una vista y se salta).
    if to_regclass('public.' || t) is not null
       and (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) = 'r'
    then
      execute format('alter table public.%I set schema legacy', t);
      movidas := movidas + 1;
    end if;
  end loop;

  raise notice 'Paso 7 · % tablas movidas a legacy.', movidas;
end $$;

-- --- Vistas con los nombres y columnas de siempre ---------------------------

create or replace view public.transacciones_novusbet as
select
  t.id,
  u.username      as usuario,
  tt.codigo       as tipo_transaccion,
  t.monto,
  d.codigo        as disciplina,
  t.descripcion,
  t.fecha,
  t.raw           as datos_raw,
  t.importado_at  as created_at,
  ec.codigo       as estado_cliente,
  s.codigo        as casa_apuestas,
  u.id_externo    as id_usuario_novusbet,
  t.moneda_codigo as moneda,
  t.ingresos, t.comision, t.saldo, t.saldo_actual,
  b.codigo        as billeteras,
  gc.codigo       as grupo_causal,
  j.nombre        as juego,
  t.id_externo    as id_transaccion_novusbet,
  coalesce(tt.es_apuesta,false)  as es_apuesta,
  coalesce(tt.es_ganancia,false) as es_ganancia
from core.transaccion t
join core.usuario    u on u.id = t.usuario_id
join core.sitio      s on s.id = t.sitio_id
join core.disciplina d on d.id = t.disciplina_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.tipo_transaccion tt on tt.id = t.tipo_transaccion_id
left join core.juego            j  on j.id  = t.juego_id
left join core.billetera        b  on b.id  = t.billetera_id
left join core.causal           c  on c.id  = t.causal_id
left join core.grupo_causal     gc on gc.id = c.grupo_causal_id
-- El filtro por origen mantiene la equivalencia 1:1 con la tabla original:
-- sin él la vista mostraría también las filas del back office y el código
-- existente contaría el doble.
where t.origen = 'novusbet';

create or replace view public.transaction_records as
select
  t.id,
  t.id_externo    as source_transaction_id,
  t.fecha         as created_at,
  s.codigo        as site,
  p.id_externo    as parent_id,
  u.id_externo    as user_id,
  u.username,
  tu.codigo       as user_type,
  t.moneda_codigo as currency,
  t.ingresos      as income,
  null::numeric   as status,
  t.monto         as total,
  t.comision      as commission,
  t.saldo         as balance,
  t.saldo_actual  as current_balance,
  b.codigo        as wallet,
  tt.codigo       as transaction_type,
  gc.codigo       as causal_group,
  c.codigo        as causal,
  c.producto      as causal_product,
  t.descripcion   as description,
  t.nota          as note,
  uc.direccion_ip as ip_address,
  d.codigo        as discipline,
  coalesce(ec.codigo,'otros')       as client_status,
  coalesce(cx.codigo,'desconocido') as connection,
  t.archivo_origen as source_file,
  t.raw,
  t.importado_at   as imported_at
from core.transaccion t
join core.usuario    u on u.id = t.usuario_id
join core.sitio      s on s.id = t.sitio_id
join core.disciplina d on d.id = t.disciplina_id
left join core.usuario          p  on p.id  = u.padre_id
left join core.usuario_contacto uc on uc.usuario_id = u.id
left join core.tipo_usuario     tu on tu.id = u.tipo_usuario_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.conexion         cx on cx.id = u.conexion_id
left join core.tipo_transaccion tt on tt.id = t.tipo_transaccion_id
left join core.billetera        b  on b.id  = t.billetera_id
left join core.causal           c  on c.id  = t.causal_id
left join core.grupo_causal     gc on gc.id = c.grupo_causal_id
where t.origen = 'backoffice';

create or replace view public.usuarios_novusbet as
select
  u.id,
  u.id_externo     as id_usuario_novusbet,
  u.username, u.nombre, u.apellido,
  uc.correo,
  s.codigo         as casa_apuestas,
  ec.codigo        as estado,
  tu.codigo        as tipo,
  st.codigo        as sub_tipo,
  p.id_externo     as id_padre,
  p.username       as nombre_usuario_padre,
  uc.telefono, uc.tipo_documento, uc.numero_documento,
  host(uc.direccion_ip) as direccion_ip,
  u.bono_activo,
  uc.external_id,
  u.moneda_codigo  as moneda,
  u.fecha_registro, u.ultimo_acceso, u.primer_deposito, u.actualizado_at,
  u.id_externo     as id_usuario,
  u.username       as usuario,
  p.username       as padre,
  sa.saldo, sa.saldo_retirable, sa.bono,
  s.codigo         as sitio,
  u.fecha_registro as fecha_creacion
from core.usuario u
join core.sitio s on s.id = u.sitio_id
left join core.usuario_contacto uc on uc.usuario_id = u.id
left join core.usuario_saldo    sa on sa.usuario_id = u.id
left join core.usuario          p  on p.id  = u.padre_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.tipo_usuario     tu on tu.id = u.tipo_usuario_id
left join core.tipo_usuario     st on st.id = u.sub_tipo_id;

create or replace view public.alertas_apuestas as
select a.id,
       t.id_externo as id_transaccion_novusbet,
       u.id_externo as id_usuario_novusbet,
       u.username   as usuario,
       s.codigo     as casa_apuestas,
       a.monto,
       d.codigo     as disciplina,
       j.nombre     as juego,
       t.descripcion, t.fecha, a.umbral_usado, a.vista, a.creado_at,
       a.motivo     as motivo_alerta,
       sv.codigo    as severidad
from core.alerta a
join core.tipo_alerta ta on ta.id = a.tipo_alerta_id and ta.codigo = 'apuesta'
join core.transaccion t  on t.id  = a.transaccion_id
join core.usuario     u  on u.id  = t.usuario_id
join core.sitio       s  on s.id  = t.sitio_id
join core.disciplina  d  on d.id  = t.disciplina_id
join core.severidad   sv on sv.id = a.severidad_id
left join core.juego  j  on j.id  = t.juego_id;

create or replace view public.alertas_ganancias as
select a.id,
       t.id_externo as id_transaccion_novusbet,
       u.id_externo as id_usuario_novusbet,
       u.username   as usuario,
       s.codigo     as casa_apuestas,
       a.monto,
       d.codigo     as disciplina,
       j.nombre     as juego,
       t.descripcion, t.fecha, a.umbral_usado, a.vista, a.creado_at,
       a.motivo     as patron,
       sv.codigo    as severidad
from core.alerta a
join core.tipo_alerta ta on ta.id = a.tipo_alerta_id and ta.codigo = 'ganancia'
join core.transaccion t  on t.id  = a.transaccion_id
join core.usuario     u  on u.id  = t.usuario_id
join core.sitio       s  on s.id  = t.sitio_id
join core.disciplina  d  on d.id  = t.disciplina_id
join core.severidad   sv on sv.id = a.severidad_id
left join core.juego  j  on j.id  = t.juego_id;

create or replace view public.resumen_diario_usuarios as
select r.usuario_id as id,
       u.id_externo as id_usuario_novusbet,
       u.username   as usuario,
       s.codigo     as casa_apuestas,
       r.dia, r.transacciones, r.apuestas, r.monto_total, r.apostado, r.ganado,
       array(select j.nombre
               from core.resumen_diario_usuario_juego rj
               join core.juego j on j.id = rj.juego_id
              where rj.usuario_id = r.usuario_id and rj.dia = r.dia) as juegos,
       array(select distinct d.codigo
               from core.resumen_diario_usuario_juego rj
               join core.juego j      on j.id = rj.juego_id
               join core.disciplina d on d.id = j.disciplina_id
              where rj.usuario_id = r.usuario_id and rj.dia = r.dia) as disciplinas,
       r.ultima_actividad, r.actualizado_at
from core.resumen_diario_usuario r
join core.usuario u on u.id = r.usuario_id
join core.sitio   s on s.id = u.sitio_id;

create or replace view public.resumen_mensual_usuarios as
select v.usuario_id as id,
       u.id_externo as id_usuario_novusbet,
       u.username   as usuario,
       s.codigo     as casa_apuestas,
       v.mes, v.transacciones, v.monto_total, v.ultima_actividad,
       now()        as actualizado_at,
       v.apuestas,
       array[]::text[] as juegos,
       v.apostado, v.ganado
from core.v_resumen_mensual_usuario v
join core.usuario u on u.id = v.usuario_id
join core.sitio   s on s.id = u.sitio_id;

create or replace view public.ranking_historico_base as
select u.id_externo as id_usuario_novusbet,
       v.username   as usuario,
       v.sitio      as casa_apuestas,
       v.apuestas, v.apostado, v.ganado, v.beneficio,
       v.moneda_codigo as moneda,
       now() as importado_at
from core.v_ranking_historico v
join core.usuario u on u.id = v.usuario_id;

create or replace view public.perfil_apuestas_usuarios as
select u.id_externo as id_usuario_novusbet, m.promedio_apuesta, m.actualizado_at
  from core.usuario_metrica m
  join core.usuario u on u.id = m.usuario_id;

create or replace view public.parametros_alerta_apuestas as
select 1 as id,
       (select valor_numerico from core.parametro where clave = 'umbral_alerta_apuesta') as umbral_global,
       (select actualizado_at from core.parametro where clave = 'umbral_alerta_apuesta') as actualizado_at;

create or replace view public.apuestas_deportivas as
select a.id, a.ticket_id, a.ticket_code,
       s.codigo     as site,
       u.username   as owner,
       u.id_externo as id_usuario_externo,
       a.coupon_type, a.bet_type, a.bono,
       a.fecha,
       a.fecha::date as dia,
       a.moneda_codigo as moneda,
       a.monto, a.comision, a.total_odds, a.no_eventos,
       (a.outcome is null) as pendiente,
       a.bono_pagado, a.ganancia_base, a.outcome,
       a.fecha_outcome, a.fecha_pago, a.ganancia, a.ganancia_impuesto,
       a.aplicacion, a.navegador, a.fuente, a.importado_at
from core.apuesta_deportiva a
join core.usuario u on u.id = a.usuario_id
join core.sitio   s on s.id = a.sitio_id;

create or replace view public.resumen_diario_juegos as
select row_number() over (order by r.dia, j.nombre) as id,
       j.nombre as juego,
       r.dia, r.apostado, r.ganado, r.apuestas, r.ganancias,
       r.jugadores_distintos, r.actualizado_at
from core.resumen_diario_juego r
join core.juego j on j.id = r.juego_id;

create or replace view public.historico_csv_mensual as
select row_number() over (order by h.dia, u.id_externo) as id,
       h.dia,
       u.id_externo as id_usuario_novusbet,
       u.username   as usuario,
       s.codigo     as casa_apuestas,
       h.apuestas, h.apostado, h.ganado, h.beneficio,
       u.moneda_codigo as moneda,
       h.importado_at
from core.historico_diario h
join core.usuario u on u.id = h.usuario_id
join core.sitio   s on s.id = u.sitio_id;

create or replace view public.historico_csv_juegos as
select row_number() over (order by h.dia, j.nombre) as id,
       h.dia, j.nombre as juego,
       h.apostado, h.ganado, h.apuestas, h.ganancias,
       h.jugadores_distintos, h.importado_at
from core.historico_diario_juego h
join core.juego j on j.id = h.juego_id;

create or replace view public.daily_metrics as
select row_number() over (order by m.dia, m.disciplina_id, m.conexion_id) as id,
       m.dia     as metric_date,
       d.codigo  as discipline,
       cx.codigo as connection_type,
       m.total_transacciones as total_transactions,
       m.usuarios_unicos     as unique_users,
       case when cx.codigo = 'online' then m.usuarios_unicos else 0 end as online_users,
       case when cx.codigo = 'retail' then m.usuarios_unicos else 0 end as retail_users,
       m.ingresos    as total_income,
       m.monto_total as total_amount,
       m.comision    as total_commission,
       m.archivo_origen as source_file,
       m.actualizado_at as created_at,
       m.actualizado_at as updated_at
from core.metrica_diaria m
join core.disciplina d  on d.id  = m.disciplina_id
join core.conexion   cx on cx.id = m.conexion_id;

create or replace view public.game_stats as
select row_number() over (order by e.periodo, j.nombre) as id,
       e.periodo, j.proveedor, j.nombre as juego,
       e.rondas, e.apuesta, e.ggr, e.actualizado
from core.estadistica_juego e
join core.juego j on j.id = e.juego_id;

create or replace view public.admin_usuarios as
select a.id, a.username, a.password_hash, a.salt,
       r.codigo as rol, a.creado_at as created_at
from core.admin_usuario a
join core.rol_admin r on r.id = a.rol_id;

create or replace view public.dim_casa_apuestas as
select id::integer, codigo as nombre, creado_at as created_at from core.sitio;

create or replace view public.dim_juego as
select j.id, j.nombre, d.codigo as disciplina, j.creado_at as created_at
  from core.juego j join core.disciplina d on d.id = j.disciplina_id;

create or replace view public.dim_tipo_transaccion as
select id::integer, codigo as nombre, creado_at as created_at from core.tipo_transaccion;


-- ============================================================================
--  PASO 8 · Seguridad (RLS)
--  En Supabase, cualquier tabla sin RLS es legible con la clave `anon`, que
--  viaja incrustada en el navegador de quien abra el dashboard. Hoy eso
--  incluye correos, teléfonos, documentos e IPs.
--
--    Catálogos              -> lectura pública
--    Hechos y agregados     -> solo sesión autenticada
--    Contacto y credenciales-> solo service_role (tu backend)
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'sitio','disciplina','juego','tipo_transaccion','estado_cliente','conexion',
    'tipo_usuario','moneda','billetera','grupo_causal','causal','tipo_alerta',
    'severidad','rol_admin','usuario','usuario_contacto','usuario_saldo',
    'usuario_metrica','admin_usuario','transaccion','apuesta_deportiva','alerta',
    'parametro','resumen_diario_usuario','resumen_diario_usuario_juego',
    'resumen_diario_juego','metrica_diaria','historico_diario',
    'historico_diario_juego','estadistica_juego'
  ] loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end $$;

-- Catálogos: lectura para todos
-- (se silencian los avisos de 'drop policy if exists' en la primera ejecución)
set local client_min_messages = warning;

do $$
declare t text;
begin
  foreach t in array array[
    'sitio','disciplina','juego','tipo_transaccion','estado_cliente','conexion',
    'tipo_usuario','moneda','billetera','grupo_causal','causal','tipo_alerta','severidad'
  ] loop
    execute format('drop policy if exists %I on core.%I', 'lectura_publica_' || t, t);
    execute format(
      'create policy %I on core.%I for select to anon, authenticated using (true)',
      'lectura_publica_' || t, t);
  end loop;
end $$;

-- Hechos y agregados: solo sesión autenticada
do $$
declare t text;
begin
  foreach t in array array[
    'usuario','usuario_saldo','usuario_metrica','transaccion','apuesta_deportiva',
    'alerta','parametro','resumen_diario_usuario','resumen_diario_usuario_juego',
    'resumen_diario_juego','metrica_diaria','historico_diario',
    'historico_diario_juego','estadistica_juego'
  ] loop
    execute format('drop policy if exists %I on core.%I', 'lectura_autenticada_' || t, t);
    execute format(
      'create policy %I on core.%I for select to authenticated using (true)',
      'lectura_autenticada_' || t, t);
  end loop;
end $$;

set local client_min_messages = notice;

-- core.usuario_contacto y core.admin_usuario se quedan con RLS activo y SIN
-- ninguna política: así solo son accesibles con service_role, que ignora RLS
-- por diseño.
comment on table core.usuario_contacto is
  'PII. RLS activo sin políticas: solo accesible con service_role (backend).';
comment on table core.admin_usuario is
  'Credenciales. RLS activo sin políticas: solo accesible con service_role.';

-- RLS decide QUÉ FILAS se ven; GRANT decide si la tabla es visible.
-- Hacen falta los dos: sin GRANT, una política permisiva no sirve de nada.
grant select on all tables in schema core to authenticated;

grant select on
  core.sitio, core.disciplina, core.juego, core.tipo_transaccion,
  core.estado_cliente, core.conexion, core.tipo_usuario, core.moneda,
  core.billetera, core.grupo_causal, core.causal, core.tipo_alerta,
  core.severidad
to anon;

revoke all on core.usuario_contacto, core.admin_usuario from anon, authenticated;

alter default privileges in schema core grant select on tables to authenticated;

do $$ begin raise notice 'Paso 8 · Seguridad aplicada.'; end $$;


-- ============================================================================
--  RESUMEN FINAL
-- ============================================================================
do $$
declare
  n_tablas int; n_vistas int; n_fk int; n_legacy int;
  n_usuarios bigint; n_trans bigint; n_alertas bigint;
begin
  select count(*) into n_tablas from information_schema.tables
   where table_schema = 'core' and table_type = 'BASE TABLE';
  select count(*) into n_vistas from information_schema.tables
   where table_schema = 'core' and table_type = 'VIEW';
  select count(*) into n_fk from information_schema.table_constraints
   where constraint_schema = 'core' and constraint_type = 'FOREIGN KEY';
  select count(*) into n_legacy from information_schema.tables
   where table_schema = 'legacy';
  select count(*) into n_usuarios from core.usuario;
  select count(*) into n_trans    from core.transaccion;
  select count(*) into n_alertas  from core.alerta;

  raise notice '';
  raise notice '=========================================================';
  raise notice ' NORMALIZACIÓN COMPLETADA';
  raise notice '=========================================================';
  raise notice ' core:   % tablas, % vistas, % claves foráneas', n_tablas, n_vistas, n_fk;
  raise notice ' legacy: % tablas originales conservadas', n_legacy;
  raise notice ' datos:  % usuarios · % transacciones · % alertas', n_usuarios, n_trans, n_alertas;
  raise notice '---------------------------------------------------------';
  raise notice ' Tu código sigue funcionando: public.transacciones_novusbet';
  raise notice ' y las demás son ahora vistas sobre core, de SOLO LECTURA.';
  raise notice ' Los procesos que ESCRIBEN deben pasar a insertar en core.';
  raise notice '=========================================================';
end $$;

commit;
