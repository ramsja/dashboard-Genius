/**
 * EJEMPLO: Cómo usar Graphify en el dashboard
 * Descomentar las funciones para usar con datos reales
 */

(function() {
  'use strict';

  // Esperar a que Graphify esté disponible
  function initGraphifyExamples() {
    if (typeof Graphify === 'undefined') {
      console.warn('Graphify no está disponible aún');
      return;
    }

    // ==================== EJEMPLO 1: Gráfico de barras (Disciplinas) ====================
    // Reemplazar el gráfico SVG existente de disciplinas con ECharts
    function renderDisciplineChart() {
      const data = {
        labels: ['Casino', 'Deportes', 'Otros'],
        values: [1240, 856, 320],
      };

      // Usar contenedor existente (requiere cambiar su estructura)
      const container = document.getElementById('chartDisciplineECharts');
      if (container) {
        Graphify.barChartDiscipline('chartDisciplineECharts', data);
      }
    }

    // ==================== EJEMPLO 2: Gráfico de pastel (Conexiones) ====================
    // Mejorar el gráfico de conexiones con ECharts
    function renderConnectionChart() {
      const data = {
        labels: ['Online', 'Retail', 'Desconocido'],
        values: [6840, 2150, 126],
      };

      const container = document.getElementById('chartConnectionECharts');
      if (container) {
        Graphify.pieChartConnection('chartConnectionECharts', data);
      }
    }

    // ==================== EJEMPLO 3: Gráfico de línea (Series temporales) ====================
    // Mostrar tendencia de ingresos por día
    function renderTrendChart() {
      const data = {
        xAxis: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        series: [
          { name: 'Online', data: [120, 150, 130, 180, 165, 190, 175] },
          { name: 'Retail', data: [40, 45, 38, 50, 48, 55, 52] },
          { name: 'Otros', data: [10, 12, 8, 15, 14, 18, 16] },
        ],
      };

      const container = document.getElementById('chartTrendECharts');
      if (container) {
        Graphify.lineChartTimeseries('chartTrendECharts', data);
      }
    }

    // ==================== EJEMPLO 4: Gráfico radar (KPIs multidimensionales) ====================
    function renderRadarChart() {
      const data = {
        indicators: [
          { name: 'Volumen', max: 100 },
          { name: 'Crecimiento', max: 100 },
          { name: 'Rentabilidad', max: 100 },
          { name: 'Actividad', max: 100 },
          { name: 'Retención', max: 100 },
        ],
        series: [
          { name: 'Actual', value: [85, 72, 68, 90, 78] },
          { name: 'Meta', value: [80, 80, 80, 80, 80] },
        ],
      };

      const container = document.getElementById('chartRadarECharts');
      if (container) {
        Graphify.radarChart('chartRadarECharts', data);
      }
    }

    // ==================== EJEMPLO 5: Gráfico de dispersión (Correlación) ====================
    function renderScatterChart() {
      const data = [
        { x: 10, y: 20, name: 'Cliente A' },
        { x: 25, y: 35, name: 'Cliente B' },
        { x: 40, y: 50, name: 'Cliente C' },
        { x: 30, y: 45, name: 'Cliente D' },
        { x: 50, y: 65, name: 'Cliente E' },
      ];

      const container = document.getElementById('chartScatterECharts');
      if (container) {
        Graphify.scatterChart('chartScatterECharts', data);
      }
    }

    // Ejecutar ejemplos si existen contenedores
    renderDisciplineChart();
    renderConnectionChart();
    renderTrendChart();
    renderRadarChart();
    renderScatterChart();
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGraphifyExamples);
  } else {
    initGraphifyExamples();
  }

  // Exponer para debug
  window.GraphifyExamples = {
    init: initGraphifyExamples,
  };
})();
