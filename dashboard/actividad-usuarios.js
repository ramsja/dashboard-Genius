(function () {
  'use strict';

  const URL = './data/actividad-usuarios.json';
  const $ = (sel, parent) => (parent || document).querySelector(sel);
  const fmt = (n) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n || 0);
  const fmtMoney = (n) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(n || 0);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const seccion = $('#auSeccion');
  const estado = $('#auEstado');
  const kpis = $('#auKpis');
  const tablaApostadores = $('#auTablaApostadores tbody');
  const tablaPerdidas = $('#auTablaPerdidas tbody');

  if (!seccion) return;

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return dateStr.replace('T', ' ').slice(0, 16);
  }

  function renderKpis(data) {
    const cards = [
      { label: 'Usuarios únicos', value: fmt(data.resumen.total_usuarios), color: 'var(--text)' },
      { label: 'Activos hoy', value: fmt(data.resumen.usuarios_activos_hoy), color: 'var(--green)' },
      { label: 'Volumen apostado', value: '$' + fmtMoney(data.resumen.volumen_total_apostado), color: 'var(--amber)' },
      { label: 'Pérdida neta total', value: '$' + fmtMoney(data.resumen.perdida_neta_total), color: 'var(--red)' },
    ];
    kpis.innerHTML = cards.map(c =>
      `<div class="card"><div class="label">${c.label}</div><div class="value" style="color:${c.color};">${c.value}</div></div>`
    ).join('');
  }

  function renderTablaApostadores(data) {
    tablaApostadores.innerHTML = data.top_apostadores.map((u, i) =>
      `<tr>
        <td>${i + 1}</td>
        <td>${esc(u.usuario)}</td>
        <td class="num">$${fmtMoney(u.total_apostado)}</td>
        <td class="num">${fmt(u.transacciones)}</td>
        <td><span class="tag d-${u.tipo.includes('Online') ? 'casino' : 'deportes'}">${esc(u.tipo.replace('Player ', ''))}</span></td>
        <td style="font-size:12px;">${formatDate(u.ultima_actividad)}</td>
      </tr>`
    ).join('');
  }

  function renderTablaPerdidas(data) {
    tablaPerdidas.innerHTML = data.top_perdidas.map((u, i) =>
      `<tr>
        <td>${i + 1}</td>
        <td>${esc(u.usuario)}</td>
        <td class="num" style="color:var(--red);">$${fmtMoney(u.perdida_neta)}</td>
        <td class="num">$${fmtMoney(u.total_apostado)}</td>
        <td class="num" style="color:var(--green);">$${fmtMoney(u.total_ganado)}</td>
        <td><span class="tag d-${u.tipo.includes('Online') ? 'casino' : 'deportes'}">${esc(u.tipo.replace('Player ', ''))}</span></td>
      </tr>`
    ).join('');
  }

  async function load() {
    try {
      const res = await fetch(URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      seccion.style.display = '';
      estado.textContent = 'Actualizado: ' + (data.generated_at ? data.generated_at.replace('T', ' ').slice(0, 19) : '-');

      renderKpis(data);
      renderTablaApostadores(data);
      renderTablaPerdidas(data);
    } catch (err) {
      console.warn('No se pudo cargar actividad-usuarios.json:', err);
      seccion.style.display = 'none';
    }
  }

  load();
})();
