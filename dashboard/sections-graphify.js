/**
 * SECTIONS-GRAPHIFY: Integración de Graphify en secciones de tickets y casino
 * Mejora gráficos de tickets-deporte.js y perp-casino.js
 */

(function() {
  'use strict';

  let attempts = 0;
  const maxAttempts = 50;

  function initSectionsGraphify() {
    if (typeof Graphify === 'undefined') {
      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(initSectionsGraphify, 100);
      }
      return;
    }

    observeTicketsSection();
    observeCasinoSection();
    console.log('✓ sections-graphify.js cargado');
  }

  /**
   * Observa cambios en la sección de tickets deportivos
   */
  function observeTicketsSection() {
    const tkBarras = document.getElementById('tkBarras');
    if (!tkBarras) {
      setTimeout(observeTicketsSection, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      setTimeout(() => {
        convertTicketsBarsToGraphify();
      }, 300);
    });

    observer.observe(tkBarras, { childList: true, subtree: true });
  }

  /**
   * Observa cambios en la sección de casino PERP
   */
  function observeCasinoSection() {
    const pcBarras = document.getElementById('pcBarras');
    if (!pcBarras) {
      setTimeout(observeCasinoSection, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      setTimeout(() => {
        convertCasinoBarsToGraphify();
      }, 300);
    });

    observer.observe(pcBarras, { childList: true, subtree: true });
  }

  /**
   * Convierte gráficos de tickets deportivos a ECharts
   */
  function convertTicketsBarsToGraphify() {
    const el = document.getElementById('tkBarras');
    if (!el || el.dataset.graphified === 'true') return;

    // Extraer datos del HTML de barras
    const rows = el.querySelectorAll('.row');
    if (rows.length === 0) return;

    const labels = [];
    const values = [];

    rows.forEach((row) => {
      const lbl = row.querySelector('.lbl');
      const barNum = row.querySelector('.bar-num');
      if (lbl && barNum) {
        const text = lbl.textContent.trim();
        labels.push(text);

        // Extraer número del bar-num (formato: "123 45%")
        const numText = barNum.textContent.split(' ')[0];
        const num = parseFloat(numText.replace(/[.,]/g, (m) => (m === ',' ? '.' : m))) || 0;
        values.push(num);
      }
    });

    if (labels.length === 0) return;

    // Crear contenedor ECharts
    el.innerHTML = '';
    const container = document.createElement('div');
    container.style.height = '300px';
    el.appendChild(container);
    container.id = 'graphify-tk-chart';

    el.dataset.graphified = 'true';

    setTimeout(() => {
      Graphify.barChartDiscipline('graphify-tk-chart', { labels, values });
    }, 100);
  }

  /**
   * Convierte gráficos de casino PERP a ECharts
   */
  function convertCasinoBarsToGraphify() {
    const el = document.getElementById('pcBarras');
    if (!el || el.dataset.graphified === 'true') return;

    const rows = el.querySelectorAll('.row');
    if (rows.length === 0) return;

    const labels = [];
    const values = [];

    rows.forEach((row) => {
      const lbl = row.querySelector('.lbl');
      const barNum = row.querySelector('.bar-num');
      if (lbl && barNum) {
        const text = lbl.textContent.trim();
        labels.push(text);

        const numText = barNum.textContent.split(' ')[0];
        const num = parseFloat(numText.replace(/[.,]/g, (m) => (m === ',' ? '.' : m))) || 0;
        values.push(num);
      }
    });

    if (labels.length === 0) return;

    el.innerHTML = '';
    const container = document.createElement('div');
    container.style.height = '300px';
    el.appendChild(container);
    container.id = 'graphify-pc-chart';

    el.dataset.graphified = 'true';

    setTimeout(() => {
      Graphify.barChartDiscipline('graphify-pc-chart', { labels, values });
    }, 100);
  }

  /**
   * Hook para actualización de periodo en tickets
   */
  function hookTicketsPeriodoChange() {
    const tkPeriodo = document.getElementById('tkPeriodo');
    if (tkPeriodo) {
      tkPeriodo.addEventListener('change', () => {
        setTimeout(() => {
          convertTicketsBarsToGraphify();
        }, 500);
      });
    }
  }

  /**
   * Hook para actualización de periodo en casino
   */
  function hookCasinoPeriodoChange() {
    const pcPeriodo = document.getElementById('pcPeriodo');
    if (pcPeriodo) {
      pcPeriodo.addEventListener('change', () => {
        setTimeout(() => {
          convertCasinoBarsToGraphify();
        }, 500);
      });
    }
  }

  // Iniciar
  setTimeout(() => {
    initSectionsGraphify();
    hookTicketsPeriodoChange();
    hookCasinoPeriodoChange();
  }, 1000);

  window.SectionsGraphify = {
    initSectionsGraphify,
    convertTicketsBarsToGraphify,
    convertCasinoBarsToGraphify,
  };
})();
