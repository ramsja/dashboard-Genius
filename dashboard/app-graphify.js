/**
 * APP-GRAPHIFY: Integración de Graphify/ECharts en dashboard principal
 * Reemplaza los gráficos SVG/HTML con visualizaciones mejoradas de ECharts
 */

(function() {
  'use strict';

  // Esperar a que ambos Graphify y los datos estén disponibles
  let attempts = 0;
  const maxAttempts = 50;

  function initGraphifyIntegration() {
    if (typeof Graphify === 'undefined') {
      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(initGraphifyIntegration, 100);
      } else {
        console.warn('Graphify no cargó en tiempo');
      }
      return;
    }

    // Interceptar las funciones de render del dashboard
    enhanceDashboardCharts();
    console.log('✓ Graphify integration completada');
  }

  /**
   * Reemplaza/mejora los gráficos del dashboard
   */
  function enhanceDashboardCharts() {
    const originalRender = window.render;

    // Reemplazar render global para ejecutar charts con Graphify
    if (typeof originalRender === 'function') {
      // Nota: Este enfoque requiere acceso al scope global del app.js
      // Usaremos observer de cambios en el DOM en su lugar
    }

    // Usar MutationObserver para detectar cuándo el dashboard carga datos
    observeChartChanges();
  }

  /**
   * Observa cambios en el dashboard y renderiza gráficos con Graphify
   */
  function observeChartChanges() {
    // Observar cambios en KPIs (indicador de que datos cargaron)
    const kpis = document.getElementById('kpis');
    if (!kpis) {
      setTimeout(observeChartChanges, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      setTimeout(() => {
        renderGraphifyCharts();
      }, 500);
    });

    observer.observe(kpis, { childList: true, subtree: true });
    console.log('✓ Observer de gráficos Graphify configurado');
  }

  /**
   * Renderiza todos los gráficos con Graphify
   */
  function renderGraphifyCharts() {
    const chartDiscipline = document.getElementById('chartDiscipline');
    const chartConnection = document.getElementById('chartConnection');
    const chartMatrix = document.getElementById('chartMatrix');
    const chartProducts = document.getElementById('chartProducts');
    const chartStatus = document.getElementById('chartStatus');

    // Convertir gráficos de barras SVG a ECharts
    if (chartDiscipline && !chartDiscipline.dataset.graphified) {
      convertBarsToGraphify(chartDiscipline, 'Transacciones por disciplina');
      chartDiscipline.dataset.graphified = 'true';
    }

    if (chartMatrix && !chartMatrix.dataset.graphified) {
      convertBarsToGraphify(chartMatrix, 'Disciplina × Conexión');
      chartMatrix.dataset.graphified = 'true';
    }

    if (chartProducts && !chartProducts.dataset.graphified) {
      convertBarsToGraphify(chartProducts, 'Productos principales');
      chartProducts.dataset.graphified = 'true';
    }

    if (chartStatus && !chartStatus.dataset.graphified) {
      convertBarsToGraphify(chartStatus, 'Resumen por estado');
      chartStatus.dataset.graphified = 'true';
    }

    if (chartConnection && !chartConnection.dataset.graphified) {
      convertPieToGraphify(chartConnection);
      chartConnection.dataset.graphified = 'true';
    }
  }

  /**
   * Convierte gráficos de barras HTML a ECharts
   */
  function convertBarsToGraphify(el, title) {
    // Extraer datos del HTML existente
    const rows = el.querySelectorAll('.row');
    if (rows.length === 0) return;

    const labels = [];
    const values = [];

    rows.forEach((row) => {
      const lbl = row.querySelector('.lbl');
      const barNum = row.querySelector('.bar-num');
      if (lbl && barNum) {
        labels.push(lbl.textContent.trim());
        values.push(parseFloat(barNum.textContent.replace(/[.,]/g, (m) => (m === ',' ? '.' : m))) || 0);
      }
    });

    // Crear contenedor para gráfico
    el.innerHTML = '';
    const container = document.createElement('div');
    container.style.height = '300px';
    el.appendChild(container);
    container.id = 'graphify-chart-' + Math.random().toString(36).slice(2, 9);

    // Renderizar con Graphify
    setTimeout(() => {
      Graphify.barChartDiscipline(container.id, { labels, values });
    }, 100);
  }

  /**
   * Convierte gráfico de pastel SVG a ECharts donut
   */
  function convertPieToGraphify(el) {
    const svg = el.querySelector('svg');
    if (!svg) return;

    // Extraer datos de la leyenda
    const legendEl = document.getElementById('legendConnection');
    if (!legendEl) return;

    const labels = [];
    const values = [];

    legendEl.querySelectorAll('span').forEach((span) => {
      const text = span.textContent.trim();
      // Formato: "Label · 123"
      const match = text.match(/^(.+?)\s·\s(.+)$/);
      if (match) {
        labels.push(match[1]);
        const numStr = match[2].replace(/[.,]/g, (m) => (m === ',' ? '.' : m));
        values.push(parseFloat(numStr) || 0);
      }
    });

    // Crear contenedor
    el.innerHTML = '';
    const container = document.createElement('div');
    container.style.height = '320px';
    el.appendChild(container);
    container.id = 'graphify-chart-' + Math.random().toString(36).slice(2, 9);

    setTimeout(() => {
      Graphify.pieChartConnection(container.id, { labels, values });
    }, 100);
  }

  /**
   * Hook para re-renderizar gráficos cuando cambia el filtro
   */
  function hookFilterChanges() {
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
      const originalClick = btnFilter.onclick;
      btnFilter.addEventListener('click', () => {
        setTimeout(() => {
          renderGraphifyCharts();
        }, 300);
      });
    }
  }

  // Iniciar
  initGraphifyIntegration();
  hookFilterChanges();

  // Exponer para debug
  window.GraphifyApp = {
    initGraphifyIntegration,
    renderGraphifyCharts,
    convertBarsToGraphify,
    convertPieToGraphify,
  };

  console.log('✓ app-graphify.js cargado');
})();
