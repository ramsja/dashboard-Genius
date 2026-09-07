-- =====================================================================
-- 005 · Carga de datos: public (actual) → core (normalizado)
-- =====================================================================
-- Idempotente: se puede ejecutar varias veces sin duplicar nada.
-- No modifica ni borra ninguna tabla de `public`.
--
-- Orden obligatorio: dimensiones → usuarios → hechos → agregados.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Dimensiones
-- ---------------------------------------------------------------------

-- Sitios, desde las tres columnas que hoy guardan lo mismo
insert into core.sitio (codigo, nombre)
select distinct nombre, nombre from public.dim_casa_apuestas where nombre is not null
union
select distinct casa_apuestas, casa_apuestas
  from public.transacciones_novusbet where casa_apuestas is not null
union
select distinct site, site
  from public.transaction_records where site is not null and site <> ''
on conflict (codigo) do nothing;

-- Un sitio de reserva para filas sin origen identificable
insert into core.sitio (codigo, nombre) values ('desconocido', 'Sin identificar')
on conflict (codigo) do nothing;

-- Disciplinas que existan en los datos y no en el catálogo semilla
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

-- Monedas
insert into core.moneda (codigo, nombre)
select distinct upper(left(m, 3)), upper(left(m, 3))
  from (
    select moneda   as m from public.transacciones_novusbet
    union select currency from public.transaction_records
    union select moneda   from public.usuarios_novusbet
    union select moneda   from public.apuestas_deportivas
  ) s
 where m is not null and length(trim(m)) = 3
on conflict (codigo) do nothing;

-- Tipos de transacción; es_apuesta/es_ganancia suben del hecho al catálogo
insert into core.tipo_transaccion (codigo, nombre)
select distinct nombre, nombre from public.dim_tipo_transaccion where nombre is not null
union
select distinct tipo_transaccion, tipo_transaccion
  from public.transacciones_novusbet where tipo_transaccion is not null
union
select distinct transaction_type, transaction_type
  from public.transaction_records where transaction_type is not null and transaction_type <> ''
on conflict (codigo) do nothing;

update core.tipo_transaccion tt
   set es_apuesta  = agg.es_apuesta,
       es_ganancia = agg.es_ganancia
  from (
    select tipo_transaccion,
           bool_or(es_apuesta)  as es_apuesta,
           bool_or(es_ganancia) as es_ganancia
      from public.transacciones_novusbet
     where tipo_transaccion is not null
     group by tipo_transaccion
  ) agg
 where tt.codigo = agg.tipo_transaccion;

-- Juegos (la disciplina viaja con el juego)
insert into core.juego (nombre, proveedor, disciplina_id)
select distinct
       dj.nombre,
       null::text,
       coalesce(
         (select id from core.disciplina where codigo = lower(dj.disciplina)),
         (select id from core.disciplina where codigo = 'otros')
       )
  from public.dim_juego dj
 where dj.nombre is not null
on conflict (nombre, proveedor) do nothing;

insert into core.juego (nombre, proveedor, disciplina_id)
select distinct gs.juego, gs.proveedor,
       (select id from core.disciplina where codigo = 'casino')
  from public.game_stats gs
 where gs.juego is not null
on conflict (nombre, proveedor) do nothing;

-- Billeteras
insert into core.billetera (codigo, nombre)
select distinct billeteras, billeteras
  from public.transacciones_novusbet where billeteras is not null and billeteras <> ''
union
select distinct wallet, wallet
  from public.transaction_records where wallet is not null and wallet <> ''
on conflict (codigo) do nothing;

-- Grupos causales y causales
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

-- Tipos de usuario
insert into core.tipo_usuario (codigo, nombre)
select distinct nombre, nombre from public.tipos_usuario where nombre is not null
union
select distinct tipo, tipo from public.usuarios_novusbet where tipo is not null and tipo <> ''
union
select distinct sub_tipo, sub_tipo from public.usuarios_novusbet where sub_tipo is not null and sub_tipo <> ''
union
select distinct user_type, user_type from public.transaction_records where user_type is not null and user_type <> ''
on conflict (codigo) do nothing;


-- ---------------------------------------------------------------------
-- 2. Usuarios · aquí se colapsan las columnas duplicadas
-- ---------------------------------------------------------------------
insert into core.usuario (
  sitio_id, id_externo, username, nombre, apellido,
  tipo_usuario_id, sub_tipo_id, estado_cliente_id, moneda_codigo,
  bono_activo, fecha_registro, primer_deposito, ultimo_acceso
)
select
  coalesce(s.id, (select id from core.sitio where codigo = 'desconocido')),
  src.id_externo,
  src.username,
  src.nombre,
  src.apellido,
  tu.id,
  st.id,
  coalesce(ec.id, (select id from core.estado_cliente where codigo = 'otros')),
  case when length(trim(coalesce(src.moneda, ''))) = 3
       then upper(trim(src.moneda)) end,
  coalesce(src.bono_activo, false),
  src.fecha_registro,
  src.primer_deposito,
  src.ultimo_acceso
from (
  select distinct on (coalesce(un.id_usuario_novusbet, un.id_usuario))
         coalesce(un.id_usuario_novusbet, un.id_usuario)      as id_externo,
         coalesce(un.username, un.usuario, 'sin_nombre')      as username,
         un.nombre, un.apellido,
         coalesce(un.casa_apuestas, un.sitio)                 as sitio,
         un.tipo, un.sub_tipo, un.estado, un.moneda, un.bono_activo,
         coalesce(un.fecha_registro, un.fecha_creacion)       as fecha_registro,
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

-- Usuarios que solo aparecen en las transacciones y no en el maestro
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
       coalesce(nullif(tr.username, ''), tr.user_id)
  from public.transaction_records tr
  left join core.sitio s on s.codigo = tr.site
 where tr.user_id is not null and tr.user_id <> ''
on conflict (sitio_id, id_externo) do nothing;

-- Segunda pasada: la jerarquía padre/hijo, ahora como FK real.
-- Las tres columnas heredadas guardan cosas distintas, así que se
-- resuelven en dos intentos: primero por id externo, luego por username.
update core.usuario u
   set padre_id = p.id
  from public.usuarios_novusbet un
  join core.usuario p on p.id_externo = coalesce(un.id_padre, un.padre)
 where u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
   and p.sitio_id   = u.sitio_id
   and p.id        <> u.id
   and u.padre_id is null;

-- `nombre_usuario_padre` y a veces `padre` traen el nombre, no el id.
-- El username no es único entre sitios, así que se prefiere el padre del
-- mismo sitio y solo se acepta uno de otro sitio si no hay ambigüedad.
update core.usuario u
   set padre_id = (
     select p.id
       from core.usuario p
      where p.username = coalesce(un.nombre_usuario_padre, un.padre)
        and p.id <> u.id
      order by (p.sitio_id = u.sitio_id) desc, p.id
      limit 1
   )
  from public.usuarios_novusbet un
 where u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
   and coalesce(un.nombre_usuario_padre, un.padre) is not null
   and u.padre_id is null;

-- Contacto (PII)
insert into core.usuario_contacto (
  usuario_id, correo, telefono, tipo_documento, numero_documento, direccion_ip, external_id
)
select distinct on (u.id)
       u.id, un.correo, un.telefono, un.tipo_documento, un.numero_documento,
       case when un.direccion_ip ~ '^\d+\.\d+\.\d+\.\d+$'
            then un.direccion_ip::inet end,
       un.external_id
  from public.usuarios_novusbet un
  join core.usuario u
    on u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
 order by u.id, un.actualizado_at desc nulls last
on conflict (usuario_id) do nothing;

-- Saldos
insert into core.usuario_saldo (usuario_id, saldo, saldo_retirable, bono)
select distinct on (u.id)
       u.id, coalesce(un.saldo, 0), coalesce(un.saldo_retirable, 0), coalesce(un.bono, 0)
  from public.usuarios_novusbet un
  join core.usuario u
    on u.id_externo = coalesce(un.id_usuario_novusbet, un.id_usuario)
 order by u.id, un.actualizado_at desc nulls last
on conflict (usuario_id) do nothing;

-- Métricas (perfil de apuestas)
insert into core.usuario_metrica (usuario_id, promedio_apuesta)
select u.id, coalesce(p.promedio_apuesta, 0)
  from public.perfil_apuestas_usuarios p
  join core.usuario u on u.id_externo = p.id_usuario_novusbet
on conflict (usuario_id) do nothing;

-- Administradores
insert into core.admin_usuario (username, password_hash, salt, rol_id, creado_at)
select a.username, a.password_hash, a.salt,
       coalesce((select id from core.rol_admin where codigo = a.rol),
                (select id from core.rol_admin where codigo = 'admin')),
       a.created_at
  from public.admin_usuarios a
on conflict (username) do nothing;


-- ---------------------------------------------------------------------
-- 3. Transacciones · las dos tablas convergen en una
-- ---------------------------------------------------------------------
insert into core.transaccion (
  sitio_id, id_externo, usuario_id, fecha,
  tipo_transaccion_id, disciplina_id, juego_id, billetera_id, moneda_codigo,
  monto, ingresos, comision, saldo, saldo_actual,
  descripcion, origen, raw, importado_at
)
select
  u.sitio_id,
  t.id_transaccion_novusbet,
  u.id,
  coalesce(t.fecha, t.created_at, now()),
  tt.id,
  coalesce(d.id, (select id from core.disciplina where codigo = 'otros')),
  j.id,
  b.id,
  case when length(trim(coalesce(t.moneda, ''))) = 3 then upper(trim(t.moneda)) end,
  coalesce(t.monto, 0), coalesce(t.ingresos, 0), coalesce(t.comision, 0),
  coalesce(t.saldo, 0), coalesce(t.saldo_actual, 0),
  t.descripcion,
  'novusbet',
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
  u.sitio_id,
  tr.source_transaction_id,
  u.id,
  coalesce(tr.created_at, now()),
  tt.id,
  coalesce(d.id, (select id from core.disciplina where codigo = 'otros')),
  c.id,
  b.id,
  case when length(trim(coalesce(tr.currency, ''))) = 3 then upper(trim(tr.currency)) end,
  coalesce(tr.total, 0), coalesce(tr.income, 0), coalesce(tr.commission, 0),
  coalesce(tr.balance, 0), coalesce(tr.current_balance, 0),
  tr.description, tr.note,
  'backoffice',
  tr.source_file,
  tr.raw,
  tr.imported_at
from public.transaction_records tr
join core.usuario u on u.id_externo = tr.user_id
left join core.tipo_transaccion tt on tt.codigo = tr.transaction_type
left join core.disciplina       d  on d.codigo  = lower(tr.discipline)
left join core.grupo_causal     gc on gc.codigo = tr.causal_group
left join core.causal           c  on c.grupo_causal_id = gc.id
                                  and c.codigo = tr.causal
                                  and c.producto is not distinct from nullif(tr.causal_product, '')
left join core.billetera        b  on b.codigo  = tr.wallet
where tr.source_transaction_id is not null and tr.source_transaction_id <> ''
on conflict (sitio_id, id_externo) do nothing;

-- La IP vive en el contacto del usuario, no en cada transacción
insert into core.usuario_contacto (usuario_id, direccion_ip)
select distinct on (u.id) u.id, tr.ip_address
  from public.transaction_records tr
  join core.usuario u on u.id_externo = tr.user_id
 where tr.ip_address is not null
 order by u.id, tr.created_at desc nulls last
on conflict (usuario_id) do update
  set direccion_ip = coalesce(core.usuario_contacto.direccion_ip, excluded.direccion_ip);


-- ---------------------------------------------------------------------
-- 4. Apuestas deportivas
-- ---------------------------------------------------------------------
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
  case when length(trim(coalesce(ad.moneda, ''))) = 3 then upper(trim(ad.moneda)) end,
  ad.coupon_type, ad.bet_type, ad.bono,
  coalesce(ad.fecha, now()), ad.fecha_outcome, ad.fecha_pago,
  coalesce(ad.monto, 0), coalesce(ad.comision, 0), coalesce(ad.total_odds, 0),
  coalesce(ad.no_eventos, 0), coalesce(ad.bono_pagado, 0),
  coalesce(ad.ganancia_base, 0), coalesce(ad.ganancia, 0), coalesce(ad.ganancia_impuesto, 0),
  case when coalesce(ad.pendiente, false) then null else ad.outcome end,
  ad.aplicacion, ad.navegador, coalesce(ad.fuente, 'csv'), ad.importado_at
from public.apuestas_deportivas ad
join core.usuario u on u.id_externo = ad.id_usuario_externo
on conflict (sitio_id, ticket_id) do nothing;


-- ---------------------------------------------------------------------
-- 5. Alertas · las dos tablas se funden en core.alerta
-- ---------------------------------------------------------------------
insert into core.alerta (
  tipo_alerta_id, transaccion_id, severidad_id, monto, umbral_usado, motivo, vista, creado_at
)
select
  (select id from core.tipo_alerta where codigo = 'apuesta'),
  t.id,
  coalesce((select id from core.severidad where codigo = lower(a.severidad)),
           (select id from core.severidad where codigo = 'normal')),
  a.monto, a.umbral_usado, a.motivo_alerta, coalesce(a.vista, false), a.creado_at
from public.alertas_apuestas a
join core.transaccion t on t.id_externo = a.id_transaccion_novusbet
on conflict (transaccion_id, tipo_alerta_id) do nothing;

insert into core.alerta (
  tipo_alerta_id, transaccion_id, severidad_id, monto, umbral_usado, motivo, vista, creado_at
)
select
  (select id from core.tipo_alerta where codigo = 'ganancia'),
  t.id,
  coalesce((select id from core.severidad where codigo = lower(a.severidad)),
           (select id from core.severidad where codigo = 'normal')),
  a.monto, a.umbral_usado, a.patron, coalesce(a.vista, false), a.creado_at
from public.alertas_ganancias a
join core.transaccion t on t.id_externo = a.id_transaccion_novusbet
on conflict (transaccion_id, tipo_alerta_id) do nothing;

-- Umbral global: de tabla de una fila a clave-valor
update core.parametro p
   set valor_numerico = pa.umbral_global,
       actualizado_at = coalesce(pa.actualizado_at, now())
  from public.parametros_alerta_apuestas pa
 where p.clave = 'umbral_alerta_apuesta' and pa.id = 1;


-- ---------------------------------------------------------------------
-- 6. Agregados
-- ---------------------------------------------------------------------
insert into core.resumen_diario_usuario (
  usuario_id, dia, transacciones, apuestas, monto_total, apostado, ganado, ultima_actividad
)
select u.id, r.dia,
       coalesce(r.transacciones, 0), coalesce(r.apuestas, 0),
       coalesce(r.monto_total, 0), coalesce(r.apostado, 0), coalesce(r.ganado, 0),
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
       coalesce(r.apostado, 0), coalesce(r.ganado, 0), coalesce(r.apuestas, 0),
       coalesce(r.ganancias, 0), coalesce(r.jugadores_distintos, 0),
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
       coalesce(dm.total_transactions, 0), coalesce(dm.unique_users, 0),
       coalesce(dm.total_income, 0), coalesce(dm.total_amount, 0),
       coalesce(dm.total_commission, 0), dm.source_file
  from public.daily_metrics dm
  left join core.disciplina d  on d.codigo  = lower(dm.discipline)
  left join core.conexion   cx on cx.codigo = lower(dm.connection_type)
on conflict (dia, disciplina_id, conexion_id) do nothing;

insert into core.historico_diario (usuario_id, dia, apuestas, apostado, ganado, importado_at)
select u.id, h.dia,
       coalesce(h.apuestas, 0), coalesce(h.apostado, 0), coalesce(h.ganado, 0),
       coalesce(h.importado_at, now())
  from public.historico_csv_mensual h
  join core.usuario u on u.id_externo = h.id_usuario_novusbet
on conflict (usuario_id, dia) do nothing;

insert into core.historico_diario_juego (
  juego_id, dia, apostado, ganado, apuestas, ganancias, jugadores_distintos, importado_at
)
select j.id, h.dia,
       coalesce(h.apostado, 0), coalesce(h.ganado, 0), coalesce(h.apuestas, 0),
       coalesce(h.ganancias, 0), coalesce(h.jugadores_distintos, 0),
       coalesce(h.importado_at, now())
  from public.historico_csv_juegos h
  join core.juego j on j.nombre = h.juego and j.proveedor is null
on conflict (juego_id, dia) do nothing;

insert into core.estadistica_juego (juego_id, periodo, rondas, apuesta, ggr, actualizado)
select j.id, gs.periodo,
       coalesce(gs.rondas, 0), coalesce(gs.apuesta, 0), coalesce(gs.ggr, 0),
       coalesce(gs.actualizado, now())
  from public.game_stats gs
  join core.juego j on j.nombre = gs.juego
                   and j.proveedor is not distinct from gs.proveedor
on conflict (juego_id, periodo) do nothing;

commit;

-- =====================================================================
-- Verificación: compara el conteo de cada tabla origen con su destino.
-- Ejecuta este bloque después de la carga.
-- =====================================================================
-- select 'usuarios'      as entidad,
--        (select count(*) from public.usuarios_novusbet)     as origen,
--        (select count(*) from core.usuario)                 as destino
-- union all select 'transacciones',
--        (select count(*) from public.transacciones_novusbet)
--      + (select count(*) from public.transaction_records),
--        (select count(*) from core.transaccion)
-- union all select 'apuestas',
--        (select count(*) from public.apuestas_deportivas),
--        (select count(*) from core.apuesta_deportiva)
-- union all select 'alertas',
--        (select count(*) from public.alertas_apuestas)
--      + (select count(*) from public.alertas_ganancias),
--        (select count(*) from core.alerta);
