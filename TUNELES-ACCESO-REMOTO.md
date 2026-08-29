# 🌐 Dashboard en Línea - Acceso Remoto con Túnel

## 📊 Datos Reales (Sin Simulaciones)

El dashboard ahora usa **datos reales** del archivo CSV:
- `transacciones_producto__2026-08-28_2026-08-28.csv`
- **231 usuarios únicos** analizados
- **175 activos** | **56 inactivos** | **11 desconectados**
- **129 Deportes** | **71 Casino**

---

## 🚀 CONFIGURACIÓN RÁPIDA

### Terminal 1: Iniciar Servidor
```bash
npm start
```
✅ Dashboard en: http://localhost:3000

### Terminal 2: Monitorear Datos Reales
```bash
npm run watch-data
```
✅ Monitoreará cambios en CSV y actualizará automáticamente

### Terminal 3: Crear Túnel (Acceso Remoto)
```bash
npm run tunnel
```
o
```bash
ngrok http 3000
```

---

## 🔗 Acceso REMOTO

Cuando ejecutes `npm run tunnel` o `ngrok http 3000`, verás:

```
Session Status                online
Version                       3.0.0
Region                        us (United States)
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://xxxx-xxxx-xxxx.ngrok.io -> http://localhost:3000

Your ngrok URL (COMPARTIR):   https://xxxx-xxxx-xxxx.ngrok.io
```

**COMPARTIR ESTE LINK** para acceso remoto:
```
https://xxxx-xxxx-xxxx.ngrok.io
```

---

## 📋 Opciones de Ejecución

### Opción 1: Solo Dashboard Local
```bash
npm start
```
- Acceso: http://localhost:3000

### Opción 2: Dashboard + Datos Reales
```bash
npm start      # Terminal 1
npm run watch-data  # Terminal 2
```

### Opción 3: Dashboard + Datos Reales + Túnel (RECOMENDADO)
```bash
npm start           # Terminal 1
npm run watch-data  # Terminal 2
npm run tunnel      # Terminal 3
```

---

## 📊 Datos Reales en Tiempo Real

### Cargar datos manualmente
```bash
npm run load-data
```

Esto:
- Lee el archivo CSV
- Analiza 231 transacciones de usuarios
- Genera `clientes-resumen.json`
- Genera `resumen-campos.json`

### Monitorear cambios automáticos
```bash
npm run watch-data
```

Esto:
- Monitorea cada 10 segundos
- Si el CSV cambió, recarga datos
- Actualiza automáticamente el dashboard

---

## 🔗 URLs de Acceso

| Tipo | URL |
|------|-----|
| **Local** | http://localhost:3000 |
| **Local + WebSocket** | http://localhost:3000/index-realtime.html |
| **API Resumen** | http://localhost:3000/api/resumen |
| **API Campos** | http://localhost:3000/api/campos |
| **Remoto (Túnel)** | https://xxxx-xxxx-xxxx.ngrok.io |
| **Remoto + WebSocket** | https://xxxx-xxxx-xxxx.ngrok.io/index-realtime.html |

---

## 🛠️ Estructura Actual

```
dashboard-Genius/
├── server.js              # Express + WebSocket (datos reales)
├── load-real-data.js      # Procesar CSV → JSON
├── watch-real-data.js     # Monitorear CSV para cambios
├── dashboard/
│   ├── index.html         # Dashboard estático
│   └── index-realtime.html # Dashboard con WebSocket
├── descargas/
│   └── transacciones_producto__2026-08-28_2026-08-28.csv
└── reportes/
    ├── clientes-resumen.json
    └── resumen-campos.json
```

---

## 📈 Ejemplo de Datos Reales

```json
{
  "totals": {
    "activo": 175,
    "inactivo": 56,
    "desconectado": 11,
    "suspendido": 4,
    "otros": 2
  },
  "generated_at": "2026-08-29 15:27 UTC",
  "status_by_discipline": {
    "deportes": {
      "activo": 113,
      "inactivo": 33,
      "desconectado": 7,
      "suspendido": 2,
      "otros": 1
    },
    "casino": {
      "activo": 61,
      "inactivo": 22,
      "desconectado": 3,
      "suspendido": 1,
      "otros": 0
    }
  }
}
```

---

## 🔐 Seguridad con Túnel

### Proteger el acceso
```bash
ngrok http 3000 --basic-auth="user:password"
```

### Ver conexiones
```bash
http://127.0.0.1:4040
```
- Monitorea todas las conexiones
- Ver peticiones HTTP
- Inspeccionar WebSocket

---

## 🆘 Solución de Problemas

### ngrok no conecta
```bash
npm install -g ngrok  # Reinstalar
ngrok config add-authtoken <TOKEN>  # Autenticar
```

### Puerto 3000 ocupado
```bash
lsof -i :3000
kill -9 <PID>
```

### CSV no se actualiza
```bash
npm run load-data  # Cargar manualmente
```

### WebSocket no conecta en túnel
- Ngrok soporta WebSocket nativamente
- Verificar firewall
- Revisar DevTools (F12)

---

## 📱 Acceso desde Celular/Tablet

1. Ejecuta túnel: `npm run tunnel`
2. Copia URL: `https://xxxx-xxxx-xxxx.ngrok.io`
3. Abre en navegador del celular
4. ¡Listo! Dashboard en tiempo real desde cualquier dispositivo

---

## 🎯 Resumen Rápido

```bash
# Terminal 1
npm start

# Terminal 2
npm run watch-data

# Terminal 3
npm run tunnel

# Navegador
https://xxxx-xxxx-xxxx.ngrok.io
```

✅ Dashboard en línea
✅ Datos reales del CSV
✅ Monitoreo automático
✅ Acceso remoto seguro
✅ WebSocket en tiempo real

---

**Rama**: `claude/estructura-estudio-kozee8`
**Estado**: ✅ Production Ready
**Datos**: ✅ Reales (CSV)
**Túnel**: ✅ ngrok
