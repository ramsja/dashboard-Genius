/* Historial diario de transacciones y clientes únicos.
   Lee ./data/historico.json (generado por construir-historico.py).
   Sin dependencias: barras div + tabla, mismo estilo del panel. */
(function () {
  'use strict';

  const DATA_URL = './data/historico.json';
  const COLOR_TX = 'var(--purple)';
  const COLOR_ONLINE = 'var(--green)';
  const COLOR_RETAIL = 'var(--amber)';

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
    // Una fila por día con barra doble normalizada al máximo de clientes.
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
      '<strong>' + dias.length + '</strong> día(s) · ' + esc(dias[0].dia) + ' → ' + esc(ultimo.dia) +
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

    $('#hiTabla tbody').innerHTML = dias
      .slice()
      .reverse()
      .map((d) => {
        const money = moneyDelDia(d);
        return (
          '<tr><td><strong>' + esc(d.dia) + '</strong></td>' +
          '<td class="num">' + fmt(d.transacciones) + '</td>' +
          '<td class="num">' + fmt((d.conexion || {}).online) + '</td>' +
          '<td class="num">' + fmt((d.conexion || {}).retail) + '</td>' +
          '<td class="num"><span class="tag s-activo">' + fmt((d.clientes || {}).total) + '</span></td>' +
          '<td class="num">' + fmt((d.clientes || {}).online) + '</td>' +
          '<td class="num">' + fmt((d.clientes || {}).retail) + '</td>' +
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
