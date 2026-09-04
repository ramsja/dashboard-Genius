# 🚀 Cómo ver Graphify en acción

## ✅ El servidor ya está corriendo

El servidor HTTP está en marcha en el puerto **8000**.

## 🌐 Abrir el dashboard

### Opción 1: En tu navegador

Abre esta URL en tu navegador:

```
http://localhost:8000/dashboard/
```

**Dirección completa:**
```
http://127.0.0.1:8000/dashboard/index.html
```

## 📊 Qué verás

### Gráficos Graphify/ECharts

Una vez que la página cargue, verás los gráficos mejorados con Graphify:

1. **Sección Operaciones** (arriba)
   - 📊 **Transacciones por disciplina** → Barras horizontales interactivas
   - 🥧 **Conexión de clientes** → Donut chart
   - 📈 **Disciplina × Conexión** → Barras por tipo
   - 📦 **Productos principales** → Top 8 productos
   - 👥 **Resumen por estado** → Estados de clientes

2. **Sección Tickets Deportivos** (si hay datos)
   - 🏆 **Tickets deportivos por disciplina** → Gráfico de top 12 deportes

3. **Sección Casino PERP** (si hay datos)
   - 🎰 **Casino por proveedor/juego** → Gráfico de top 12 proveedores

## 🔍 Verificar que Graphify funciona

### Paso 1: Abre la consola del navegador

1. Presiona `F12` (o `Ctrl+Shift+I` en Windows/Linux, `Cmd+Option+I` en Mac)
2. Ve a la pestaña **Console**

### Paso 2: Busca estos mensajes

Deberías ver:
```
✓ Graphify (Apache ECharts) cargado
✓ app-graphify.js cargado
✓ sections-graphify.js cargado
```

### Paso 3: Verifica disponibilidad de Graphify

En la consola, escribe:
```javascript
Graphify
```

Deberías ver un objeto con todas las funciones disponibles.

## 🎮 Interactúa con los gráficos

### Hover
Pasa el mouse sobre los gráficos para ver detalles:
- **Barras:** Muestra valor exacto
- **Donut:** Muestra porcentaje y nombre
- **Líneas:** Muestra valores de todas las series

### Zoom y Pan
- **Scroll:** Zoom in/out
- **Arrastrar:** Mueve el gráfico

### Leyenda
- **Click en leyenda:** Muestra/oculta series
- **Click en barra:** Resalta datos relacionados

### Menú de opciones
En la esquina superior derecha de cada gráfico hay un menú (⋮) con:
- Descargar como PNG
- Ver en modo pantalla completa
- Restaurar zoom

## 🧪 Testing manual en consola

Prueba comandos en la consola (F12):

```javascript
// Ver si ECharts está disponible
typeof echarts

// Ver API de Graphify
Graphify.THEME_COLORS

// Crear un gráfico de prueba
const testContainer = document.createElement('div');
testContainer.id = 'test-chart';
testContainer.style.height = '300px';
document.body.appendChild(testContainer);

Graphify.barChartDiscipline('test-chart', {
  labels: ['Casino', 'Deportes', 'Otros'],
  values: [1240, 856, 320]
});

// Forzar re-renderizado de gráficos
GraphifyApp.renderGraphifyCharts();

// Convertir gráficos de tickets
SectionsGraphify.convertTicketsBarsToGraphify();
```

## 📋 Datos de prueba

El dashboard carga datos de:

```
/dashboard/data/snapshot.json
```

Si este archivo no existe o está vacío, verás "Cargando datos..." indefinidamente.

**Para generar datos de prueba:**

```bash
# Ejecutar extracción (requiere credenciales en .env)
python extraccionDatos.py

# O copiar un snapshot de ejemplo
cp dashboard/data/snapshot.json.example dashboard/data/snapshot.json
```

## 🐛 Troubleshooting

### "ECharts no está disponible"

1. Verifica que ECharts CDN está accesible:
   ```javascript
   typeof echarts // Debería ser "object"
   ```

2. Si no funciona, comprueba:
   - Conexión a internet
   - El navegador permite CDNs
   - No hay problemas de CORS

### "Los gráficos no se convierten"

1. Verifica que `app-graphify.js` se cargó:
   ```javascript
   typeof GraphifyApp // Debería ser "object"
   ```

2. Fuerza manualmente:
   ```javascript
   GraphifyApp.renderGraphifyCharts();
   ```

3. Revisa la consola para errores (F12 → Console)

### "Veo gráficos SVG antiguos"

Significa que Graphify no se ejecutó. Verifica:
```javascript
console.log(typeof Graphify); // Debería ser "object"
```

## 📱 Responsive

Prueba en diferentes tamaños:
- Abre DevTools (F12)
- Haz clic en el icono de dispositivo (celular)
- Prueba diferentes tamaños: Móvil, Tablet, Desktop

Los gráficos se adaptan automáticamente.

## 📊 Próximos pasos

Después de ver que todo funciona:

1. **Generar datos reales:**
   ```bash
   python extraccionDatos.py
   ```

2. **Desplegar a GitHub Pages:**
   ```bash
   git push origin main
   ```

3. **Monitorear en vivo:**
   Ejecutar el workflow de extracción diaria

## 🔗 URLs útiles

| Sección | URL |
|---------|-----|
| Dashboard | http://localhost:8000/dashboard/ |
| Datos | http://localhost:8000/dashboard/data/ |
| API Graphify | Integrada en `graphify.js` |
| Documentación | [GRAPHIFY.md](./dashboard/GRAPHIFY.md) |
| Integración | [GRAPHIFY-INTEGRATION.md](./dashboard/GRAPHIFY-INTEGRATION.md) |

## 💾 Estado del servidor

**Puerto:** 8000  
**Ubicación:** http://localhost:8000/  
**PID:** (verificar con `lsof -i :8000`)

Para detener el servidor:
```bash
lsof -ti:8000 | xargs kill -9
```

---

¡Disfruta explorando Graphify en tu dashboard! 🎉
