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

## 2d) Desembolsos (retiros) en Excel — en tiempo real

Sección para el equipo de riesgos/finanzas: exporta a **Excel** únicamente las
**solicitudes de desembolso (retiros)** del módulo de transacciones, con cada
dato del movimiento **enriquecido con la ficha del cliente** mapeada desde
`dashboard/data/usuarios-historico.json` (y `actividad-usuarios.json`).

> ⚠️ Nomenclatura del Back Office: la columna `Tipo de transacción` usa
> `Withdraw`/`Deposit` también para el flujo de casino (apuesta/ganancia). Por
> eso un **retiro real** se detecta por el *producto de caja* (Payments, Banco,
> …) o por términos explícitos de retiro en grupo/causal, **no** por el
> `Withdraw` del casino.

- **Script:** `exportar-desembolsos.py` — lee el CSV más reciente de
  `descargas/` (o el que se le pase), filtra los desembolsos, los enriquece y
  genera `reportes/desembolsos.xlsx` con 3 hojas: **Desembolsos** (detalle,
  una fila por solicitud + datos del cliente), **Por usuario** (agregado) y
  **Resumen** (KPIs por canal, estado y producto).

```bash
python exportar-desembolsos.py                     # CSV más reciente de descargas/
python exportar-desembolsos.py ruta/al.csv         # un CSV concreto
python exportar-desembolsos.py -o reportes/retiros.xlsx
python exportar-desembolsos.py --modo amplio       # + términos de retiro en cualquier producto
python exportar-desembolsos.py --watch             # tiempo real: regenera cuando cambia el CSV
python exportar-desembolsos.py --watch --intervalo 15
```

  - `--modo pagos` (defecto): sólo retiros de caja (el desembolso real).
  - `--modo amplio`: además, cualquier fila con términos de retiro (retiro,
    payout, cashout, reintegro, desembolso…) en grupo/causal/descripción.
  - `--modo withdraw`: todo `Withdraw` en crudo (incluye apuestas; diagnóstico).
  - Variables `DESEMBOLSO_PRODUCTOS` y `DESEMBOLSO_TERMINOS` (coma-separadas)
    amplían la detección sin tocar el código.

- **En vivo desde el navegador (visor):** tanto `visor_actual.py` (el que abre
  `abrir_visor_transacciones.bat`) como `visor_transacciones.py` exponen
  `/api/desembolsos` (vista previa JSON con conteo y monto total) y
  `/api/desembolsos.xlsx` (descarga del Excel al vuelo, respetando los filtros
  de búsqueda/fecha de la interfaz). El botón **«Desembolsos (Excel)»** del
  visor descarga el archivo con nombre `desembolsos_AAAAMMDD_HHMM.xlsx`.
  Con el visor en marcha, el enlace de descarga en tiempo real es
  `http://127.0.0.1:8765/api/desembolsos.xlsx` (puerto configurable con
  `VISOR_PORT`).

- **Dependencia:** requiere `openpyxl` (`python -m pip install openpyxl`).
- El Excel contiene datos personales; `reportes/*.xlsx` está en `.gitignore` y
  **no** debe subirse al repositorio.

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
├── extraccion-tickets-deporte.py
├── construir-historico.py
├── exportar-desembolsos.py       # Excel de retiros/desembolsos + ficha de cliente
├── visor_transacciones.py        # visor local con /api/desembolsos(.xlsx)
├── test_extraccionDatos.py
├── test_construir_historico.py
├── test_exportar_desembolsos.py
├── dashboard/
│   ├── index.html
│   ├── app.js
│   ├── historico.js
│   ├── tickets-deporte.js
│   ├── config.example.js
│   ├── data/snapshot.json
│   ├── data/historico.json
├── descargas/             # CSVs descargados (gitignored)
├── reportes/              # reportes generados (gitignored)
├── supabase/schema.sql
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── extraccion-diaria.yml
└── README.md
```