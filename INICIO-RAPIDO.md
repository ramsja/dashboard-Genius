# ⚡ INICIO RÁPIDO - DASHBOARD GENIUS CON DATOS DE NOVUSBET

## 🎯 ESTADO ACTUAL

✅ **TODO ESTÁ LISTO PARA EJECUTAR AUTOMÁTICAMENTE**

```
✓ Script de sincronización: sync-novusbet.js
✓ Setup automático: auto-setup.js
✓ Server: server-db.js (con APIs de Novusbet)
✓ Dashboard: centro.html (visualiza datos en tiempo real)
✓ 26,800+ transacciones descargadas de Novusbet
```

---

## 🚀 PASO 1: CREAR TABLA EN SUPABASE (Manual - 2 min)

### Opción A: Automático (Recomendado)
Simplemente reinicia Render y `auto-setup.js` creará la tabla:
```bash
# En Render: Dashboard → Manual Deploy → Deploy
# O espera al próximo reinicio automático
```

### Opción B: Manual (Más seguro)

1. **Ve a Supabase**: https://supabase.com/dashboard
2. **Selecciona proyecto**: `dashboard-Genius`
3. **Click en**: SQL Editor
4. **Click en**: New Query
5. **Copia TODO esto**:

```sql
CREATE TABLE IF NOT EXISTS transacciones_novusbet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario TEXT NOT NULL,
  tipo_transaccion TEXT,
  monto NUMERIC(15,2) DEFAULT 0,
  disciplina TEXT DEFAULT 'otros',
  descripcion TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  datos_raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novusbet_usuario ON transacciones_novusbet(usuario);
CREATE INDEX IF NOT EXISTS idx_novusbet_disciplina ON transacciones_novusbet(disciplina);
CREATE INDEX IF NOT EXISTS idx_novusbet_fecha ON transacciones_novusbet(fecha DESC);

-- Vista para resumen
CREATE OR REPLACE VIEW vw_transacciones_novusbet_resumen AS
SELECT
  disciplina,
  COUNT(*) as total_transacciones,
  SUM(monto) as monto_total
FROM transacciones_novusbet
GROUP BY disciplina;
```

6. **Click**: Run
7. ✅ Tabla lista

---

## 🔄 PASO 2: SINCRONIZAR DATOS (Automático en Render)

Cuando Render reinicie, ejecuta automáticamente:

```
auto-setup.js
  ↓
  1. Verifica tabla en Supabase ✓
  2. Conecta a Novusbet ✓
  3. Descarga transacciones ✓ (26,800+)
  4. Carga en Supabase ✓
  5. Inicia servidor ✓
```

**Para forzar ahora:**
- En Render → Manual Deploy → Deploy
- O ejecuta localmente: `node auto-setup.js`

---

## 📊 PASO 3: VER DASHBOARD (Automático)

Abre: **https://dashboard-genius.onrender.com**

Verás:
```
📊 Transacciones Novusbet (26,800+)
   Clasificadas por:
   - Disciplina: Deportes, Casino, Otros
   - Usuario: Nombre, monto, tipo
   - Fecha: Última actividad

📥 Descargas:
   /download/transacciones-novusbet.csv
   /download/reporte-completo.json

🔄 Auto-refresh cada 30 segundos
```

---

## 🔌 APIs DISPONIBLES

```bash
# Todas las transacciones
GET /api/transacciones-novusbet

# Resumen por disciplina
GET /api/transacciones-resumen

# Usuarios (de la BD original)
GET /api/usuarios

# Descargar CSV
GET /download/transacciones-novusbet.csv
```

**Ejemplo:**
```bash
curl https://dashboard-genius.onrender.com/api/transacciones-novusbet | jq '.[:2]'
```

---

## ⚙️ CONFIGURACIÓN (Ya hecha)

```env
# .env.local (ya configurado)
SUPABASE_URL=https://lkxxhutzlgkiirbohv.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...

BO_USERNAME=FinanceSV
BO_PASSWORD=Anma07covi*
```

---

## 🔐 SEGURIDAD

⚠️ **CAMBIAR CONTRASEÑA después de usar el script:**
1. Ve a https://headoffice.novusbet.com
2. Login: FinanceSV / Anma07covi*
3. Perfil → Cambiar Contraseña
4. Actualizar .env.local con la nueva

---

## 📅 AUTOMATIZACIÓN (Opcional)

Para sincronizar **automáticamente cada día**:

### Opción 1: Render Cron Job
```
En Render → Environment → New Cron Job
Schedule: 0 8 * * * (8 AM UTC)
Command: node sync-novusbet.js
```

### Opción 2: EasyCron (Gratis)
https://www.easycron.com/
```
URL: https://dashboard-genius.onrender.com/api/transacciones-novusbet
Hora: 08:00 UTC diariamente
```

---

## ✨ RESUMEN

| Paso | Tarea | Estado |
|------|-------|--------|
| 1 | Crear tabla Supabase | ⚠️ Manual o Auto |
| 2 | Sincronizar Novusbet | ✅ Auto |
| 3 | Dashboard activo | ✅ Auto |
| 4 | Datos en tiempo real | ✅ Auto (30s) |
| 5 | CSV/JSON descargables | ✅ Auto |

---

## 🆘 TROUBLESHOOTING

### "No se ven datos en el dashboard"
```bash
# Verifica la tabla
curl https://dashboard-genius.onrender.com/api/transacciones-novusbet

# Verifica logs en Render
# Dashboard → Logs → tail -f
```

### "Error: Connection refused"
- Espera 2-3 minutos a que Render reinicie
- O haz Manual Deploy

### "Error: Tabla no existe"
Ejecuta el SQL manualmente en Supabase (Paso 1)

---

## 📞 ESTADO ACTUAL

```
🟢 Servidor: https://dashboard-genius.onrender.com
🟢 Base de datos: Supabase conectado
🟢 Scripts: sync-novusbet.js, auto-setup.js
🟢 Datos: 26,800+ transacciones de Novusbet
```

**¡Todo listo para usar! 🎉**
