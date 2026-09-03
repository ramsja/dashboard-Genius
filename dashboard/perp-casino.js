/* PERP: desglose de casino por proveedor/juego.
   Lee ./data/perp-casino.json (generado por extraccion-perp-casino.py).
   Sin dependencias: barras div + tabla, mismo estilo del panel. */
(function () {
  'use strict';

  const DATA_URL = './data/perp-casino.json';
  const COLOR_BARRA = 'var(--purple)';

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
  const fmtMoney = (n) =>
    new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

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

  function barsHtml(items, total) {
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    return items
      .map((i) => {
        const pct = max > 0 ? Math.round((i.value / max) * 100) : 0;
        const share = total ? Math.round((i.value / total) * 1000) / 10 : 0;
        return (
          '<div class="row"><div class="lbl" style="width:120px;">' + esc(i.label) + '</div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + COLOR_BARRA + ';" title="' +
          esc(fmt(i.value) + ' rondas · ' + share + '%') + '"></div></div>' +
          '<div class="bar-num" style="width:88px;">' + fmt(i.value) +
          ' <span style="color:var(--muted);font-weight:400;">' + share + '%</span></div></div>'
        );
      })
      .join('');
  }

  function rtpClase(rtp) {
    if (rtp == null) return '';
    if (rtp >= 96) return 'color:var(--green);';
    if (rtp >= 90) return 'color:var(--amber);';
    return 'color:var(--red);';
  }

  function render(periodo) {
    const res = datos && datos.periodos && datos.periodos[periodo];
    if (!res) return;
    const filas = (res.por_proveedor || []).filter((f) => f.rondas > 0);
    const total = res.total_rondas || filas.reduce((a, f) => a + f.rondas, 0);
    const apuesta = filas.reduce((a, f) => a + (f.apuesta || 0), 0);
    const premios = filas.reduce((a, f) => a + (f.premios || 0), 0);
    const ggr = filas.reduce((a, f) => a + (f.ggr || 0), 0);
    const rtpProm = apuesta ? (premios / apuesta) * 100 : null;
    const meta = res.meta || {};

    $('#pcEstado').innerHTML =
      '<span class="dot" style="background:var(--green);margin-right:6px;"></span>' +
      'real · <strong>' + fmt(total) + '</strong> rondas en ' + esc(periodo) +
      (meta.generado ? ' · generado ' + esc(String(meta.generado).replace('T', ' ').slice(0, 16)) : '') +
      (meta.errores ? ' · <span style="color:var(--amber);">' + meta.errores + ' proveedores sin respuesta</span>' : '');

    const kpis = [
      ['Rondas del periodo', fmt(total), 'var(--text)'],
      ['Apuesta total', fmtMoney(apuesta), 'var(--amber)'],
      ['GGR (apuesta - premios)', fmtMoney(ggr), 'var(--green)'],
      ['RTP promedio', rtpProm != null ? rtpProm.toFixed(1) + '%' : '—', 'var(--purple)'],
    ];
    $('#pcKpis').innerHTML = kpis
      .map(
        ([label, value, color]) =>
          '<div class="card"><div class="label">' + label + '</div>' +
          '<div class="value" style="color:' + color + ';">' + value + '</div></div>'
      )
      .join('');

    const TOP = 12;
    const items = filas.slice(0, TOP).map((f) => ({ label: f.proveedor, value: f.rondas }));
    const resto = filas.slice(TOP);
    if (resto.length) {
      items.push({ label: 'Otros (' + resto.length + ')', value: resto.reduce((a, f) => a + f.rondas, 0) });
    }
    $('#pcBarras').innerHTML = filas.length
      ? barsHtml(items, total)
      : '<div class="muted">Sin rondas en este periodo.</div>';

    $('#pcTabla tbody').innerHTML = filas
      .map((f) => {
        const pct = total ? ((f.rondas / total) * 100).toFixed(1) : '0';
        return (
          '<tr><td><strong>' + esc(f.proveedor) + '</strong></td>' +
          '<td class="num">' + fmt(f.rondas) + '</td>' +
          '<td class="num">' + pct + '%</td>' +
          '<td class="num">' + fmtMoney(f.apuesta || 0) + '</td>' +
          '<td class="num">' + fmtMoney(f.ggr || 0) + '</td>' +
          '<td class="num" style="' + rtpClase(f.rtp) + '">' + (f.rtp != null ? f.rtp.toFixed(1) + '%' : '—') + '</td></tr>'
        );
      })
      .join('');
  }

  function pintarSelector() {
    const sel = $('#pcPeriodo');
    const periodos = Object.keys(datos.periodos || {}).sort().reverse();
    if (!periodos.length) return false;
    const previo = sel.value;
    sel.innerHTML = periodos.map((p) => '<option value="' + esc(p) + '">Periodo: ' + esc(p) + '</option>').join('');
    sel.value = periodos.includes(previo) ? previo : periodos[0];
    return true;
  }

  async function cargar() {
    const seccion = $('#pcSeccion');
    try {
      datos = await fetchJson(DATA_URL);
      seccion.style.display = '';
      if (pintarSelector()) render($('#pcPeriodo').value);
    } catch (err) {
      // sin datos generados aún: se mantiene oculta la sección
      seccion.style.display = 'none';
      console.warn('PERP de casino no disponible:', err);
    }
  }

  const sel = $('#pcPeriodo');
  if (sel) sel.addEventListener('change', (e) => render(e.target.value));
  const btn = $('#btnRefreshPerp');
  if (btn) btn.addEventListener('click', cargar);
  cargar();
})();
