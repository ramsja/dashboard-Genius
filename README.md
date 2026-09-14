# Dashboard Genius · Extractor + Dashboard

Proyecto que recoge **transacciones del Back Office** y genera un **resumen diario** para visualizar el estado de clientes por **disciplina** y por **conexión** (online / retail).

## Flujo de datos

```
Back Office ──(extraccionDatos.py)──▶ descargas/*.csv ──▶ reportes/*.csv + *.json
                                                              │
                                       reportes/dashboard-data.json ──▶ dashboard/data/snapshot.json
                                                              │
                                                              └──▶ Supabase (opcional) ──▶ dashboard en vivo
```

## 1) Configuración local

1. Copia `.env.example` a `.env`:

   ```bash
   cp .env.example .env
   ```

2. Completa `BO_USERNAME`, `BO_PASSWORD` y `CAUSAL_PRODUCT_ID`. Las fechas `START_DATE`/`END_DATE` son opcionales (por defecto, hoy).
3. Instala dependencias:

   ```bash
   python -m pip install requests beautifulsoup4 python-dotenv
   ```

4. Ejecuta la extracción:

   ```bash
   python extraccionDatos.py
   ```

Esto descarga el CSV a `descargas/`, genera reportes en `reportes/` y (si está configurado) sincroniza con Supabase.

## 2) Dashboard visual

El dashboard es **estático** (HTML + JS + SVG, sin dependencias externas). Lee datos así:

1. **Supabase (en vivo)** si `dashboard/config.js` lo habilita.
2. **JSON estático** (`dashboard/data/snapshot.json`) como respaldo. Este snapshot es un resumen **agregado** (solo conteos y montos, sin datos personales) y se actualiza con cada ejecución.

Para verlo en local:

```bash
python -m http.server 8000
```

Abre <http://localhost:8000/dashboard/>.

Para apuntar el dashboard a Supabase: copia `dashboard/config.example.js` a `dashboard/config.js`, activa `supabase.enabled` y pega tu URL y anon key (solo lectura).

## 2b) Tickets deportivos por disciplina

Sección del dashboard que desglosa los **tickets de apuestas deportivas por deporte/disciplina** (Soccer, Baseball, Tennis, eSoccer, …), con selector de periodo, KPIs (tickets, importe apostado, deportes con actividad, ticket promedio), barras top 12 y tabla con %, importe, pendiente, cuota media y estados (Running/Won/Lost/Cashout/Void).

- **Extractor:** `extraccion-tickets-deporte.py` — recorre el catálogo de deportes del filtro `sport_id[]` de la betlist V2 del Back Office, cuenta tickets por deporte (Fecha de colocación) y descarga el export CSV de los deportes con actividad (flujo Elastic: `export` → `scrollId` → `download`).
- **Salida:** `dashboard/data/desglose-tickets.json` (acumula periodos) y `reportes/desglose-tickets.csv`.
- **Uso:**

```bash
python extraccion-tickets-deporte.py                  # mes en curso
python extraccion-tickets-deporte.py --mes 2026-08    # un mes concreto
```

- La extracción diaria (workflow) lo ejecuta automáticamente y commitea el JSON; el dashboard lo lee con selector "Periodo:".
- Duración típica: ~10-13 min por mes (206 deportes, pausa de cortesía entre consultas).

## 2c) Historial de transacciones y clientes únicos

Sección del dashboard con la **serie histórica por día**: transacciones totales, reparto online/retail, **clientes únicos** por día (cuántos clientes distintos operaron, separados online vs retail), ingresos y total. Las barras comparan las últimas semanas y la tabla lista todos los días registrados.

- **Constructor:** `construir-historico.py` — lee los CSV de `descargas/` (o rutas que se le pasen), agrupa por la columna "Crear hora" y actualiza `dashboard/data/historico.json` acumulando días. Si un día ya existía, se reemplaza (idempotente, sin duplicados).
- **Clientes únicos:** cuenta `ID de usuario` distintos por día; "online" = tuvo al menos una transacción `Player Online`, "retail" = solo `Player Retail` (un cliente mixto cuenta en ambos).
- **Uso:**

```bash
python construir-historico.py                # procesa todos los CSV de descargas/
python construir-historico.py descargas/     # equivalente explícito
```

- La extracción diaria (workflow) lo ejecuta tras cada descarga y commitea el JSON junto al snapshot.
- Para rellenar histórico antiguo: `START_DATE=2026-08-01 END_DATE=2026-08-31 python extraccionDatos.py` y luego `python construir-historico.py` (un solo export de rago, agrupa por día).

## 3) Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase/schema.sql`.
3. Define la política de roles de la app usando un claim JWT `app_role`:
   - `viewer`: solo lectura
   - `editor`: inserción y edición
   - `admin`: gestión completa

Para que el dashboard público lea la vista `transaction_discipline_summary` en vivo, añade una política `select` para `anon` sobre esa vista (o usa el snapshot JSON estático).

## 3b) Looker Studio (PostgreSQL)

`dashboard/publicar-looker.py` publica en PostgreSQL el **resumen no identificable** de los
JSON de `dashboard/data/`, para que Looker Studio consulte el origen directamente en lugar
de leer los ficheros del sitio estático. Lee `snapshot.json`, `historico.json`,
`actividad-usuarios.json`, `usuarios-historico.json`, `top-juegos.json` y
`desglose-tickets.json`; si falta alguno, omite solo esa parte.

**Nunca** publica el detalle de `snapshot.transactions`, ni teléfonos, nombres, correos,
IPs o referencias de transacción. En los rankings el jugador aparece anonimizado a los
últimos cuatro dígitos de su **ID interno** (`Jugador ****5518`), y la posición forma parte
de la clave para que dos jugadores con los mismos cuatro dígitos no se pisen.

### Tablas

Se crean solas con `CREATE TABLE IF NOT EXISTS`, en dos familias:

| Familia | Tablas | Clave y comportamiento |
| --- | --- | --- |
| **Serie de snapshots** | `looker_kpis`, `looker_resumen_modulos`, `looker_matriz`, `looker_dinero_disciplina`, `looker_estados_cliente`, `looker_productos`, `looker_rankings` | Llevan `generado` (el `generated_at` del snapshot) en la clave primaria: cada ejecución deja su propia foto y se ve la evolución en el tiempo. Reejecutar sobre el mismo snapshot no duplica (`ON CONFLICT DO NOTHING`). |
| **Estado por clave natural** | `looker_historico_dia` (por `dia`), `looker_juegos` (por periodo/ranking/posición), `looker_tickets_deporte` y `looker_tickets_estado` (por periodo/deporte) | Se reemplazan con `UPSERT`, igual que hace `construir-historico.py`: la serie diaria queda limpia y la base no crece sin control. |

`looker_rankings.ganado_usd` y `neto_usd` admiten `NULL` porque no todos los orígenes los
calculan; se dejan vacíos en vez de a cero para no falsear los totales en Looker. El neto
va siempre desde la óptica del jugador (negativo cuando pierde).

### Requisitos y uso

`DATABASE_URL` en el entorno y `python -m pip install "psycopg[binary]"`. Si falta
cualquiera de los dos, el publicador no escribe nada y no rompe el resto del flujo (la
imagen anterior sigue funcionando sin esta capa).

```bash
# Bucle: revisa el snapshot cada 30 s y publica solo cuando cambia generated_at
DATABASE_URL=postgresql://usuario:clave@host:5432/base python dashboard/publicar-looker.py

# Una sola pasada (para encadenarlo tras la extracción diaria)
DATABASE_URL=... python dashboard/publicar-looker.py --una-vez

# Sin base: solo muestra cuántas filas se publicarían de cada tabla
python dashboard/publicar-looker.py --simular
```

Pruebas: `python -m pytest test_publicar_looker.py`.

### Conectar Looker Studio paso a paso

Looker Studio se conecta por el **conector nativo de PostgreSQL**, así que sirve
cualquier base accesible desde internet. Si ya usas Supabase en este proyecto, esa misma
base vale y no hace falta contratar nada más.

**1. Consigue la cadena de conexión.** En Supabase: *Project Settings → Database →
Connection string → URI*. Tiene esta forma:

```
postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

**2. Crea las tablas** ejecutando el publicador una vez:

```bash
DATABASE_URL='postgresql://...' python dashboard/publicar-looker.py --una-vez
```

**3. Crea las vistas y el usuario de solo lectura.** Abre `supabase/looker-vistas.sql`,
cambia `CLAVE_LARGA_AQUI` por una contraseña propia y ejecútalo (en Supabase: *SQL
Editor → pegar → Run*). Esto crea las vistas `*_actual` y el rol `looker_lector`, que
**solo puede leer las tablas `looker_*`**: no llega a `transaction_records` ni puede
escribir nada.

**4. Automatiza la actualización.** Guarda la cadena de conexión como secreto
`DATABASE_URL` del repositorio (*Settings → Secrets and variables → Actions*). El
workflow `extraccion-diaria.yml` publicará el resumen en cada ejecución; si el secreto no
existe, ese paso se salta sin romper nada.

**5. Conecta Looker Studio.** En <https://lookerstudio.google.com> → *Crear → Fuente de
datos → PostgreSQL*, y rellena:

| Campo | Valor |
| --- | --- |
| Host | `aws-0-<region>.pooler.supabase.com` (sin `https://` ni el puerto) |
| Port | `5432` |
| Database | `postgres` |
| Username | `looker_lector` |
| Password | la que pusiste en el paso 3 |
| Enable SSL | **activado** |

Luego *Custom query* o *Table*, y elige la vista según el gráfico.

### Qué vista usar en cada gráfico

> ⚠️ **No conectes las tablas `looker_kpis`, `looker_matriz`, `looker_rankings`… en
> crudo.** Guardan una foto por snapshot, así que Looker sumaría todas y los totales
> saldrían multiplicados (con dos snapshots, 418.980 transacciones se convierten en
> 837.960). Usa siempre las vistas `*_actual`.

| Quieres… | Usa |
| --- | --- |
| Tarjetas de KPI (transacciones, ingresos, usuarios) | `looker_cabecera` o `looker_kpis_actual` |
| KPIs agrupados por módulo | `looker_modulos_actual` |
| Tarta o barras online/retail por disciplina | `looker_matriz_actual` |
| Ingresos y resultado por disciplina | `looker_dinero_actual` |
| Top de productos | `looker_productos_actual` |
| Rankings de jugadores (anonimizados) | `looker_rankings_actual` |
| **Serie temporal por día** (transacciones, clientes, ingresos) | `looker_historico_dia` |
| Evolución de un indicador entre snapshots | `looker_kpis_serie` |
| Top de juegos por periodo | `looker_juegos` |
| Tickets por deporte, con estados en columnas | `looker_tickets_actual` |

Las cuatro últimas ya traen una fila por clave natural (día, periodo, deporte), así que se
pueden conectar directamente.

## 4) Publicación automática (GitHub Actions)

### GitHub Pages
El workflow `.github/workflows/deploy-pages.yml` despliega el dashboard en GitHub Pages en cada push a `main`. Deja en el repo estos secretos para activar la lectura de Supabase en el sitio publicado:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Extracción diaria
El workflow `.github/workflows/extraccion-diaria.yml` ejecuta la extracción de lunes a viernes a las 05:30 UTC. Necesita los secretos:

- `BO_USERNAME`
- `BO_PASSWORD`
- `CAUSAL_PRODUCT_ID`
- `START_DATE` / `END_DATE` (opcional; si se omiten usa "hoy")
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

La ejecución genera el CSV, los reportes, sincroniza Supabase y actualiza y commitea `dashboard/data/snapshot.json`; ese commit dispara el despliegue de Pages automáticamente.

## 5) Seguridad

- **Nunca** se suben `.env`, `dashboard/config.js` ni los CSV descargados: están en `.gitignore`.
- Las credenciales del Back Office **ya no** tienen valores por defecto; si faltan, el script falla.
- `SUPABASE_SERVICE_ROLE_KEY` solo en backend/scripts privilegiados; `SUPABASE_ANON_KEY` solo para consultas públicas.
- El snapshot del dashboard (`dashboard/data/snapshot.json`) es un resumen agregado sin datos personales.

> ⚠️ Si en tu historial de git ya hay CSVs o bases descargadas con datos de clientes, elimínalos del historial (p. ej. `git filter-repo` o BFG) y considera rotar las credenciales.

## 6) Estructura

```text
.
├── .env.example
├── extraccionDatos.py
├── extraccion-tickets-deporte.py
├── construir-historico.py
├── test_extraccionDatos.py
├── test_construir_historico.py
├── test_publicar_looker.py
├── dashboard/
│   ├── index.html
│   ├── app.js
│   ├── historico.js
│   ├── tickets-deporte.js
│   ├── config.example.js
│   ├── data/snapshot.json
│   ├── data/historico.json
│   └── publicar-looker.py
├── descargas/             # CSVs descargados (gitignored)
├── reportes/              # reportes generados (gitignored)
├── supabase/schema.sql
├── supabase/looker-vistas.sql
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── extraccion-diaria.yml
└── README.md
```