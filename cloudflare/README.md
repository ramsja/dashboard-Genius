# API del dashboard sobre Cloudflare D1

Base SQLite gestionada (D1) + un Worker que la expone. La página del dashboard
**no lleva credenciales**: pide datos al Worker, que ejecuta consultas fijas y
solo devuelve agregados.

## Por qué un Worker y no la base directa

El dashboard es estático y público. Cualquier credencial que se ponga en el HTML
la puede leer quien abra la página. Con un token de base de datos en la página,
quien lo lea consulta la base entera. El Worker evita eso: es el único que habla
con D1, y solo sabe responder las consultas que tiene escritas.

Esto importa porque el CSV de origen trae número de teléfono del cliente, su ID
del back office y dirección IP. **Ninguna de esas columnas existe en este
esquema** (ver `schema.sql`): el cargador sube solo agregados, y los rankings por
jugador viajan con un alias HMAC-SHA256 del ID usando una sal secreta — sigue al
mismo jugador entre períodos sin poder volver a su identidad.

## Piezas

| archivo | qué es |
|---|---|
| `schema.sql` | tablas de la base. Claves primarias pensadas para que reimportar el mismo export reescriba en vez de sumar |
| `worker.js` | API de lectura (`/api/snapshot`, `/api/historico`, `/api/juegos`, `/api/jugadores`, `/api/ingestas`, `/api/salud`) y el endpoint autenticado `POST /ingesta` |
| `wrangler.toml` | configuración del Worker y el binding de la base |
| `../subir-a-d1.py` | carga los agregados desde los JSON ya generados |
| `../test_subir_a_d1.py` | pruebas; incluye el viaje completo contra SQLite usando el SQL del propio Worker |

`/api/snapshot` y `/api/historico` devuelven la misma forma que
`dashboard/data/snapshot.json` y `historico.json`. Por eso el dashboard puede
caer al JSON estático sin ninguna rama distinta de render.

## Puesta en marcha

Hace falta una cuenta de Cloudflare. Desde la raíz del repo:

```bash
# 1. crear la base (imprime el database_id)
npx wrangler d1 create dashboard-genius

# 2. pegar ese id en cloudflare/wrangler.toml, en database_id

# 3. crear las tablas
npx wrangler d1 execute dashboard-genius --remote --file=cloudflare/schema.sql

# 4. secreto que autoriza la carga (genera uno largo y guárdalo)
openssl rand -hex 32
npx wrangler secret put TOKEN_INGESTA --config cloudflare/wrangler.toml

# 5. desplegar
npx wrangler deploy --config cloudflare/wrangler.toml
```

Eso imprime la URL del Worker, algo como
`https://dashboard-genius-api.TU-CUENTA.workers.dev`.

### Secretos en GitHub

En *Settings → Secrets and variables → Actions*:

| secreto | valor |
|---|---|
| `D1_API_URL` | la URL del Worker |
| `D1_TOKEN_INGESTA` | el mismo valor que pusiste en `TOKEN_INGESTA` |
| `D1_SAL_ALIAS` | una cadena larga y **estable**: si cambia, los alias cambian y se pierde la continuidad de los rankings |

Con los tres puestos, cada corrida de `extraccion-diaria` sube los agregados, y
`deploy-pages` genera el `config.js` apuntando al Worker. Si falta alguno, el
paso de subida avisa y termina bien: el dashboard sigue con el JSON estático.

### Comprobar

```bash
curl https://TU-WORKER.workers.dev/api/salud
curl https://TU-WORKER.workers.dev/api/snapshot | head -c 400
python subir-a-d1.py --dry-run    # qué subiría, sin tocar la red
```

`/api/ingestas` muestra las últimas cargas con su `generado_en` y su total: sirve
para ver si el back office está mandando exports cortos o repetidos, que es el
problema de fondo de este pipeline.

## Límites que conviene saber

- El Worker acepta como máximo 500 filas por lote en `POST /ingesta`; el cargador
  trocea solo.
- `ORIGENES_PERMITIDOS` en `wrangler.toml` restringe quién puede leer la API
  desde un navegador. Vacío = cualquiera.
- Las tablas `ventana_*` y `jugador_periodo` describen **una** ventana y se
  vacían antes de escribir. Las tablas por día se reescriben por clave.
- Los agregados actuales son ~965 filas por corrida. Esto no pretende guardar las
  transacciones crudas: esas se quedan en el equipo, que es donde deben estar.
