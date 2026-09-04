# Integración de Graphify en Dashboard

## 📊 Descripción

La integración de Graphify reemplaza automáticamente los gráficos SVG/HTML con visualizaciones mejoradas usando **Apache ECharts**. Los gráficos son interactivos, responsivos y se adaptan automáticamente al tema oscuro del dashboard.

## 🚀 Cómo funciona

### Carga de scripts

```html
<!-- En index.html se cargan en este orden: -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js"></script>
<script src="./graphify.js"></script>        <!-- Módulo principal -->
<script src="./app.js"></script>             <!-- Dashboard principal -->
<script src="./app-graphify.js"></script>    <!-- Integración (operaciones) -->
<script src="./tickets-deporte.js"></script> <!-- Tickets deportivos -->
<script src="./perp-casino.js"></script>     <!-- Casino PERP -->
<script src="./sections-graphify.js"></script> <!-- Integración (secciones) -->
```

### Proceso de integración

1. **Graphify.js** carga Apache ECharts y proporciona la API
2. **App.js** renderiza el dashboard con gráficos HTML/SVG
3. **App-graphify.js** observa cambios y reemplaza gráficos con ECharts
4. **tickets-deporte.js** y **perp-casino.js** renderizan sus datos
5. **sections-graphify.js** convierte estos gráficos a ECharts

## 📈 Gráficos integrados

### Sección Operaciones (app-graphify.js)

| Gráfico | Original | Con Graphify |
|---------|----------|--------------|
| Disciplinas | Barras HTML | Barras horizontales ECharts |
| Conexiones | SVG donut | Donut interactivo ECharts |
| Matriz | Barras HTML | Barras horizontales ECharts |
| Productos | Barras HTML | Barras horizontales ECharts |
| Estados | Barras HTML | Barras horizontales ECharts |

**Ubicación:** `#chartDiscipline`, `#chartConnection`, `#chartMatrix`, `#chartProducts`, `#chartStatus`

### Sección Tickets Deportivos (sections-graphify.js)

| Elemento | Original | Con Graphify |
|----------|----------|--------------|
| Top 12 deportes | Barras HTML | Barras horizontales ECharts |

**Ubicación:** `#tkBarras`

**Características:**
- Se actualiza automáticamente al cambiar periodo
- Muestra porcentajes y conteos de tickets
- Interactivo: hover para ver detalles

### Sección Casino PERP (sections-graphify.js)

| Elemento | Original | Con Graphify |
|----------|----------|--------------|
| Top 12 proveedores | Barras HTML | Barras horizontales ECharts |

**Ubicación:** `#pcBarras`

**Características:**
- Se actualiza automáticamente al cambiar periodo
- Muestra porcentajes de rondas
- Interactivo: hover para ver detalles

## 🎨 Tema y colores

Graphify usa automáticamente los colores CSS del dashboard:

```javascript
Graphify.THEME_COLORS = {
  online: '#30c48d',        // Verde (Online)
  retail: '#f5b942',        // Ámbar (Retail)
  desconocido: '#a7b9d8',   // Gris (Desconocido)
  casino: '#a78bfa',        // Púrpura (Casino)
  deportes: '#60a5fa',      // Azul (Deportes)
  activo: '#30c48d',        // Verde (Activo)
  desconectado: '#f87171',  // Rojo (Desconectado)
  suspendido: '#60a5fa',    // Azul (Suspendido)
  bg: '#0b1020',            // Fondo
  panel: '#161d2f',         // Panel
  line: '#2e3d5e',          // Líneas
  text: '#edf3ff',          // Texto
  muted: '#a7b9d8',         // Texto atenuado
};
```

## 🔄 Cómo funciona el reemplazo automático

### MutationObserver

Los módulos de integración (`app-graphify.js` y `sections-graphify.js`) usan `MutationObserver` para:

1. Detectar cuándo los datos se renderizan en el DOM
2. Extraer datos de los gráficos HTML/SVG existentes
3. Crear un contenedor `<div>` con ECharts
4. Renderizar el gráfico mejorado

### Proceso paso a paso

```javascript
// 1. Observador espera cambios en #kpis (indicador de datos cargados)
observer.observe(kpis, { childList: true });

// 2. Cuando cambian, convierte los gráficos
// 3. Extrae datos del HTML
const labels = [...el.querySelectorAll('.lbl')].map(l => l.textContent);
const values = [...el.querySelectorAll('.bar-num')].map(n => parseFloat(n.textContent));

// 4. Renderiza con Graphify
Graphify.barChartDiscipline('containerID', { labels, values });
```

## 🛠️ Troubleshooting

### "Graphify no está cargado"

Verifica en la consola del navegador (`F12`):

```javascript
// Debería mostrar:
✓ Graphify (Apache ECharts) cargado
✓ app-graphify.js cargado
✓ sections-graphify.js cargado
```

### Los gráficos no se convierten

1. Espera a que los datos se carguen (verifica `#kpis`)
2. Abre la consola (`F12`)
3. Ejecuta manualmente:
   ```javascript
   GraphifyApp.renderGraphifyCharts();
   ```

### ECharts no se ve

Verifica que ECharts esté disponible:

```javascript
typeof echarts; // Debería devolver "object"
Graphify.createChart('test-container'); // Debería funcionar
```

## 📝 Desactivar Graphify

Para desactivar la integración de Graphify sin eliminar los archivos:

**Opción 1:** Comentar en `index.html`

```html
<!-- <script src="./app-graphify.js"></script> -->
<!-- <script src="./sections-graphify.js"></script> -->
```

**Opción 2:** Modificar `app-graphify.js`

```javascript
function initGraphifyIntegration() {
  return; // Desactiva completamente
  // ...
}
```

## 🚀 Extensiones futuras

### Gráficos adicionales planeados

1. **Línea temporal de ingresos** (lineChartTimeseries)
2. **Comparativa de KPIs** (radarChart)
3. **Correlación de datos** (scatterChart)
4. **Análisis de tendencias** (multi-series)

### Cómo agregar nuevos gráficos

```javascript
// En app-graphify.js o sections-graphify.js:

// 1. Observar cambios en un elemento
const element = document.getElementById('myChart');
const observer = new MutationObserver(() => {
  convertToGraphify(element);
});
observer.observe(element, { childList: true });

// 2. Convertir a datos Graphify
function convertToGraphify(el) {
  const data = extractData(el);
  el.innerHTML = '';
  const container = document.createElement('div');
  el.appendChild(container);
  
  // 3. Renderizar con Graphify
  Graphify.barChartDiscipline(container.id, data);
}
```

## 📊 Ejemplos de uso en consola

```javascript
// Acceder a la API de Graphify directamente
window.Graphify.barChartDiscipline('myContainer', {
  labels: ['A', 'B', 'C'],
  values: [100, 150, 200]
});

// Crear gráfico manual
const chart = Graphify.createChart('myChart');
chart.setOption({ /* opciones ECharts */ });

// Acceder a integración de app
window.GraphifyApp.renderGraphifyCharts();

// Acceder a integración de secciones
window.SectionsGraphify.convertTicketsBarsToGraphify();
```

## 🔗 Recursos

- [Graphify.md](./GRAPHIFY.md) – API de Graphify
- [Apache ECharts](https://echarts.apache.org/en/) – Documentación oficial
- [ECharts Examples](https://echarts.apache.org/examples/en/) – Ejemplos interactivos

---

**Versión:** 1.0  
**Fecha:** 2026-09-04  
**Dashboard:** Genius · Extractor + Dashboard
