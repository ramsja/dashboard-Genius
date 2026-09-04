# Graphify – Visualizaciones avanzadas con Apache ECharts

## 📊 ¿Qué es Graphify?

Graphify es un módulo de integración que proporciona **Apache ECharts** al dashboard. Permite crear visualizaciones interactivas, responsivas y personalizadas con tema oscuro automático.

## 🚀 Inicio rápido

### 1. Graphify se carga automáticamente

El archivo `graphify.js` se carga en `index.html`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js"></script>
<script src="./graphify.js"></script>
```

### 2. Usar la API en tu código

```javascript
// Gráfico de barras horizontal
Graphify.barChartDiscipline('chartDisciplineECharts', {
  labels: ['Casino', 'Deportes', 'Otros'],
  values: [1240, 856, 320]
});

// Gráfico de pastel
Graphify.pieChartConnection('chartConnectionECharts', {
  labels: ['Online', 'Retail', 'Desconocido'],
  values: [6840, 2150, 126]
});

// Gráfico de línea (series temporales)
Graphify.lineChartTimeseries('chartTrendECharts', {
  xAxis: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
  series: [
    { name: 'Online', data: [120, 150, 130, 180, 165] },
    { name: 'Retail', data: [40, 45, 38, 50, 48] }
  ]
});
```

## 📈 Funciones disponibles

### `Graphify.createChart(containerId)`

Inicializa un gráfico ECharts con el tema del dashboard.

```javascript
const chart = Graphify.createChart('myChart');
chart.setOption({ /* opciones ECharts */ });
```

### `Graphify.barChartDiscipline(containerId, data)`

Gráfico de barras horizontal (ideal para disciplinas, productos, etc.)

**Parámetros:**
- `containerId`: ID del elemento HTML
- `data`: `{ labels: string[], values: number[] }`

**Ejemplo:**
```javascript
Graphify.barChartDiscipline('myChart', {
  labels: ['Casino', 'Deportes'],
  values: [1240, 856]
});
```

### `Graphify.pieChartConnection(containerId, data)`

Gráfico de pastel/donut (ideal para distribuciones, conexiones, etc.)

**Parámetros:**
- `containerId`: ID del elemento HTML
- `data`: `{ labels: string[], values: number[] }`

**Ejemplo:**
```javascript
Graphify.pieChartConnection('myChart', {
  labels: ['Online', 'Retail'],
  values: [6840, 2150]
});
```

### `Graphify.lineChartTimeseries(containerId, data)`

Gráfico de línea para series temporales o tendencias.

**Parámetros:**
- `containerId`: ID del elemento HTML
- `data`: 
  ```javascript
  {
    xAxis: string[],  // Etiquetas del eje X
    series: [
      { name: string, data: number[] },
      { name: string, data: number[] }
    ]
  }
  ```

**Ejemplo:**
```javascript
Graphify.lineChartTimeseries('myChart', {
  xAxis: ['Día 1', 'Día 2', 'Día 3'],
  series: [
    { name: 'Online', data: [120, 150, 180] },
    { name: 'Retail', data: [40, 45, 50] }
  ]
});
```

### `Graphify.radarChart(containerId, data)`

Gráfico radar (araña) para comparar múltiples dimensiones.

**Parámetros:**
- `containerId`: ID del elemento HTML
- `data`:
  ```javascript
  {
    indicators: [
      { name: string, max: number },
      ...
    ],
    series: [
      { name: string, value: number[] },
      ...
    ]
  }
  ```

**Ejemplo:**
```javascript
Graphify.radarChart('myChart', {
  indicators: [
    { name: 'Volumen', max: 100 },
    { name: 'Crecimiento', max: 100 },
    { name: 'Rentabilidad', max: 100 }
  ],
  series: [
    { name: 'Actual', value: [85, 72, 68] },
    { name: 'Meta', value: [80, 80, 80] }
  ]
});
```

### `Graphify.scatterChart(containerId, points)`

Gráfico de dispersión para correlaciones.

**Parámetros:**
- `containerId`: ID del elemento HTML
- `points`: `Array<{ x: number, y: number, name: string }>`

**Ejemplo:**
```javascript
Graphify.scatterChart('myChart', [
  { x: 10, y: 20, name: 'Cliente A' },
  { x: 25, y: 35, name: 'Cliente B' },
  { x: 40, y: 50, name: 'Cliente C' }
]);
```

## 🎨 Colores del tema

Graphify usa automáticamente los colores del dashboard:

```javascript
Graphify.THEME_COLORS = {
  online: '#30c48d',      // Verde
  retail: '#f5b942',      // Ámbar
  desconocido: '#a7b9d8', // Gris
  casino: '#a78bfa',      // Púrpura
  deportes: '#60a5fa',    // Azul
  activo: '#30c48d',      // Verde
  desconectado: '#f87171',// Rojo
  suspendido: '#60a5fa',  // Azul
  // ... más colores
};
```

## 📝 Integrando Graphify en el dashboard existente

### 1. Crear contenedores en HTML

```html
<div class="panel">
  <h2>Disciplinas</h2>
  <div id="chartDisciplineECharts" style="height: 300px;"></div>
</div>

<div class="panel">
  <h2>Conexiones</h2>
  <div id="chartConnectionECharts" style="height: 300px;"></div>
</div>
```

### 2. Inicializar gráficos en JavaScript

```javascript
// Cuando tengas los datos del dashboard
const dashboardData = { /* ... */ };

Graphify.barChartDiscipline('chartDisciplineECharts', {
  labels: Object.keys(dashboardData.byDiscipline),
  values: Object.values(dashboardData.byDiscipline).map(d => d.count)
});

Graphify.pieChartConnection('chartConnectionECharts', {
  labels: ['Online', 'Retail', 'Desconocido'],
  values: [dashboardData.online, dashboardData.retail, dashboardData.desconocido]
});
```

## 🔄 Responsive y auto-resize

Los gráficos se adaptan automáticamente al tamaño del contenedor. Para forzar un redibujado:

```javascript
const chart = Graphify.createChart('myChart');
chart.setOption(myOption);

// Cuando cambies el tamaño del contenedor:
window.addEventListener('resize', () => {
  chart.resize();
});
```

## 📚 Recursos

- **Apache ECharts Docs:** https://echarts.apache.org/en/
- **ECharts Examples:** https://echarts.apache.org/examples/en/
- **GitHub - warioddly/graphify:** https://github.com/warioddly/graphify
- **Graphify-Labs Knowledge Graph:** https://github.com/Graphify-Labs/graphify

## 🧪 Pruebas

Consulta `graphify-example.js` para ejemplos de uso funcionales.

Para probar:
1. Abre el navegador en `http://localhost:8000/dashboard/`
2. Abre la consola (`F12`)
3. Verifica que aparezca: `✓ Graphify (Apache ECharts) cargado`
4. Usa `Graphify.THEME_COLORS` para inspeccionar los colores disponibles

---

**v1.0** · Dashboard Genius · Integración Graphify con Apache ECharts
