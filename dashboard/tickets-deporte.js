/* Desglose de tickets deportivos por disciplina.
   Lee ./data/desglose-tickets.json (generado por extraccion-tickets-deporte.py).
   Sin dependencias: barras div + tabla, mismo estilo del panel. */
(function () {
  'use strict';

  const DATA_URL = './data/desglose-tickets.json';
  const COLOR_BARRA = 'var(--blue)';
  const COLORES_ESTADO = {
    Running: 'var(--blue)',
    Won: 'var(--green)',
    Lost: 'var(--red)',
    Cashout: 'var(--amber)',
    Void: 'var(--muted)',
  };

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
          esc(fmt(i.value) + ' tickets · ' + share + '%') + '"></div></div>' +
          '<div class="bar-num" style="width:88px;">' + fmt(i.value) +
          ' <span style="color:var(--muted);font-weight:400;">' + share + '%</span></div></div>'
        );
      })
      .join('');
  }

  function estadosHtml(estados) {
    const entries = Object.entries(estados || {}).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '—';
    return entries
      .map(([k, v]) => {
        const color = COLORES_ESTADO[k] || 'var(--muted)';
        return '<span style="white-space:nowrap;"><span class="dot" style="background:' + color + ';margin-right:4px;"></span>' +
          esc(k) + ' ' + fmt(v) + '</span>';
      })
      .join(' · ');
  }

  function render(periodo) {
    const res = datos && datos.periodos && datos.periodos[periodo];
    if (!res) return;
    const filas = (res.por_deporte || []).filter((f) => f.tickets > 0);
    const total = res.total_tickets || filas.reduce((a, f) => a + f.tickets, 0);
    const importe = filas.reduce((a, f) => a + (f.importe || 0), 0);
    const meta = res.meta || {};

    $('#tkEstado').innerHTML =
      '<span class="dot" style="background:var(--green);margin-right:6px;"></span>' +
      'real · <strong>' + fmt(total) + '</strong> tickets en ' + esc(periodo) +
      (meta.generado ? ' · generado ' + esc(String(meta.generado).replace('T', ' ').slice(0, 16)) : '') +
      (meta.errores ? ' · <span style="color:var(--amber);">' + meta.errores + ' deportes sin respuesta</span>' : '');

    const kpis = [
      ['Tickets del periodo', fmt(total), 'var(--text)'],
      ['Importe apostado', fmtMoney(importe), 'var(--amber)'],
      ['Deportes con actividad', fmt(filas.length), 'var(--green)'],
      ['Ticket promedio', total ? fmtMoney(importe / total) : '—', 'var(--blue)'],
    ];
    $('#tkKpis').innerHTML = kpis
      .map(
        ([label, value, color]) =>
          '<div class="card"><div class="label">' + label + '</div>' +
          '<div class="value" style="color:' + color + ';">' + value + '</div></div>'
      )
      .join('');

    const TOP = 12;
    const items = filas.slice(0, TOP).map((f) => ({ label: f.deporte, value: f.tickets }));
    const resto = filas.slice(TOP);
    if (resto.length) {
      items.push({ label: 'Otros (' + resto.length + ')', value: resto.reduce((a, f) => a + f.tickets, 0) });
    }
    $('#tkBarras').innerHTML = filas.length
      ? barsHtml(items, total)
      : '<div class="muted">Sin tickets en este periodo.</div>';

    $('#tkTabla tbody').innerHTML = filas
      .map((f) => {
        const pct = total ? ((f.tickets / total) * 100).toFixed(1) : '0';
        return (
          '<tr><td><strong>' + esc(f.deporte) + '</strong></td>' +
          '<td class="num">' + fmt(f.tickets) + '</td>' +
          '<td class="num">' + pct + '%</td>' +
          '<td class="num">' + fmtMoney(f.importe || 0) + '</td>' +
          '<td class="num">' + (f.pendiente ? fmtMoney(f.pendiente) : '—') + '</td>' +
          '<td class="num">' + (f.cuota_media || '—') + '</td>' +
          '<td style="font-size:12px;">' + estadosHtml(f.estados) + '</td></tr>'
        );
      })
      .join('');
  }

  function pintarSelector() {
    const sel = $('#tkPeriodo');
    const periodos = Object.keys(datos.periodos || {}).sort().reverse();
    if (!periodos.length) return false;
    const previo = sel.value;
    sel.innerHTML = periodos.map((p) => '<option value="' + esc(p) + '">Periodo: ' + esc(p) + '</option>').join('');
    sel.value = periodos.includes(previo) ? previo : periodos[0];
    return true;
  }

  async function cargar() {
    const seccion = $('#tkSeccion');
    try {
      datos = await fetchJson(DATA_URL);
      seccion.style.display = '';
      if (pintarSelector()) render($('#tkPeriodo').value);
    } catch (err) {
      // sin datos generados aún: se mantiene oculta la sección
      seccion.style.display = 'none';
      console.warn('Desglose de tickets no disponible:', err);
    }
  }

  const sel = $('#tkPeriodo');
  if (sel) sel.addEventListener('change', (e) => render(e.target.value));
  const btn = $('#btnRefresh');
  if (btn) btn.addEventListener('click', cargar);
  cargar();
})();
