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

## 2c) Graphify · Apache ECharts

Gráficos interactivos con **Graphify** (integración de Apache ECharts):

- **Módulo:** `dashboard/graphify.js` — API de gráficos (barras, pastel, líneas, radar, dispersión).
- **Integración automática:**
  - `dashboard/app-graphify.js` — Convierte gráficos de **Operaciones** (disciplinas, conexiones, matriz, productos, estados).
  - `dashboard/sections-graphify.js` — Convierte gráficos de **Tickets Deportivos** y **Casino PERP**.
- **Características:** Interactivo (hover, zoom, leyenda clickeable), responsivo, tema oscuro automático.
- **Documentación:** 
  - `dashboard/GRAPHIFY.md` — API completa con ejemplos.
  - `dashboard/GRAPHIFY-INTEGRATION.md` — Cómo funciona la integración.

Para ver demo sin servidor: `dashboard/standalone.html` (ECharts offline).

## 3) Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase/schema.sql`.
3. Define la política de roles de la app usando un claim JWT `app_role`:
   - `viewer`: solo lectura
   - `editor`: inserción y edición
   - `admin`: gestión completa

Para que el dashboard público lea la vista `transaction_discipline_summary` en vivo, añade una política `select` para `anon` sobre esa vista (o usa el snapshot JSON estático).

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
├── test_extraccionDatos.py
├── dashboard/
│   ├── index.html
│   ├── app.js
│   ├── config.example.js
│   ├── data/snapshot.json
├── descargas/             # CSVs descargados (gitignored)
├── reportes/              # reportes generados (gitignored)
├── supabase/schema.sql
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── extraccion-diaria.yml
└── README.md
```