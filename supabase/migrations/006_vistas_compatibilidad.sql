-- =====================================================================
-- 006 · Corte: vistas de compatibilidad
-- =====================================================================
-- EJECUTAR SOLO cuando la verificación de 005 cuadre.
--
-- Mueve las tablas actuales al esquema `legacy` (no las borra) y crea en
-- `public` vistas con los mismos nombres y columnas. El código que ya
-- existe —extraccionDatos.py, el visor, el dashboard— sigue leyendo
-- `public.transacciones_novusbet` sin enterarse de que ahora es una vista
-- sobre el modelo normalizado.
--
-- Para revertir:  drop view ...; alter table legacy.x set schema public;
-- =====================================================================

begin;

create schema if not exists legacy;
comment on schema legacy is
  'Tablas originales conservadas tras la normalización. Solo lectura.';

-- ---------------------------------------------------------------------
-- Apartar las tablas originales
-- ---------------------------------------------------------------------
alter table public.transacciones_novusbet     set schema legacy;
alter table public.transaction_records        set schema legacy;
alter table public.usuarios_novusbet          set schema legacy;
alter table public.alertas_apuestas           set schema legacy;
alter table public.alertas_ganancias          set schema legacy;
alter table public.resumen_diario_usuarios    set schema legacy;
alter table public.resumen_mensual_usuarios   set schema legacy;
alter table public.resumen_diario_juegos      set schema legacy;
alter table public.perfil_apuestas_usuarios   set schema legacy;
alter table public.ranking_historico_base     set schema legacy;
alter table public.parametros_alerta_apuestas set schema legacy;
alter table public.apuestas_deportivas        set schema legacy;
alter table public.historico_csv_mensual      set schema legacy;
alter table public.historico_csv_juegos       set schema legacy;
alter table public.daily_metrics              set schema legacy;
alter table public.game_stats                 set schema legacy;
alter table public.admin_usuarios             set schema legacy;

-- Catálogos antiguos
alter table public.dim_casa_apuestas     set schema legacy;
alter table public.dim_juego             set schema legacy;
alter table public.dim_tipo_transaccion  set schema legacy;
alter table public.resumen_normalizacion set schema legacy;

-- Tablas del diseño inicial que ningún proceso usa
alter table public.usuarios        set schema legacy;
alter table public.tipos_usuario   set schema legacy;
alter table public.estados_usuario set schema legacy;
alter table public.disciplinas     set schema legacy;

-- ---------------------------------------------------------------------
-- Vistas con los nombres y columnas de siempre
-- ---------------------------------------------------------------------
create or replace view public.transacciones_novusbet as
select
  t.id,
  u.username            as usuario,
  tt.codigo             as tipo_transaccion,
  t.monto,
  d.codigo              as disciplina,
  t.descripcion,
  t.fecha,
  t.raw                 as datos_raw,
  t.importado_at        as created_at,
  ec.codigo             as estado_cliente,
  s.codigo              as casa_apuestas,
  u.id_externo          as id_usuario_novusbet,
  t.moneda_codigo       as moneda,
  t.ingresos,
  t.comision,
  t.saldo,
  t.saldo_actual,
  b.codigo              as billeteras,
  gc.codigo             as grupo_causal,
  j.nombre              as juego,
  t.id_externo          as id_transaccion_novusbet,
  coalesce(tt.es_apuesta, false)  as es_apuesta,
  coalesce(tt.es_ganancia, false) as es_ganancia
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
-- El filtro por origen mantiene la equivalencia 1:1 con la tabla
-- original: sin él, la vista devolvería también las filas del
-- back office y el código existente contaría el doble.
where t.origen = 'novusbet';

create or replace view public.transaction_records as
select
  t.id,
  t.id_externo     as source_transaction_id,
  t.fecha          as created_at,
  s.codigo         as site,
  p.id_externo     as parent_id,
  u.id_externo     as user_id,
  u.username,
  tu.codigo        as user_type,
  t.moneda_codigo  as currency,
  t.ingresos       as income,
  null::numeric    as status,
  t.monto          as total,
  t.comision       as commission,
  t.saldo          as balance,
  t.saldo_actual   as current_balance,
  b.codigo         as wallet,
  tt.codigo        as transaction_type,
  gc.codigo        as causal_group,
  c.codigo         as causal,
  c.producto       as causal_product,
  t.descripcion    as description,
  t.nota           as note,
  uc.direccion_ip  as ip_address,
  d.codigo         as discipline,
  coalesce(ec.codigo, 'otros')      as client_status,
  coalesce(cx.codigo, 'desconocido') as connection,
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
  u.id_externo      as id_usuario_novusbet,
  u.username,
  u.nombre,
  u.apellido,
  uc.correo,
  s.codigo          as casa_apuestas,
  ec.codigo         as estado,
  tu.codigo         as tipo,
  st.codigo         as sub_tipo,
  p.id_externo      as id_padre,
  p.username        as nombre_usuario_padre,
  uc.telefono,
  uc.tipo_documento,
  uc.numero_documento,
  host(uc.direccion_ip) as direccion_ip,
  u.bono_activo,
  uc.external_id,
  u.moneda_codigo   as moneda,
  u.fecha_registro,
  u.ultimo_acceso,
  u.primer_deposito,
  u.actualizado_at,
  u.id_externo      as id_usuario,
  u.username        as usuario,
  p.username        as padre,
  sa.saldo,
  sa.saldo_retirable,
  sa.bono,
  s.codigo          as sitio,
  u.fecha_registro  as fecha_creacion
from core.usuario u
join core.sitio s on s.id = u.sitio_id
left join core.usuario_contacto uc on uc.usuario_id = u.id
left join core.usuario_saldo    sa on sa.usuario_id = u.id
left join core.usuario          p  on p.id  = u.padre_id
left join core.estado_cliente   ec on ec.id = u.estado_cliente_id
left join core.tipo_usuario     tu on tu.id = u.tipo_usuario_id
left join core.tipo_usuario     st on st.id = u.sub_tipo_id;

create or replace view public.alertas_apuestas as
select
  a.id,
  t.id_externo   as id_transaccion_novusbet,
  u.id_externo   as id_usuario_novusbet,
  u.username     as usuario,
  s.codigo       as casa_apuestas,
  a.monto,
  d.codigo       as disciplina,
  j.nombre       as juego,
  t.descripcion,
  t.fecha,
  a.umbral_usado,
  a.vista,
  a.creado_at,
  a.motivo       as motivo_alerta,
  sv.codigo      as severidad
from core.alerta a
join core.tipo_alerta ta on ta.id = a.tipo_alerta_id and ta.codigo = 'apuesta'
join core.transaccion t  on t.id  = a.transaccion_id
join core.usuario     u  on u.id  = t.usuario_id
join core.sitio       s  on s.id  = t.sitio_id
join core.disciplina  d  on d.id  = t.disciplina_id
join core.severidad   sv on sv.id = a.severidad_id
left join core.juego  j  on j.id  = t.juego_id;

create or replace view public.alertas_ganancias as
select
  a.id,
  t.id_externo   as id_transaccion_novusbet,
  u.id_externo   as id_usuario_novusbet,
  u.username     as usuario,
  s.codigo       as casa_apuestas,
  a.monto,
  d.codigo       as disciplina,
  j.nombre       as juego,
  t.descripcion,
  t.fecha,
  a.umbral_usado,
  a.vista,
  a.creado_at,
  a.motivo       as patron,
  sv.codigo      as severidad
from core.alerta a
join core.tipo_alerta ta on ta.id = a.tipo_alerta_id and ta.codigo = 'ganancia'
join core.transaccion t  on t.id  = a.transaccion_id
join core.usuario     u  on u.id  = t.usuario_id
join core.sitio       s  on s.id  = t.sitio_id
join core.disciplina  d  on d.id  = t.disciplina_id
join core.severidad   sv on sv.id = a.severidad_id
left join core.juego  j  on j.id  = t.juego_id;

create or replace view public.resumen_diario_usuarios as
select
  r.usuario_id as id,
  u.id_externo as id_usuario_novusbet,
  u.username   as usuario,
  s.codigo     as casa_apuestas,
  r.dia,
  r.transacciones,
  r.apuestas,
  r.monto_total,
  r.apostado,
  r.ganado,
  array(
    select j.nombre
      from core.resumen_diario_usuario_juego rj
      join core.juego j on j.id = rj.juego_id
     where rj.usuario_id = r.usuario_id and rj.dia = r.dia
  ) as juegos,
  array(
    select distinct d.codigo
      from core.resumen_diario_usuario_juego rj
      join core.juego j      on j.id = rj.juego_id
      join core.disciplina d on d.id = j.disciplina_id
     where rj.usuario_id = r.usuario_id and rj.dia = r.dia
  ) as disciplinas,
  r.ultima_actividad,
  r.actualizado_at
from core.resumen_diario_usuario r
join core.usuario u on u.id = r.usuario_id
join core.sitio   s on s.id = u.sitio_id;

create or replace view public.resumen_mensual_usuarios as
select
  v.usuario_id as id,
  u.id_externo as id_usuario_novusbet,
  u.username   as usuario,
  s.codigo     as casa_apuestas,
  v.mes,
  v.transacciones,
  v.monto_total,
  v.ultima_actividad,
  now()        as actualizado_at,
  v.apuestas,
  array[]::text[] as juegos,
  v.apostado,
  v.ganado
from core.v_resumen_mensual_usuario v
join core.usuario u on u.id = v.usuario_id
join core.sitio   s on s.id = u.sitio_id;

create or replace view public.ranking_historico_base as
select
  v.usuario_id as id_usuario_novusbet_id,
  u.id_externo as id_usuario_novusbet,
  v.username   as usuario,
  v.sitio      as casa_apuestas,
  v.apuestas,
  v.apostado,
  v.ganado,
  v.beneficio,
  v.moneda_codigo as moneda,
  now() as importado_at
from core.v_ranking_historico v
join core.usuario u on u.id = v.usuario_id;

create or replace view public.perfil_apuestas_usuarios as
select u.id_externo as id_usuario_novusbet,
       m.promedio_apuesta,
       m.actualizado_at
  from core.usuario_metrica m
  join core.usuario u on u.id = m.usuario_id;

create or replace view public.parametros_alerta_apuestas as
select 1 as id,
       (select valor_numerico from core.parametro where clave = 'umbral_alerta_apuesta') as umbral_global,
       (select actualizado_at from core.parametro where clave = 'umbral_alerta_apuesta') as actualizado_at;

create or replace view public.daily_metrics as
select
  row_number() over (order by m.dia, m.disciplina_id, m.conexion_id) as id,
  m.dia           as metric_date,
  d.codigo        as discipline,
  cx.codigo       as connection_type,
  m.total_transacciones as total_transactions,
  m.usuarios_unicos     as unique_users,
  case when cx.codigo = 'online' then m.usuarios_unicos else 0 end as online_users,
  case when cx.codigo = 'retail' then m.usuarios_unicos else 0 end as retail_users,
  m.ingresos      as total_income,
  m.monto_total   as total_amount,
  m.comision      as total_commission,
  m.archivo_origen as source_file,
  m.actualizado_at as created_at,
  m.actualizado_at as updated_at
from core.metrica_diaria m
join core.disciplina d  on d.id  = m.disciplina_id
join core.conexion   cx on cx.id = m.conexion_id;

create or replace view public.game_stats as
select
  row_number() over (order by e.periodo, j.nombre) as id,
  e.periodo,
  j.proveedor,
  j.nombre as juego,
  e.rondas,
  e.apuesta,
  e.ggr,
  e.actualizado
from core.estadistica_juego e
join core.juego j on j.id = e.juego_id;

create or replace view public.apuestas_deportivas as
select
  a.id, a.ticket_id, a.ticket_code,
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
select
  row_number() over (order by r.dia, j.nombre) as id,
  j.nombre as juego,
  r.dia, r.apostado, r.ganado, r.apuestas, r.ganancias,
  r.jugadores_distintos, r.actualizado_at
from core.resumen_diario_juego r
join core.juego j on j.id = r.juego_id;

create or replace view public.historico_csv_mensual as
select
  row_number() over (order by h.dia, u.id_externo) as id,
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
select
  row_number() over (order by h.dia, j.nombre) as id,
  h.dia, j.nombre as juego,
  h.apostado, h.ganado, h.apuestas, h.ganancias,
  h.jugadores_distintos, h.importado_at
from core.historico_diario_juego h
join core.juego j on j.id = h.juego_id;

create or replace view public.admin_usuarios as
select a.id, a.username, a.password_hash, a.salt,
       r.codigo as rol, a.creado_at as created_at
from core.admin_usuario a
join core.rol_admin r on r.id = a.rol_id;

-- Catálogos antiguos, por si algún proceso todavía los consulta
create or replace view public.dim_casa_apuestas as
select id::integer, codigo as nombre, creado_at as created_at from core.sitio;

create or replace view public.dim_juego as
select j.id, j.nombre, d.codigo as disciplina, j.creado_at as created_at
  from core.juego j join core.disciplina d on d.id = j.disciplina_id;

create or replace view public.dim_tipo_transaccion as
select id::integer, codigo as nombre, creado_at as created_at from core.tipo_transaccion;

commit;
