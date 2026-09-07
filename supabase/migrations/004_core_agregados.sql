-- =====================================================================
-- 004 · Agregados y series históricas
-- =====================================================================
-- Tres correcciones sobre el modelo actual:
--
-- 1FN  resumen_diario_usuarios.juegos y .disciplinas son columnas ARRAY.
--      Un array dentro de una celda impide filtrar, agrupar y sumar por
--      juego. Se sustituyen por tablas hijas con una fila por juego.
--
-- 2FN  resumen_* repetía `usuario` y `casa_apuestas` en cada fila; son
--      atributos del usuario, no del par (usuario, día). Ahora es una FK.
--
--      resumen_mensual_usuarios y ranking_historico_base no aportan
--      datos nuevos: son sumas de las tablas diarias. Pasan a ser vistas,
--      que nunca pueden quedar desincronizadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Resumen diario por usuario
-- Sustituye a public.resumen_diario_usuarios
-- ---------------------------------------------------------------------
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

create index if not exists resumen_diario_usuario_dia_idx
  on core.resumen_diario_usuario(dia desc);

comment on column core.resumen_diario_usuario.beneficio is
  'Columna calculada: ganado - apostado. No se puede almacenar un valor incoherente.';

-- ---------------------------------------------------------------------
-- Desglose por juego del resumen diario  ·  corrige la 1FN
-- Reemplaza a resumen_diario_usuarios.juegos (ARRAY)
-- ---------------------------------------------------------------------
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

create index if not exists resumen_diario_juego_fk_idx
  on core.resumen_diario_usuario_juego(juego_id);

comment on table core.resumen_diario_usuario_juego is
  'Una fila por juego jugado. Sustituye al array resumen_diario_usuarios.juegos.';

-- ---------------------------------------------------------------------
-- Resumen diario por juego
-- Sustituye a public.resumen_diario_juegos
-- ---------------------------------------------------------------------
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

create index if not exists resumen_diario_juego_dia_idx
  on core.resumen_diario_juego(dia desc);

-- ---------------------------------------------------------------------
-- Métricas diarias del dashboard
-- Sustituye a public.daily_metrics.
-- online_users / retail_users eran columnas-valor: la conexión ya es
-- parte de la clave, así que basta con unique_users.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Histórico importado desde CSV
-- Sustituye a public.historico_csv_mensual
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Histórico por juego
-- Sustituye a public.historico_csv_juegos
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Estadística de juego por periodo
-- Sustituye a public.game_stats (el proveedor pasó a core.juego)
-- ---------------------------------------------------------------------
create table if not exists core.estadistica_juego (
  juego_id     integer not null references core.juego(id) on update cascade,
  periodo      text    not null,
  rondas       integer not null default 0,
  apuesta      numeric(14,2) not null default 0,
  ggr          numeric(14,2) not null default 0,
  actualizado  timestamptz not null default now(),

  primary key (juego_id, periodo)
);


-- =====================================================================
-- Vistas que reemplazan tablas redundantes
-- =====================================================================

-- resumen_mensual_usuarios ya no se almacena: se calcula.
create or replace view core.v_resumen_mensual_usuario as
select
  r.usuario_id,
  to_char(r.dia, 'YYYY-MM')  as mes,
  sum(r.transacciones)::integer as transacciones,
  sum(r.apuestas)::integer      as apuestas,
  sum(r.monto_total)            as monto_total,
  sum(r.apostado)               as apostado,
  sum(r.ganado)                 as ganado,
  sum(r.ganado - r.apostado)    as beneficio,
  max(r.ultima_actividad)       as ultima_actividad
from core.resumen_diario_usuario r
group by r.usuario_id, to_char(r.dia, 'YYYY-MM');

comment on view core.v_resumen_mensual_usuario is
  'Sustituye a la tabla public.resumen_mensual_usuarios. No puede desincronizarse del diario.';

-- ranking_historico_base ya no se almacena: se calcula.
create or replace view core.v_ranking_historico as
select
  h.usuario_id,
  u.username,
  s.nombre                as sitio,
  u.moneda_codigo,
  sum(h.apuestas)::integer as apuestas,
  sum(h.apostado)         as apostado,
  sum(h.ganado)           as ganado,
  sum(h.ganado - h.apostado) as beneficio
from core.historico_diario h
join core.usuario u on u.id = h.usuario_id
join core.sitio   s on s.id = u.sitio_id
group by h.usuario_id, u.username, s.nombre, u.moneda_codigo;

comment on view core.v_ranking_historico is
  'Sustituye a la tabla public.ranking_historico_base.';

-- Vista "plana" de transacciones: lo que antes eran columnas repetidas.
create or replace view core.v_transaccion_detalle as
select
  t.id,
  t.id_externo,
  t.fecha,
  s.nombre           as casa_apuestas,
  u.username         as usuario,
  u.id_externo       as id_usuario_externo,
  ec.codigo          as estado_cliente,
  cx.codigo          as conexion,
  d.codigo           as disciplina,
  j.nombre           as juego,
  tt.codigo          as tipo_transaccion,
  tt.es_apuesta,
  tt.es_ganancia,
  gc.codigo          as grupo_causal,
  b.codigo           as billetera,
  t.moneda_codigo    as moneda,
  t.monto, t.ingresos, t.comision, t.saldo, t.saldo_actual,
  t.descripcion
from core.transaccion t
join core.usuario        u  on u.id  = t.usuario_id
join core.sitio          s  on s.id  = t.sitio_id
join core.disciplina     d  on d.id  = t.disciplina_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.conexion         cx on cx.id = u.conexion_id
left join core.juego            j  on j.id  = t.juego_id
left join core.tipo_transaccion tt on tt.id = t.tipo_transaccion_id
left join core.causal           c  on c.id  = t.causal_id
left join core.grupo_causal     gc on gc.id = c.grupo_causal_id
left join core.billetera        b  on b.id  = t.billetera_id;

comment on view core.v_transaccion_detalle is
  'Equivalente al ancho de public.transacciones_novusbet, resuelto por JOIN.';
