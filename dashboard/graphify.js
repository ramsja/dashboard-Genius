/* Graphify – Integración con Apache ECharts para visualizaciones avanzadas */
(function() {
  'use strict';

  // Colores del dashboard
  const THEME_COLORS = {
    online: '#30c48d',
    retail: '#f5b942',
    desconocido: '#a7b9d8',
    casino: '#a78bfa',
    deportes: '#60a5fa',
    otros: '#a7b9d8',
    activo: '#30c48d',
    inactivo: '#f5b942',
    desconectado: '#f87171',
    suspendido: '#60a5fa',
    bg: '#0b1020',
    panel: '#161d2f',
    line: '#2e3d5e',
    text: '#edf3ff',
    muted: '#a7b9d8',
  };

  // Configuración global de ECharts
  const ECHARTS_THEME = {
    color: [
      THEME_COLORS.deportes,
      THEME_COLORS.casino,
      THEME_COLORS.online,
      THEME_COLORS.retail,
      THEME_COLORS.activo,
      THEME_COLORS.desconectado,
    ],
    backgroundColor: 'transparent',
    textStyle: { color: THEME_COLORS.text, fontFamily: '"Segoe UI", Arial, sans-serif' },
    title: { textStyle: { color: THEME_COLORS.text, fontSize: 14, fontWeight: 600 } },
    line: { itemStyle: { borderWidth: 1 }, lineStyle: { width: 2 }, symbolSize: 4 },
    radar: { itemStyle: { borderWidth: 1 }, lineStyle: { width: 2 }, symbolSize: 4 },
    bar: { itemStyle: { barBorderWidth: 0, barBorderRadius: [4, 4, 0, 0] } },
    pie: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    scatter: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    boxplot: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    parallel: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    sankey: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    funnel: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    gauge: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    candlestick: { itemStyle: { color: '#ec0000', color0: '#00da3c', borderColor: '#8a0000', borderColor0: '#008f28' } },
    graph: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    map: { itemStyle: { areaColor: THEME_COLORS.panel, borderColor: THEME_COLORS.line } },
    heatmap: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    effectScatter: { itemStyle: { borderWidth: 0, borderColor: THEME_COLORS.bg } },
    lines: { lineStyle: { width: 1, curveness: 0.3 } },
    grid: { borderColor: THEME_COLORS.line },
    categoryAxis: { axisLine: { show: true, lineStyle: { color: THEME_COLORS.line } }, axisTick: { show: false }, axisLabel: { color: THEME_COLORS.muted, fontSize: 12 } },
    valueAxis: { axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: THEME_COLORS.line } }, axisLabel: { color: THEME_COLORS.muted, fontSize: 12 } },
    logAxis: { axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: THEME_COLORS.line } }, axisLabel: { color: THEME_COLORS.muted, fontSize: 12 } },
    timeAxis: { axisLine: { show: true, lineStyle: { color: THEME_COLORS.line } }, axisTick: { show: false }, axisLabel: { color: THEME_COLORS.muted, fontSize: 12 } },
    toolbox: { iconStyle: { borderColor: THEME_COLORS.text } },
    legend: { textStyle: { color: THEME_COLORS.muted }, itemGap: 14, itemWidth: 12, itemHeight: 12 },
    tooltip: {
      backgroundColor: 'rgba(22, 29, 47, 0.9)',
      borderColor: THEME_COLORS.line,
      textStyle: { color: THEME_COLORS.text, fontSize: 12 },
      axisPointer: { lineStyle: { color: THEME_COLORS.line, width: 1 }, crossStyle: { color: THEME_COLORS.line, width: 1 } },
    },
    timeline: { lineStyle: { color: THEME_COLORS.line, width: 1 }, itemStyle: { color: THEME_COLORS.panel, borderColor: THEME_COLORS.line }, controlStyle: { color: THEME_COLORS.text, borderColor: THEME_COLORS.line } },
    visualMap: { textStyle: { color: THEME_COLORS.muted } },
  };

  /**
   * Inicializa ECharts con tema personalizado
   * @param {string} containerId - ID del contenedor
   * @returns {Object} instancia de ECharts
   */
  function createChart(containerId) {
    if (typeof echarts === 'undefined') {
      console.warn('ECharts no está cargado');
      return null;
    }
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Contenedor ${containerId} no encontrado`);
      return null;
    }
    const chart = echarts.init(container, null, { renderer: 'canvas', locale: 'ES' });
    chart.setOption({ ...ECHARTS_THEME }, true);
    return chart;
  }

  /**
   * Gráfico de barras horizontal para disciplinas
   * @param {string} containerId
   * @param {Object} data - { labels: [...], values: [...] }
   */
  function barChartDiscipline(containerId, data) {
    const chart = createChart(containerId);
    if (!chart) return;

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 120, right: 20, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', splitLine: { show: true, lineStyle: { color: THEME_COLORS.line } } },
      yAxis: { type: 'category', data: data.labels, axisLabel: { fontSize: 12, color: THEME_COLORS.muted } },
      series: [
        {
          data: data.values,
          type: 'bar',
          itemStyle: { color: THEME_COLORS.deportes, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', fontSize: 12, color: THEME_COLORS.text, formatter: '{c}' },
        },
      ],
    };
    chart.setOption(option);
    return chart;
  }

  /**
   * Gráfico de pastel/donut para conexiones
   * @param {string} containerId
   * @param {Object} data - { labels: [...], values: [...] }
   */
  function pieChartConnection(containerId, data) {
    const chart = createChart(containerId);
    if (!chart) return;

    const colors = [THEME_COLORS.online, THEME_COLORS.retail, THEME_COLORS.desconocido];
    const option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'bottom', textStyle: { color: THEME_COLORS.muted, fontSize: 12 } },
      series: [
        {
          name: 'Conexión',
          type: 'pie',
          radius: ['35%', '60%'],
          data: data.labels.map((label, i) => ({ value: data.values[i], name: label })),
          itemStyle: { borderRadius: 4, borderColor: THEME_COLORS.bg, borderWidth: 2 },
          color: colors,
          label: { color: THEME_COLORS.text, fontSize: 12 },
          emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
        },
      ],
    };
    chart.setOption(option);
    return chart;
  }

  /**
   * Gráfico de línea para series temporales
   * @param {string} containerId
   * @param {Object} data - { xAxis: [...], series: [{name: '', data: [...]}, ...] }
   */
  function lineChartTimeseries(containerId, data) {
    const chart = createChart(containerId);
    if (!chart) return;

    const series = data.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      itemStyle: { color: ECHARTS_THEME.color[i % ECHARTS_THEME.color.length] },
      areaStyle: { color: `rgba(${hexToRgb(ECHARTS_THEME.color[i % ECHARTS_THEME.color.length]).join(',')}, 0.1)` },
      symbol: 'circle',
      symbolSize: 4,
    }));

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: data.series.map((s) => s.name), textStyle: { color: THEME_COLORS.muted } },
      grid: { left: 60, right: 20, top: 30, bottom: 30, containLabel: true },
      xAxis: { type: 'category', data: data.xAxis, boundaryGap: false },
      yAxis: { type: 'value' },
      series: series,
    };
    chart.setOption(option);
    return chart;
  }

  /**
   * Gráfico de radar (araña) para multidimensional
   * @param {string} containerId
   * @param {Object} data - { indicators: [...], series: [{name: '', value: [...]}, ...] }
   */
  function radarChart(containerId, data) {
    const chart = createChart(containerId);
    if (!chart) return;

    const option = {
      tooltip: { trigger: 'item' },
      radar: {
        indicator: data.indicators,
        splitNumber: 4,
        axisLine: { lineStyle: { color: THEME_COLORS.line } },
        splitLine: { lineStyle: { color: THEME_COLORS.line } },
        splitArea: { show: false },
        axisLabel: { color: THEME_COLORS.muted, fontSize: 11 },
      },
      series: [
        {
          name: 'Métricas',
          type: 'radar',
          data: data.series.map((s) => ({ value: s.value, name: s.name })),
          itemStyle: { borderColor: THEME_COLORS.deportes },
          lineStyle: { color: THEME_COLORS.deportes },
          areaStyle: { color: `rgba(96, 165, 250, 0.15)` },
          symbolSize: 4,
        },
      ],
      legend: { data: data.series.map((s) => s.name), textStyle: { color: THEME_COLORS.muted } },
    };
    chart.setOption(option);
    return chart;
  }

  /**
   * Gráfico de dispersión (scatter)
   * @param {string} containerId
   * @param {Array} points - [{x, y, name}]
   */
  function scatterChart(containerId, points) {
    const chart = createChart(containerId);
    if (!chart) return;

    const xValues = points.map((p) => p.x);
    const yValues = points.map((p) => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const option = {
      tooltip: { trigger: 'item', formatter: (params) => `${params.data.name}<br/>X: ${params.data[0]}<br/>Y: ${params.data[1]}` },
      xAxis: { type: 'value', min: minX * 0.9, max: maxX * 1.1, axisLabel: { color: THEME_COLORS.muted } },
      yAxis: { type: 'value', min: minY * 0.9, max: maxY * 1.1, axisLabel: { color: THEME_COLORS.muted } },
      grid: { left: 60, right: 20, top: 20, bottom: 30, containLabel: true },
      series: [
        {
          type: 'scatter',
          data: points.map((p) => [...Object.values(p)]),
          itemStyle: { color: THEME_COLORS.deportes, opacity: 0.8 },
          symbolSize: 8,
        },
      ],
    };
    chart.setOption(option);
    return chart;
  }

  // Utilidad: Convertir hex a RGB
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [96, 165, 250];
  }

  // Exponer API global
  window.Graphify = {
    createChart,
    barChartDiscipline,
    pieChartConnection,
    lineChartTimeseries,
    radarChart,
    scatterChart,
    THEME_COLORS,
    ECHARTS_THEME,
  };

  console.log('✓ Graphify (Apache ECharts) cargado');
})();
