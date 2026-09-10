-- Esquema de la base D1 que alimenta el dashboard publico.
--
-- Regla de diseno 1: aqui solo entran AGREGADOS. Ninguna tabla guarda el
-- numero de telefono del cliente, su ID del back office ni la direccion IP.
-- El CSV de origen trae esas tres cosas. Los rankings por jugador usan un
-- alias derivado con sal (ver subir-a-d1.py): sigue al mismo jugador entre
-- periodos sin poder volver a su identidad.
--
-- Regla de diseno 2: cada tabla guarda un grano que YA existe en los JSON
-- generados, sin inventar cruces. historico.json tiene marginales por dia;
-- snapshot.json tiene cruces de dos ejes (disciplina x conexion y
-- disciplina x estado). Por eso hay tablas separadas para el dia y para la
-- ventana del export, en vez de una sola tabla de hechos con un cruce que
-- nadie calcula.
--
-- Regla de diseno 3: las claves primarias hacen la ingesta idempotente. Cada
-- corrida reescribe la fila en vez de sumarla, asi que reimportar el mismo
-- export no infla nada. Sumar exports solapados es exactamente el error que
-- tiene importar-perp-casino.py.

-- ---------------------------------------------------------------
-- Ventana del export actual (lo que snapshot.json describe).
-- Estas tres tablas se reemplazan enteras en cada ingesta: describen una sola
-- ventana, no una serie. Un upsert sin borrado dejaria combinaciones viejas.
-- ---------------------------------------------------------------

create table if not exists ventana_meta (
    clave       text not null primary key,   -- siempre 'actual'
    generado_en text,
    fuente      text,
    total       integer not null default 0
);

create table if not exists ventana_dimension (
    eje       text    not null,              -- disciplina | conexion | estado
    valor     text    not null,
    registros integer not null default 0,
    primary key (eje, valor)
);

create table if not exists ventana_cruce (
    disciplina text    not null,
    eje        text    not null,             -- conexion | estado
    valor      text    not null,
    registros  integer not null default 0,
    primary key (disciplina, eje, valor)
);

create table if not exists ventana_money (
    disciplina text not null primary key,
    ingresos   real not null default 0,
    total      real not null default 0,
    comision   real not null default 0
);

-- ---------------------------------------------------------------
-- Serie historica por dia (lo que historico.json acumula).
-- ---------------------------------------------------------------

create table if not exists dia_total (
    dia             text    not null primary key,
    transacciones   integer not null default 0,
    clientes_total  integer not null default 0,
    clientes_online integer not null default 0,
    clientes_retail integer not null default 0
);

create table if not exists dia_dimension (
    dia       text    not null,
    eje       text    not null,              -- disciplina | conexion | estado
    valor     text    not null,
    registros integer not null default 0,
    primary key (dia, eje, valor)
);

create table if not exists dia_money (
    dia        text not null,
    disciplina text not null,
    ingresos   real not null default 0,
    total      real not null default 0,
    comision   real not null default 0,
    primary key (dia, disciplina)
);

-- ---------------------------------------------------------------
-- Juegos y jugadores.
-- ---------------------------------------------------------------

create table if not exists juego_dia (
    dia       text    not null,
    titulo    text    not null,
    proveedor text    not null,
    categoria text    not null default 'casino',
    jugadas   integer not null default 0,
    apuesta   real    not null default 0,
    primary key (dia, titulo, proveedor)
);

create index if not exists juego_dia_jugadas_idx on juego_dia(jugadas desc);

-- alias = hash con sal del ID de usuario. Sin la sal, que vive en un secreto
-- y no en esta base, el alias no es reversible.
create table if not exists jugador_periodo (
    alias         text    not null,
    desde         text    not null,
    hasta         text    not null,
    canal         text    not null default 'desconocido',
    dias_activos  integer not null default 0,
    transacciones integer not null default 0,
    apuesta_total real    not null default 0,
    perdida_neta  real    not null default 0,
    primary key (alias, desde, hasta)
);

create index if not exists jugador_periodo_apuesta_idx on jugador_periodo(apuesta_total desc);

-- ---------------------------------------------------------------
-- Rastro de ingestas: permite ver desde el dashboard si el origen manda
-- exports cortos o repetidos, que es el problema real de este pipeline.
-- ---------------------------------------------------------------

create table if not exists ingesta (
    id              integer primary key autoincrement,
    subido_en       text not null,
    generado_en     text,
    fuente          text,
    dias            integer not null default 0,
    transacciones   integer not null default 0
);
