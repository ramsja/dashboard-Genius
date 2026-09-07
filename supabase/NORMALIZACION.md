# Normalización de la base de datos

Pasa el modelo actual (24 tablas en `public`, con texto repetido y dos
pipelines en paralelo) a un modelo en tercera forma normal dentro del
esquema `core`, **sin borrar nada** y **sin romper el código existente**.

## Cómo aplicarlo

Ejecuta los archivos de `supabase/migrations/` en orden, desde el SQL Editor
de Supabase o con `psql`:

| Archivo | Qué hace | ¿Reversible? |
|---|---|---|
| `001_core_dimensiones.sql` | Crea el esquema `core` y los 13 catálogos | Sí |
| `002_core_entidades.sql` | Usuarios, contacto (PII), saldos, métricas | Sí |
| `003_core_hechos.sql` | Transacciones, apuestas y alertas | Sí |
| `004_core_agregados.sql` | Resúmenes, históricos y vistas derivadas | Sí |
| `005_carga_desde_legacy.sql` | Copia los datos de `public` a `core` | Sí, no toca el origen |
| `006_vistas_compatibilidad.sql` | **El corte.** Mueve `public` a `legacy` y deja vistas | Sí, ver abajo |
| `007_rls.sql` | Seguridad a nivel de fila | Sí |

Los archivos 001 a 005 son seguros: crean cosas nuevas y copian datos, pero
no modifican ni borran ninguna tabla existente. Puedes ejecutarlos hoy y
seguir trabajando igual que siempre.

**Antes de ejecutar el 006**, comprueba que la carga cuadró. Al final de
`005` hay una consulta comentada que compara los conteos de origen y
destino. Descoméntala y ejecútala.

Para revertir el corte:

```sql
drop view public.transacciones_novusbet;         -- y las demás vistas
alter table legacy.transacciones_novusbet set schema public;
```

## Qué se corrigió

### Primera forma normal · valores múltiples en una celda

`resumen_diario_usuarios` guardaba `juegos` y `disciplinas` como columnas
`ARRAY`. Un array dentro de una celda no se puede filtrar, agrupar ni sumar:
para responder "cuánto se apostó en Sweet Bonanza" había que recorrer todas
las filas y desarmar los arrays.

Ahora hay una tabla hija, `core.resumen_diario_usuario_juego`, con una fila
por juego y sus propias medidas.

### Segunda forma normal · atributos que no dependen de toda la clave

Las tablas de resumen tienen la clave (usuario, día), pero repetían
`usuario` y `casa_apuestas` en cada fila. Esos datos dependen solo del
usuario. Si alguien cambiaba de nombre, quedaban miles de filas con el
nombre viejo.

Ahora es una clave foránea a `core.usuario`; el nombre vive en un solo sitio.

### Tercera forma normal · dependencias transitivas

`transacciones_novusbet` guardaba `usuario`, `casa_apuestas`,
`estado_cliente` y `moneda` en cada una de sus filas. Ninguno es un atributo
de la transacción: son del usuario que la hizo. Lo mismo pasaba en las dos
tablas de alertas, que además copiaban `disciplina`, `juego`, `descripcion`
y `fecha` desde la transacción.

Ahora se obtienen con un `JOIN`. Si te resulta más cómodo el formato ancho
de antes, `core.v_transaccion_detalle` lo devuelve tal cual.

### Dos tablas para el mismo hecho

`transacciones_novusbet` (pipeline NovusBet) y `transaction_records`
(pipeline `extraccionDatos.py`) guardaban lo mismo con nombres distintos:
`monto`/`total`, `ingresos`/`income`, `comision`/`commission`,
`casa_apuestas`/`site`.

Ambas convergen en `core.transaccion`. La columna `origen` distingue de qué
pipeline vino cada fila, así que puedes seguir consultándolas por separado
sin mantener dos tablas.

### Columnas duplicadas dentro de una misma tabla

`usuarios_novusbet` acumuló pares de columnas de sucesivas importaciones.
Cada consulta tenía que adivinar cuál estaba poblada:

| Antes | Ahora |
|---|---|
| `username`, `usuario` | `username` |
| `id_usuario_novusbet`, `id_usuario` | `id_externo` |
| `id_padre`, `nombre_usuario_padre`, `padre` | `padre_id` (clave foránea) |
| `fecha_registro`, `fecha_creacion` | `fecha_registro` |
| `casa_apuestas`, `sitio` | `sitio_id` |

La migración usa `coalesce` sobre cada par, así que da igual cuál de las dos
estuviera poblada. La jerarquía padre/hijo se resuelve en dos intentos:
primero por identificador externo, luego por nombre de usuario.

### Tablas que en realidad eran consultas

`resumen_mensual_usuarios` es la suma de `resumen_diario_usuarios`, y
`ranking_historico_base` es la suma de `historico_csv_mensual`. Mantenerlas
como tablas obliga a recalcularlas y abre la puerta a que queden
desincronizadas del diario.

Ahora son vistas: `core.v_resumen_mensual_usuario` y
`core.v_ranking_historico`. No pueden mentir.

Lo mismo con las columnas calculadas: `beneficio` es ahora
`generated always as (ganado - apostado) stored`, así que es imposible
guardar un beneficio que no cuadre con sus componentes.

### Columnas redundantes

- `apuestas_deportivas.pendiente` equivalía a `outcome is null`. Eliminada.
- `apuestas_deportivas.dia` se deducía de `fecha`. Eliminada.
- `transacciones_novusbet.es_apuesta` / `es_ganancia` dependían del tipo de
  transacción, no de la fila. Subieron a `core.tipo_transaccion`.
- `daily_metrics.online_users` / `retail_users` eran columnas-valor: la
  conexión ya forma parte de la clave, así que basta `usuarios_unicos`.

### Tabla de una sola fila

`parametros_alerta_apuestas` usaba `id integer default 1 check (id = 1)`
para forzar que existiera un único registro. Añadir un segundo parámetro
exigía una columna nueva. Ahora es `core.parametro`, clave-valor.

### Tablas del diseño abandonado

`usuarios`, `tipos_usuario`, `estados_usuario` y `disciplinas` (las de
`serial` y `permisos jsonb`) no las usa ningún proceso del repositorio.
Sus contenidos se absorbieron en los catálogos correspondientes y las
tablas pasan a `legacy`.

## Datos personales

`usuarios_novusbet` guardaba correo, teléfono, documento e IP junto al resto
del perfil. En Supabase, cualquier tabla sin RLS es legible con la clave
`anon`, que va incrustada en el navegador de quien abra el dashboard.

Esos campos están ahora en `core.usuario_contacto`, una tabla aparte con RLS
activo y **ninguna política de lectura**: solo se llega a ella con
`service_role`, es decir, desde el backend. Lo mismo con
`core.admin_usuario` y sus hashes.

Matriz de acceso resultante:

| | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| Catálogos | Lee | Lee | Todo |
| Transacciones, resúmenes | — | Lee | Todo |
| Contacto (PII), credenciales | — | — | Todo |

## Compatibilidad

Tras el `006`, `public` contiene vistas con los nombres y columnas de
siempre. `extraccionDatos.py`, el visor y el dashboard siguen leyendo
`public.transacciones_novusbet` sin cambios.

Dos detalles a tener en cuenta:

- Las vistas son **de solo lectura**. Los procesos que escriben deben pasar
  a insertar en `core` (o mantenerse leyendo las tablas de `legacy` hasta
  que los adaptes).
- `public.usuarios_novusbet` puede devolver alguna fila de más: son usuarios
  que antes solo existían como texto suelto dentro de las transacciones, sin
  ficha propia. Ahora tienen una, que es justamente lo que evita las
  transacciones huérfanas.

## Verificado

Las siete migraciones se probaron sobre PostgreSQL 16 contra una copia del
esquema real con datos que cubren los casos difíciles: usuarios cargados con
las columnas viejas, jerarquía por identificador y por nombre, usuarios
huérfanos, arrays con varios juegos y las dos tablas de transacciones a la
vez.

Resultados: las siete se aplican sin error, `005` es idempotente (correrlo
dos veces no duplica), cada vista de compatibilidad devuelve el mismo número
de filas que su tabla original, y la matriz de acceso se comporta como la
tabla de arriba.
