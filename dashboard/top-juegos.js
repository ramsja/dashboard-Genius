/* Sección de top juegos y apuestas (casino + deportes).
   Lee ./data/top-juegos.json generado por construir-top-juegos.py. */
(function () {
  'use strict';

  const DATA_URL = './data/top-juegos.json';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  const fmt = (n) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n || 0);
  const fmtMoney = (n) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const CATEGORY_COLORS = {
    casino: 'var(--purple)',
    deportes: 'var(--blue)',
  };

  const CATEGORY_TAGS = {
    casino: 'd-casino',
    deportes: 'd-deportes',
  };

  let datos = null;

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function getSelectedPeriod() {
    const select = $('#tjPeriodo');
    return select ? select.value : 'acumulado';
  }

  function getSelectedMetric() {
    const select = $('#tjMetrica');
    return select ? select.value : 'jugadas';
  }

  function getSelectedCategory() {
    const select = $('#tjCategoria');
    return select ? select.value : 'todos';
  }

  function renderBars(el, items) {
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    el.innerHTML = items
      .map((i) => {
        const pct = max > 0 ? Math.round((i.value / max) * 100) : 0;
        return (
          '<div class="row"><div class="lbl" style="width:112px;">' + esc(i.label) + '</div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + (i.color || 'var(--purple)') + ';" title="' +
          esc(i.title) + '"></div></div>' +
          '<div class="bar-num" style="width:80px;">' + esc(i.num) + '</div></div>'
        );
      })
      .join('');
  }

  function render() {
    if (!datos) return;
    const period = getSelectedPeriod();
    const metric = getSelectedMetric();
    const category = getSelectedCategory();

    const bucket = period === 'acumulado'
      ? datos.acumulado
      : (datos.por_periodo || {})[period];
    if (!bucket) return;

    const key = metric === 'apuesta' ? 'mas_apostados' : 'mas_jugados';
    let games = bucket[key] || [];

    if (category !== 'todos') {
      games = games.filter((g) => g.categoria === category);
    }

    const visible = games.slice(0, 12);

    $('#tjEstado').innerHTML =
      '<span class="dot" style="background:var(--purple);margin-right:6px;"></span>' +
      '<strong>' + fmt(games.length) + '</strong> juegos/apuestas' +
      (datos.actualizado ? ' · actualizado ' + esc(String(datos.actualizado).replace('T', ' ').slice(0, 16)) : '');

    const totalJugadas = games.reduce((a, g) => a + (g.jugadas || 0), 0);
    const totalApuesta = games.reduce((a, g) => a + (g.apuesta || 0), 0);
    const kpis = [
      ['Total juegos', fmt(games.length), 'var(--text)'],
      [metric === 'apuesta' ? 'Apuesta total' : 'Jugadas total', metric === 'apuesta' ? fmtMoney(totalApuesta) : fmt(totalJugadas), 'var(--purple)'],
    ];
    $('#tjKpis').innerHTML = kpis
      .map(
        ([label, value, color]) =>
          '<div class="card"><div class="label">' + esc(label) + '</div>' +
          '<div class="value" style="color:' + color + ';">' + value + '</div></div>'
      )
      .join('');

    const barItems = visible.map((g) => ({
      label: (g.titulo || '').length > 16 ? (g.titulo || '').slice(0, 15) + '…' : (g.titulo || ''),
      title: (g.titulo || '') + ' · ' + (g.proveedor || '') + ' · ' + (g.categoria || ''),
      value: metric === 'apuesta' ? (g.apuesta || 0) : (g.jugadas || 0),
      num: metric === 'apuesta' ? fmtMoney(g.apuesta) : fmt(g.jugadas),
      color: CATEGORY_COLORS[g.categoria] || 'var(--muted)',
    }));
    renderBars($('#tjBarras'), barItems);

    $('#tjTabla tbody').innerHTML = visible
      .map((g, idx) => {
        return (
          '<tr><td class="num">' + (idx + 1) + '</td>' +
          '<td><strong>' + esc(g.titulo || '') + '</strong><br><span class="muted" style="font-size:12px;">' + esc(g.proveedor || '') + '</span></td>' +
          '<td><span class="tag ' + (CATEGORY_TAGS[g.categoria] || 'd-otros') + '">' + esc(g.categoria || '') + '</span></td>' +
          '<td class="num">' + fmt(g.jugadas) + '</td>' +
          '<td class="num">' + fmtMoney(g.apuesta) + '</td></tr>'
        );
      })
      .join('');
  }

  function populatePeriods() {
    const select = $('#tjPeriodo');
    if (!select || !datos) return;
    const current = select.value;
    select.innerHTML =
      '<option value="acumulado">Todo el histórico</option>' +
      (datos.periodos_disponibles || [])
        .map((p) => '<option value="' + esc(p) + '">' + esc(p) + '</option>')
        .join('');
    select.value = current && Array.from(select.options).some((o) => o.value === current) ? current : 'acumulado';
  }

  function bind() {
    $('#tjPeriodo').addEventListener('change', render);
    $('#tjMetrica').addEventListener('change', render);
    $('#tjCategoria').addEventListener('change', render);
  }

  async function cargar() {
    const seccion = $('#tjSeccion');
    try {
      datos = await fetchJson(DATA_URL);
      if (!datos || !datos.acumulado || !datos.acumulado.mas_jugados || !datos.acumulado.mas_jugados.length) {
        throw new Error('top juegos vacío');
      }
      seccion.style.display = '';
      populatePeriods();
      render();
    } catch (err) {
      seccion.style.display = 'none';
      console.warn('Top juegos no disponible:', err);
    }
  }

  const btn = $('#btnRefresh');
  if (btn) btn.addEventListener('click', cargar);
  bind();
  cargar();
})();
