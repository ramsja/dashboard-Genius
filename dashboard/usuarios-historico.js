/* Sección de usuarios históricos.
   Lee ./data/usuarios-historico.json y muestra KPIs, canal, estado y top usuarios. */
(function () {
  'use strict';

  const DATA_URL = './data/usuarios-historico.json';

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

  const CANAL_COLORS = {
    online: 'var(--green)',
    retail: 'var(--amber)',
    desconocido: 'var(--muted)',
  };

  const ESTADO_COLORS = {
    activo: 'var(--green)',
    inactivo: 'var(--amber)',
    desconectado: 'var(--red)',
    suspendido: 'var(--blue)',
    otros: 'var(--muted)',
  };

  const ESTADO_LABELS = {
    activo: 'Activo',
    inactivo: 'Inactivo',
    desconectado: 'Desconectado',
    suspendido: 'Suspendido',
    otros: 'Otros',
  };

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

  function renderBars(el, items, colorMap) {
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    el.innerHTML = items
      .map((i) => {
        const pct = max > 0 ? Math.round((i.value / max) * 100) : 0;
        return (
          '<div class="row"><div class="lbl" style="width:96px;">' + esc(i.label) + '</div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + (colorMap[i.key] || 'var(--purple)') + ';" title="' +
          esc(fmt(i.value)) + '"></div></div>' +
          '<div class="bar-num" style="width:64px;">' + fmt(i.value) + '</div></div>'
        );
      })
      .join('');
  }

  function render(data) {
    const usuarios = Object.entries(data.usuarios || {});
    if (!usuarios.length) return;

    const canalCounts = { online: 0, retail: 0, desconocido: 0 };
    const estadoCounts = { activo: 0, inactivo: 0, desconectado: 0, suspendido: 0, otros: 0 };
    let totalApuesta = 0;
    let totalGanancia = 0;
    let totalTx = 0;

    const rows = usuarios.map(([id, u]) => {
      canalCounts[u.canal || 'desconocido'] = (canalCounts[u.canal || 'desconocido'] || 0) + 1;
      estadoCounts[u.estado_actual || 'otros'] = (estadoCounts[u.estado_actual || 'otros'] || 0) + 1;
      totalApuesta += u.apuesta_total || 0;
      totalGanancia += u.ganancia_neta || 0;
      totalTx += u.transacciones || 0;
      return { id, ...u };
    });

    const top = rows
      .slice()
      .sort((a, b) => b.transacciones - a.transacciones)
      .slice(0, 10);

    const dias = data.dias_disponibles || [];
    $('#usEstado').innerHTML =
      '<span class="dot" style="background:var(--blue);margin-right:6px;"></span>' +
      '<strong>' + fmt(usuarios.length) + '</strong> usuarios · ' +
      (dias.length ? dias[0] + ' -> ' + dias[dias.length - 1] : '') +
      (data.actualizado ? ' · actualizado ' + esc(String(data.actualizado).replace('T', ' ').slice(0, 16)) : '');

    const kpis = [
      ['Usuarios únicos', fmt(usuarios.length), 'var(--text)'],
      ['Transacciones', fmt(totalTx), 'var(--purple)'],
      ['Apuesta total', fmtMoney(totalApuesta), 'var(--amber)'],
      ['Ganancia neta', fmtMoney(totalGanancia), totalGanancia >= 0 ? 'var(--green)' : 'var(--red)'],
    ];
    $('#usKpis').innerHTML = kpis
      .map(
        ([label, value, color]) =>
          '<div class="card"><div class="label">' + esc(label) + '</div>' +
          '<div class="value" style="color:' + color + ';">' + value + '</div></div>'
      )
      .join('');

    $('#usTabla tbody').innerHTML = top
      .map((u) => {
        const tagClass = u.canal === 'online' ? 'c-online' : u.canal === 'retail' ? 'c-retail' : 'c-desconocido';
        return (
          '<tr><td><strong>' + esc(u.usuario || u.id) + '</strong></td>' +
          '<td class="num">' + fmt(u.transacciones) + '</td>' +
          '<td class="num">' + fmt(u.dias_activos) + '</td>' +
          '<td class="num">' + fmtMoney(u.apuesta_total) + '</td>' +
          '<td class="num" style="color:' + ((u.ganancia_neta || 0) >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + fmtMoney(u.ganancia_neta) + '</td>' +
          '<td><span class="tag ' + tagClass + '">' + esc(u.canal || 'desconocido') + '</span></td></tr>'
        );
      })
      .join('');

    renderBars(
      $('#usBarrasCanal'),
      Object.entries(canalCounts)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({ key, label: key, value })),
      CANAL_COLORS
    );

    renderBars(
      $('#usBarrasEstado'),
      Object.entries(estadoCounts)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({ key, label: ESTADO_LABELS[key] || key, value })),
      ESTADO_COLORS
    );
  }

  async function cargar() {
    const seccion = $('#usSeccion');
    try {
      const data = await fetchJson(DATA_URL);
      if (!data || !data.usuarios || !Object.keys(data.usuarios).length) throw new Error('sin usuarios');
      seccion.style.display = '';
      render(data);
    } catch (err) {
      seccion.style.display = 'none';
      console.warn('Usuarios históricos no disponibles:', err);
    }
  }

  const btn = $('#btnRefresh');
  if (btn) btn.addEventListener('click', cargar);
  cargar();
})();
