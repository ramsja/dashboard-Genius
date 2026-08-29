# 🎯 Sincronizar Datos Reales de Novusbet

## Configuración

### Paso 1: Agregar Credenciales al `.env.local`

Abre `.env.local` y añade (o actualiza) estas líneas:

```env
# Novusbet Credentials
BO_USERNAME=FinanceSV
BO_PASSWORD=Anma07covi*

# Supabase (ya debe estar configurado)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here
```

**⚠️ IMPORTANTE:** Después de ejecutar el script, CAMBIA la contraseña de Novusbet en https://headoffice.novusbet.com

## Uso

### Opción A: Ejecutar Localmente (Desarrollo)

```bash
node sync-novusbet.js
```

Esto:
- ✅ Descarga transacciones de HOY desde Novusbet
- ✅ Procesa y limpia los datos
- ✅ Carga en tabla `transacciones_novusbet` en Supabase
- ✅ Dashboard se actualiza automáticamente

### Opción B: Ejecutar en Render (Automático)

En https://dashboard.render.com → tu proyecto → Environment:

1. Agrega variables si aún no existen:
   - `BO_USERNAME=FinanceSV`
   - `BO_PASSWORD=Anma07covi*`

2. En Terminal de Render:
```bash
node sync-novusbet.js
```

O agrega al `Procfile` para ejecutar automáticamente cada vez:
```
web: node sync-novusbet.js && node server-db.js
```

## Qué Hace el Script

```
1. 🔐 Login en headoffice.novusbet.com
2. 📥 Descarga transacciones del día actual
3. 📊 Procesa CSV y clasifica por disciplina
4. 📤 Carga en Supabase tabla transacciones_novusbet
5. 🔄 Dashboard se actualiza en tiempo real
```

## Datos Capturados

```sql
CREATE TABLE transacciones_novusbet (
  id BIGINT PRIMARY KEY,
  usuario TEXT,              -- Nombre del usuario
  tipo_transaccion TEXT,     -- Depósito, retiro, apuesta, ganancia
  monto NUMERIC,             -- Cantidad
  disciplina TEXT,           -- 'deportes', 'casino', 'otros'
  descripcion TEXT,          -- Detalles de la transacción
  fecha TIMESTAMPTZ,         -- Hora de la transacción
  datos_raw JSONB,           -- Datos originales del CSV
  created_at TIMESTAMPTZ     -- Cuándo se importó
);
```

## API Disponible en Dashboard

Después de ejecutar, estos endpoints devuelven datos de Novusbet:

```
GET /api/transacciones-novusbet
  Devuelve todas las transacciones importadas

GET /api/transacciones/disciplina/:disciplina
  Filtrar por 'deportes', 'casino', u 'otros'

GET /api/transacciones/usuario/:usuario
  Transacciones de un usuario específico
```

## Programación Automática

Para que se sincronice automáticamente cada día a las 8 AM:

### En Render:

1. Ve a proyecto → Environment
2. Busca "Cron" o "Scheduled Tasks"
3. Configura:
   - **Time:** 08:00 UTC
   - **Command:** `node sync-novusbet.js`

O usa un servicio externo como:
- **EasyCron** (free): https://www.easycron.com/
- **GitHub Actions** (free)

## Troubleshooting

### "Error: Login failed"
- Verifica usuario/contraseña en .env.local
- Confirma que la cuenta no está bloqueada

### "No scrollId received"
- Suele ser timeout o cambio en estructura HTML de Novusbet
- Revisa si el sitio web cambió

### "Permission denied" en Supabase
- Verifica que SUPABASE_SERVICE_KEY sea correcto
- No uses SUPABASE_ANON_KEY (necesita SERVICE_KEY)

### No aparece en el dashboard
- Ejecuta: `curl https://dashboard-genius.onrender.com/api/transacciones-novusbet`
- Verifica en Supabase SQL Editor que la tabla `transacciones_novusbet` existe

## Seguridad

1. **Cambiar contraseña después** de ejecutar el script
2. **No subir .env.local** a GitHub (ya está en .gitignore)
3. **Rotar SERVICE_KEY** regularmente en Supabase
4. **Limitar acceso** a la tabla con Row Level Security (RLS)

## Dashboard

Los datos apareceran en: https://dashboard-genius.onrender.com

Con:
- 📊 Tabla de transacciones en tiempo real
- 📈 Gráficos por disciplina y usuario
- 📥 Descarga CSV con todos los registros
- 🔄 Auto-refresh cada 30 segundos
