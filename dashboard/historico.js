/* Historial diario de transacciones y clientes únicos.
   Lee ./data/historico.json (generado por construir-historico.py).
   Sin dependencias: barras div + tabla, mismo estilo del panel. */
(function () {
  'use strict';

  const DATA_URL = './data/historico.json';
  const COLOR_TX = 'var(--purple)';
  const COLOR_ONLINE = 'var(--green)';
  const COLOR_RETAIL = 'var(--amber)';

  const STATUS_KEYS = ['activo', 'inactivo', 'desconectado', 'suspendido', 'otros'];
  const STATUS_LABELS = {
    activo: 'Activos',
    inactivo: 'Inactivos',
    desconectado: 'Desconectados',
    suspendido: 'Suspendidos',
    otros: 'Otros',
  };
  const STATUS_COLORS = {
    activo: 'var(--green)',
    inactivo: 'var(--amber)',
    desconectado: 'var(--red)',
    suspendido: 'var(--blue)',
    otros: 'var(--muted)',
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
  const diaCorto = (iso) => {
    const partes = String(iso || '').split('-');
    return partes.length === 3 ? partes[2] + '/' + partes[1] : iso;
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

  function moneyDelDia(dia) {
    const money = dia.money || {};
    return Object.values(money).reduce(
      (acc, m) => ({ income: acc.income + (m.income || 0), total: acc.total + (m.total || 0) }),
      { income: 0, total: 0 }
    );
  }

  function barsDias(items, color, sufijo) {
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    return items
      .map((i) => {
        const pct = max > 0 ? Math.round((i.value / max) * 100) : 0;
        return (
          '<div class="row"><div class="lbl" style="width:64px;">' + esc(i.label) + '</div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + color + ';" title="' +
          esc(fmt(i.value) + (sufijo || '')) + '"></div></div>' +
          '<div class="bar-num" style="width:76px;">' + fmt(i.value) + '</div></div>'
        );
      })
      .join('');
  }

  function barrasClientes(filas) {
    const max = Math.max.apply(
      null,
      filas.flatMap((f) => [f.clientes.online, f.clientes.retail]).concat([1])
    );
    return filas
      .map((f) => {
        const pctOn = Math.round(((f.clientes.online || 0) / max) * 100);
        const pctRe = Math.round(((f.clientes.retail || 0) / max) * 100);
        return (
          '<div class="row"><div class="lbl" style="width:64px;">' + esc(diaCorto(f.dia)) + '</div>' +
          '<div class="track" style="background:transparent;">' +
          '<div class="fill" style="width:' + pctOn + '%;background:' + COLOR_ONLINE + ';border-radius:8px 0 0 8px;" title="' +
          esc(fmt(f.clientes.online) + ' clientes online') + '"></div>' +
          '<div class="fill" style="width:' + pctRe + '%;background:' + COLOR_RETAIL + ';border-radius:0 8px 8px 0;margin-left:2px;" title="' +
          esc(fmt(f.clientes.retail) + ' clientes retail') + '"></div>' +
          '</div>' +
          '<div class="bar-num" style="width:76px;">' + fmt(f.clientes.total) + '</div></div>'
        );
      })
      .join('');
  }

  function renderDonutEstados(estados) {
    const total = STATUS_KEYS.reduce((a, k) => a + (estados[k] || 0), 0) || 1;
    const groups = STATUS_KEYS
      .map((key) => ({ key, value: estados[key] || 0 }))
      .filter((g) => g.value > 0);
    const size = 220;
    const r = 80;
    const cx = size / 2;
    const cy = size / 2;
    let angle = -90;
    const arcs = groups.map((g) => {
      const pct = g.value / total;
      const start = angle;
      angle += pct * 360;
      const end = angle;
      const large = end - start > 180 ? 1 : 0;
      const x1 = cx + r * Math.cos((start * Math.PI) / 180);
      const y1 = cy + r * Math.sin((start * Math.PI) / 180);
      const x2 = cx + r * Math.cos((end * Math.PI) / 180);
      const y2 = cy + r * Math.sin((end * Math.PI) / 180);
      const path =
        pct >= 0.9999
          ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + STATUS_COLORS[g.key] + '"/>'
          : '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
            ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + STATUS_COLORS[g.key] + '"/>';
      return { ...g, path };
    });

    $('#hiDonutEstados').innerHTML =
      '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:220px;height:220px;" role="img" aria-label="Distribución de estados">' +
      arcs.map((a) => a.path).join('') +
      '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" fill="#edf3ff" font-size="22" font-weight="700">' + fmt(total) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" fill="#a7b9d8" font-size="12">clientes</text>' +
      '</svg>';

    $('#hiLeyendaEstados').innerHTML = groups
      .map((g) => '<span><span class="dot" style="background:' + STATUS_COLORS[g.key] + '"></span>' + esc(STATUS_LABELS[g.key]) + ' · ' + fmt(g.value) + '</span>')
      .join('');
  }

  function barrasEstados(filas) {
    const max = Math.max.apply(
      null,
      filas.flatMap((f) => STATUS_KEYS.map((k) => (f.estados_cliente || {})[k] || 0)).concat([1])
    );
    return filas
      .map((f) => {
        const estados = f.estados_cliente || {};
        const segments = STATUS_KEYS
          .filter((k) => estados[k] > 0)
          .map((k) => {
            const pct = Math.round(((estados[k] || 0) / max) * 100);
            return '<div class="fill" style="width:' + pct + '%;background:' + STATUS_COLORS[k] + ';margin-right:2px;border-radius:4px;" title="' +
              esc(STATUS_LABELS[k] + ': ' + fmt(estados[k])) + '"></div>';
          })
          .join('');
        const total = STATUS_KEYS.reduce((a, k) => a + (estados[k] || 0), 0);
        return (
          '<div class="row"><div class="lbl" style="width:64px;">' + esc(diaCorto(f.dia)) + '</div>' +
          '<div class="track" style="background:transparent;display:flex;align-items:center;">' + segments + '</div>' +
          '<div class="bar-num" style="width:76px;">' + fmt(total) + '</div></div>'
        );
      })
      .join('');
  }

  function render() {
    const dias = Object.entries(datos.dias || {})
      .map(([dia, res]) => Object.assign({ dia }, res))
      .sort((a, b) => (a.dia < b.dia ? -1 : 1));
    if (!dias.length) return;

    const ultimo = dias[dias.length - 1];
    const totalTx = dias.reduce((a, d) => a + (d.transacciones || 0), 0);
    const moneyUltimo = moneyDelDia(ultimo);
    const ticketProm = ultimo.clientes.total ? moneyUltimo.total / ultimo.clientes.total : 0;

    $('#hiEstado').innerHTML =
      '<span class="dot" style="background:var(--green);margin-right:6px;"></span>' +
      '<strong>' + dias.length + '</strong> día(s) · ' + esc(dias[0].dia) + ' -> ' + esc(ultimo.dia) +
      (datos.actualizado ? ' · actualizado ' + esc(String(datos.actualizado).replace('T', ' ').slice(0, 16)) : '');

    const kpis = [
      ['Días registrados', fmt(dias.length), 'var(--text)'],
      ['Transacciones acumuladas', fmt(totalTx), 'var(--purple)'],
      ['Clientes únicos (' + diaCorto(ultimo.dia) + ')', fmt(ultimo.clientes.total), 'var(--green)'],
      ['Total por cliente (' + diaCorto(ultimo.dia) + ')', fmtMoney(ticketProm), 'var(--amber)'],
    ];
    $('#hiKpis').innerHTML = kpis
      .map(
        ([label, value, color]) =>
          '<div class="card"><div class="label">' + esc(label) + '</div>' +
          '<div class="value" style="color:' + color + ';">' + value + '</div></div>'
      )
      .join('');

    const VENTANA = 31;
    const visibles = dias.slice(-VENTANA);
    $('#hiBarrasTx').innerHTML = barsDias(
      visibles.map((d) => ({ label: diaCorto(d.dia), value: d.transacciones || 0 })),
      COLOR_TX
    );
    $('#hiBarrasClientes').innerHTML = barrasClientes(visibles);

    renderDonutEstados(ultimo.estados_cliente || {});
    $('#hiBarrasEstados').innerHTML = barrasEstados(visibles);

    $('#hiTabla tbody').innerHTML = dias
      .slice()
      .reverse()
      .map((d) => {
        const money = moneyDelDia(d);
        const estados = d.estados_cliente || {};
        return (
          '<tr><td><strong>' + esc(d.dia) + '</strong></td>' +
          '<td class="num">' + fmt(d.transacciones) + '</td>' +
          '<td class="num">' + fmt((d.conexion || {}).online) + '</td>' +
          '<td class="num">' + fmt((d.conexion || {}).retail) + '</td>' +
          '<td class="num"><span class="tag s-activo">' + fmt((d.clientes || {}).total) + '</span></td>' +
          '<td class="num">' + fmt((d.clientes || {}).online) + '</td>' +
          '<td class="num">' + fmt((d.clientes || {}).retail) + '</td>' +
          '<td class="num">' + fmt(estados.activo || 0) + '</td>' +
          '<td class="num">' + fmt(estados.inactivo || 0) + '</td>' +
          '<td class="num">' + fmtMoney(money.income) + '</td>' +
          '<td class="num">' + fmtMoney(money.total) + '</td></tr>'
        );
      })
      .join('');
  }

  async function cargar() {
    const seccion = $('#hiSeccion');
    try {
      datos = await fetchJson(DATA_URL);
      if (!datos || !datos.dias || !Object.keys(datos.dias).length) throw new Error('historial vacío');
      seccion.style.display = '';
      render();
    } catch (err) {
      seccion.style.display = 'none';
      console.warn('Historial no disponible:', err);
    }
  }

  const btn = $('#btnRefresh');
  if (btn) btn.addEventListener('click', cargar);
  cargar();
})();
