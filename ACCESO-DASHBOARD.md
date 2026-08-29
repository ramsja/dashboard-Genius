# 🎯 Dashboard en Línea - ACCESO EN VIVO

## ✅ Estado: SERVIDOR ACTIVO

El dashboard está **corriendo en tiempo real** en tu máquina local.

## 🌐 Acceso

### Dashboard Principal
🔗 **http://localhost:3000**

### Dashboard con Tiempo Real (Recomendado)
🔗 **http://localhost:3000/index-realtime.html**

## 📊 APIs Disponibles

- **Resumen Clientes**: http://localhost:3000/api/resumen
- **Campos/Disciplinas**: http://localhost:3000/api/campos

## 🚀 Inicio Rápido

### 1️⃣ Terminal 1: Iniciar Servidor
```bash
npm start
```
✅ Escucha en puerto 3000
✅ WebSocket activo
✅ Monitoreo de archivos JSON

### 2️⃣ Terminal 2: Simular Actualizaciones (Opcional)
```bash
npm run simulate
```
✅ Actualiza datos cada 5 segundos
✅ Cambios reflejados en tiempo real
✅ Animaciones visuales

## 📈 Datos Actuales

```json
{
  "activos": 245,
  "inactivos": 87,
  "desconectados": 34,
  "suspendidos": 12,
  "otros": 5
}

Disciplinas:
- Deportes: 229 clientes
- Casino: 154 clientes
```

## 🔄 Cómo Funciona

1. **Express Server** (`server.js`)
   - Sirve archivos estáticos (HTML, CSS, JS)
   - APIs REST para datos
   - Monitorea cambios en JSON

2. **WebSocket** 
   - Conexión bidireccional
   - Push instantáneo de cambios
   - Reconexión automática

3. **Simulación** (`simulate-updates.js`)
   - Modifica JSON cada 5 seg
   - Cambios de ±5%
   - Servidor detecta y broadcast

4. **Dashboard** (`index-realtime.html`)
   - Conexión WebSocket automática
   - Animaciones al actualizar
   - Indicador de conexión en vivo

## 🛠️ Personalización

### Cambiar Puerto
```bash
PORT=8080 npm start
```

### Cambiar Intervalo de Actualización
Editar `simulate-updates.js`:
```javascript
const interval = setInterval(updateData, 5000); // ms
```

### Agregar Más Disciplinas
Editar `reportes/resumen-campos.json`:
```json
{
  "disciplines": {
    "deportes": 229,
    "casino": 154,
    "tragamonedas": 100  // Nueva
  }
}
```

## 📝 Archivos Clave

```
dashboard-Genius/
├── server.js                 # Servidor Express + WebSocket
├── simulate-updates.js       # Simulación de datos
├── package.json             # Dependencias
├── dashboard/
│   ├── index.html           # Dashboard estático
│   └── index-realtime.html  # Dashboard con WebSocket
├── reportes/
│   ├── clientes-resumen.json    # Datos principales
│   └── resumen-campos.json      # Disciplinas
└── DASHBOARD-SETUP.md       # Guía completa
```

## 🔍 Monitoreo

### Ver Logs del Servidor
```bash
# En la misma terminal que npm start
```

### Ver Conexiones WebSocket
- Abrir DevTools (F12) en el navegador
- Console → Ver mensajes de conexión

### Ver Cambios de Datos
```bash
# En terminal 3, monitorear cambios
tail -f reportes/clientes-resumen.json
```

## 🆘 Solución de Problemas

### Puerto ocupado
```bash
lsof -i :3000  # Ver proceso
kill -9 <PID>  # Matar
```

### No se conecta WebSocket
- Verificar consola del navegador (F12)
- Verificar firewall
- Usar `index-realtime.html` no `index.html`

### Datos no se actualizan
- Verificar que `npm run simulate` está corriendo
- Revisar permisos en carpeta `reportes/`

## 📱 Acceso Remoto

Para acceder desde otra máquina en la red local:
```
http://<tu-ip-local>:3000
```

Obtén tu IP:
```bash
hostname -I  # Linux
ipconfig     # Windows
ifconfig     # Mac
```

## 🎉 ¡Listo!

El dashboard está **100% funcional** y **actualizado en tiempo real**. 

Abre el navegador y ve cómo los datos se actualizan automáticamente mientras corriges la simulación en otra terminal.

---

**Rama**: `claude/estructura-estudio-kozee8`
**Estado**: ✅ Producción
**Última actualización**: 2026-08-29
