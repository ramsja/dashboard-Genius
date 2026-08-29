# Dashboard en Tiempo Real - Guía de Instalación y Uso

## 📋 Requisitos

- Node.js v14+ 
- npm o yarn

## 🚀 Instalación

### 1. Instalar dependencias

```bash
npm install
```

Esto instalará:
- `express` - Servidor web
- `ws` - WebSocket para actualizaciones en tiempo real

## 🎯 Ejecutar el Dashboard

### Opción 1: Solo el servidor (sin simulación)

```bash
npm start
```

El dashboard estará disponible en: **http://localhost:3000**

### Opción 2: Con simulación de datos en tiempo real

En **terminal 1**:
```bash
npm start
```

En **terminal 2** (en la misma carpeta):
```bash
npm run simulate
```

Esto actualizará automáticamente los datos cada 5 segundos para ver las actualizaciones en tiempo real.

### Opción 3: Ejecutar ambos con un comando (en sistemas Unix/Linux)

```bash
npm run dev:full
```

## 📊 Características

✅ **Dashboard en línea** - Accesible desde cualquier navegador
✅ **Actualizaciones en tiempo real** - Usa WebSocket para push instantáneo
✅ **Indicador de conexión** - Muestra estado de conexión en tiempo real
✅ **Animaciones suaves** - Transiciones visuales al actualizar datos
✅ **Responsive** - Funciona en desktop y móvil

## 🔄 URLs

- **Dashboard principal**: http://localhost:3000
- **Dashboard con tiempo real**: http://localhost:3000/index-realtime.html
- **API Resumen**: http://localhost:3000/api/resumen (JSON)
- **API Campos**: http://localhost:3000/api/campos (JSON)

## 📝 Archivos principales

- `server.js` - Servidor Express + WebSocket
- `simulate-updates.js` - Script para simular cambios de datos
- `dashboard/index-realtime.html` - Dashboard con WebSocket
- `reportes/clientes-resumen.json` - Datos de clientes
- `reportes/resumen-campos.json` - Datos de disciplinas

## 🔧 Personalización

### Cambiar puerto

```bash
PORT=8080 npm start
```

### Cambiar velocidad de simulación

En `simulate-updates.js`, cambiar:
```javascript
const interval = setInterval(updateData, 5000); // Cambiar 5000 (ms)
```

## 🛠️ Solución de problemas

**Puerto 3000 ya en uso:**
```bash
lsof -i :3000  # Ver qué usa el puerto
kill -9 <PID>  # Matar proceso
```

**WebSocket no se conecta:**
- Verificar que el navegador soporta WebSocket
- Verificar firewall
- Revisar consola del navegador (F12)

## 📚 Estructura de datos

### clientes-resumen.json
```json
{
  "totals": {
    "activo": 245,
    "inactivo": 87,
    "desconectado": 34,
    "suspendido": 12,
    "otros": 5
  },
  "generated_at": "2026-08-29 16:28 UTC",
  "status_by_discipline": { ... }
}
```

### resumen-campos.json
```json
{
  "disciplines": {
    "deportes": 229,
    "casino": 154
  },
  "metadata": { ... }
}
```
