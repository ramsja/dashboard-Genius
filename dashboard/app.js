/* global DASHBOARD_CONFIG */
(function () {
  'use strict';

  const CONFIG = Object.assign(
    {
      snapshotUrl: './data/snapshot.json',
      fallbackSnapshotUrl: './data/snapshot.json',
      supabase: {
        enabled: false,
        url: '',
        anonKey: '',
        view: 'transaction_discipline_summary',
      },
    },
    window.DASHBOARD_CONFIG || {}
  );

  const CONNECTIONS = ['online', 'retail', 'desconocido'];
  const DISCIPLINES = ['casino', 'deportes', 'otros'];
  const CONNECTION_LABELS = { online: 'Online', retail: 'Retail', desconocido: 'Desconocido' };
  const DISCIPLINE_LABELS = { casino: 'Casino', deportes: 'Deportes', otros: 'Otros' };
  const STATUS_LABELS = {
    activo: 'Activos',
    inactivo: 'Inactivos',
    desconectado: 'Desconectados',
    suspendido: 'Suspendidos',
    otros: 'Otros',
  };
  const COLORS = {
    online: 'var(--green)',
    retail: 'var(--amber)',
    desconocido: 'var(--muted)',
    casino: 'var(--purple)',
    deportes: 'var(--blue)',
    otros: 'var(--muted)',
    activo: 'var(--green)',
    inactivo: 'var(--amber)',
    desconectado: 'var(--red)',
    suspendido: 'var(--blue)',
  };

  let state = { data: null, filter: 'all', source: 'none' };
  const els = {
    loading: document.getElementById('loading'),
    content: document.getElementById('content'),
    errorBox: document.getElementById('errorBox'),
    generatedAt: document.getElementById('generatedAt'),
    connMode: document.getElementById('connMode'),
    connDot: document.getElementById('connDot'),
  };

  // ---------- utilidades ----------
  const $ = (sel, parent) => (parent || document).querySelector(sel);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  const fmt = (n) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 0 }).format(n || 0);
  const fmtMoney = (n) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 2 }).format(n || 0);

  function setSource(label, color) {
    els.connMode.textContent = label;
    els.connDot.style.background = color;
    state.source = label;
  }

  function showError(message) {
    els.errorBox.style.display = 'block';
    els.errorBox.innerHTML =
      '<div class="error"><strong>No se pudieron cargar los datos.</strong><br>' +
      esc(message) +
      '</div>';
    els.content.style.display = 'none';
  }

  // ---------- carga de datos ----------
  async function fetchJson(url, timeoutMs, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 15000);
    try {
      const response = await fetch(url, Object.assign({ signal: controller.signal }, options || {}));
      if (!response.ok) throw new Error('HTTP ' + response.status + ' en ' + url);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadFromSupabase() {
    const cfg = CONFIG.supabase;
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) return null;
    const endpoint =
      cfg.url.replace(/\/$/, '') +
      '/rest/v1/' + cfg.view +
      '?select=discipline,client_status,connection,records,total,income';
    const rows = await fetchJson(endpoint, 20000, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        Accept: 'application/json',
      },
    });
    return buildSnapshotFromRows(rows);
  }

  function buildSnapshotFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const data = {
      version: 2,
      generated_at: new Date().toISOString(),
      source: 'Supabase REST',
      total: 0,
      discipline: { casino: 0, deportes: 0, otros: 0 },
      connection: { online: 0, retail: 0, desconocido: 0 },
      status: { activo: 0, inactivo: 0, desconectado: 0, suspendido: 0, otros: 0 },
      matrix: {},
      money: {},
      top_products: [],
    };
    DISCIPLINES.forEach((d) => (data.matrix[d] = { online: 0, retail: 0, desconocido: 0, total: 0, status: {} }));
    rows.forEach((r) => {
      const discipline = String(r.discipline || 'otros');
      const status = String(r.client_status || 'otros');
      const connection = String(r.connection || 'desconocido');
      const records = Number(r.records || 0);
      const total = Number(r.total || 0);
      const income = Number(r.income || 0);

      data.total += records;
      data.discipline[discipline] = (data.discipline[discipline] || 0) + records;
      data.connection[connection] = (data.connection[connection] || 0) + records;
      data.status[status] = (data.status[status] || 0) + records;

      const m = data.matrix[discipline] || (data.matrix[discipline] = { online: 0, retail: 0, desconocido: 0, total: 0, status: {} });
      m[connection] += records;
      m.total += records;
      m.status[status] = (m.status[status] || 0) + records;

      const money = data.money[discipline] || (data.money[discipline] = { income: 0, total: 0, commission: 0 });
      money.income += income;
      money.total += total;
    });
    return data;
  }

  async function loadData() {
    els.loading.style.display = 'block';
    els.content.style.display = 'none';
    els.errorBox.style.display = 'none';
    try {
      try {
        const data = await loadFromSupabase();
        if (data) {
          state.data = data;
          setSource('Supabase · en vivo', 'var(--green)');
          return render();
        }
      } catch (err) {
        console.warn('Supabase no disponible, se usa JSON estático:', err);
      }
      const fallback = await fetchJson(CONFIG.snapshotUrl, 15000);
      state.data = fallback;
      setSource('JSON estático', 'var(--blue)');
      render();
    } catch (err) {
      showError(err.message);
    } finally {
      els.loading.style.display = 'none';
    }
  }

  // ---------- render ----------
  function render() {
    const data = state.data;
    if (!data) return showError('Sin datos.');
    const filter = state.filter;

    const totals = computeFilteredTotals(data, filter);

    els.generatedAt.textContent = 'Actualizado: ' + (data.generated_at ? data.generated_at.replace('T', ' ').slice(0, 19) : '-');
    renderKpis(totals, data);
    renderDisciplineChart(totals);
    renderConnectionChart(data, filter);
    renderMatrixChart(data, filter);
    renderMatrixTable(data, filter);
    renderMoneyTable(data);
    renderProducts(data);
    renderStatusChart(data);
  }

  function computeFilteredTotals(data, filter) {
    if (filter === 'all') {
      return { connection: data.connection, discipline: data.discipline, total: data.total };
    }
    const total = data.connection[filter] || 0;
    const discipline = {};
    DISCIPLINES.forEach((d) => {
      const m = data.matrix[d] || {};
      discipline[d] = m[filter] || 0;
    });
    return { connection: { [filter]: total }, discipline, total };
  }

  function renderKpis(totals, data) {
    const statuses = [
      ['activo', 'Activos', 'green'],
      ['inactivo', 'Inactivos', 'amber'],
    ];
    const cards = [
      { label: 'Transacciones', value: fmt(totals.total), color: 'var(--text)', sub: 'registros procesados' },
      ...statuses.map(([key, label, color]) => ({
        label,
        value: fmt(data.status[key] || 0),
        color: 'var(--' + color + ')',
        sub: 'de ' + fmt(totals.total) + ' registros',
      })),
      {
        label: 'Volumen total',
        value: '$' + fmtMoney(sumMoney(data, 'total')),
        color: 'var(--amber)',
        sub: 'suma de Total',
      },
      {
        label: 'Ingresos',
        value: '$' + fmtMoney(sumMoney(data, 'income')),
        color: 'var(--green)',
        sub: 'suma de Ingresos',
      },
    ];
    const kpis = $('#kpis');
    kpis.innerHTML = cards
      .map(
        (c) =>
          '<div class="card"><div class="label">' + c.label + '</div>' +
          '<div class="value" style="color:' + c.color + ';">' + c.value + '</div>' +
          (c.sub ? '<div class="sub">' + esc(c.sub) + '</div>' : '') +
          '</div>'
      )
      .join('');
  }

  function sumMoney(data, key) {
    return Object.values(data.money || {}).reduce((acc, m) => acc + (m[key] || 0), 0);
  }

  function renderBars(el, items, color, max) {
    const top = max || Math.max.apply(null, items.map((i) => i.value).filter((v) => v > 0));
    el.innerHTML = items
      .map((i) => {
        const pct = top > 0 ? Math.round((i.value / top) * 100) : 0;
        return (
          '<div class="row"><div class="lbl">' + esc(i.label) + '</div>' +
          '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + color + ';" title="' + fmt(i.value) + '">' +
          (pct >= 14 ? fmt(i.value) : '') +
          '</div></div></div>'
        );
      })
      .join('');
  }

  function renderDisciplineChart(totals) {
    const items = DISCIPLINES.map((d) => ({ label: DISCIPLINE_LABELS[d], value: totals.discipline[d] || 0 })).filter((i) => i.value > 0);
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    renderBars($('#chartDiscipline'), items, 'var(--purple)', max);
  }

  function renderConnectionChart(data, filter) {
    const el = $('#chartConnection');
    const legendEl = $('#legendConnection');
    if (filter !== 'all') {
      el.innerHTML = '';
      legendEl.innerHTML = '';
      return;
    }
    const total = data.total || 1;
    const groups = CONNECTIONS.map((c) => ({ key: c, value: data.connection[c] || 0 })).filter((g) => g.value > 0);
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
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[g.key]}"/>`
          : `<path d="M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${COLORS[g.key]}"/>`;
      return { ...g, path };
    });
    el.innerHTML =
      `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Distribución por conexión">` +
      arcs.map((a) => a.path).join('') +
      `<text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#edf3ff" font-size="22" font-weight="700">${fmt(total)}</text>` +
      `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#a7b9d8" font-size="12">registros</text>` +
      '</svg>';
    legendEl.innerHTML = groups
      .map((g) => `<span><span class="dot" style="background:${COLORS[g.key]}"></span>${CONNECTION_LABELS[g.key]} · ${fmt(g.value)}</span>`)
      .join('');
  }

  function renderMatrixChart(data, filter) {
    const groups = DISCIPLINES.map((d) => {
      const m = data.matrix[d] || { online: 0, retail: 0, desconocido: 0, total: 0 };
      const value = filter === 'all' ? m.total : m[filter] || 0;
      return { key: d, label: DISCIPLINE_LABELS[d], value };
    }).filter((g) => g.value > 0);
    const max = Math.max.apply(null, groups.map((g) => g.value));
    renderBars($('#chartMatrix'), groups, 'var(--blue)', max);
  }

  function renderMatrixTable(data, filter) {
    const body = $('#matrixTable');
    const footer = $('#matrixFooter');
    const col = filter === 'all' ? null : filter;
    const acc = { online: 0, retail: 0, desconocido: 0, total: 0 };
    body.innerHTML = DISCIPLINES.map((d) => {
      const m = data.matrix[d] || { online: 0, retail: 0, desconocido: 0, total: 0, status: {} };
      Object.keys(acc).forEach((k) => (acc[k] += k === 'total' ? m.total : col ? m[col] || 0 : m[k] || 0));
      const statusKey = topStatus(m.status || data.status);
      const row =
        `<td><span class="tag d-${d}">${DISCIPLINE_LABELS[d]}</span></td>` +
        (col ? '' : `<td class="num">${fmt(m.online)}</td><td class="num">${fmt(m.retail)}</td><td class="num">${fmt(m.desconocido)}</td>`) +
        `<td class="num">${fmt(m.total)}</td>` +
        `<td><span class="tag s-${statusKey}">${esc(STATUS_LABELS[statusKey] || '—')}</span></td>`;
      return `<tr>${row}</tr>`;
    }).join('');
    const footerRow =
      `<td>Total</td>` +
      (col ? '' : `<td class="num">${fmt(acc.online)}</td><td class="num">${fmt(acc.retail)}</td><td class="num">${fmt(acc.desconocido)}</td>`) +
      `<td class="num">${fmt(acc.total)}</td><td></td>`;
    footer.innerHTML = `<tr>${footerRow}</tr>`;
  }

  function topStatus(statuses) {
    if (!statuses) return 'otros';
    const entries = Object.entries(statuses).sort((a, b) => b[1] - a[1]);
    return entries.length ? entries[0][0] : 'otros';
  }

  function renderMoneyTable(data) {
    const rows = DISCIPLINES.filter((d) => data.money[d]).map(
      (d) =>
        `<tr><td><span class="tag d-${d}">${DISCIPLINE_LABELS[d]}</span></td>` +
        `<td class="num">$${fmtMoney(data.money[d].income)}</td>` +
        `<td class="num">$${fmtMoney(data.money[d].total)}</td>` +
        `<td class="num">$${fmtMoney(data.money[d].commission)}</td></tr>`
    );
    const income = sumMoney(data, 'income');
    const total = sumMoney(data, 'total');
    const commission = sumMoney(data, 'commission');
    $('#moneyTable').innerHTML =
      rows.join('') +
      `<tr class="total-row"><td><strong>Total</strong></td><td class="num"><strong>$${fmtMoney(income)}</strong></td>` +
      `<td class="num"><strong>$${fmtMoney(total)}</strong></td><td class="num"><strong>$${fmtMoney(commission)}</strong></td></tr>`;
  }

  function renderProducts(data) {
    const top = (data.top_products || []).map((pair) => ({ label: pair[0], value: pair[1] }));
    const max = Math.max.apply(null, top.map((i) => i.value).concat([1]));
    renderBars($('#chartProducts'), top.slice(0, 8), 'var(--pink)', max);
  }

  function renderStatusChart(data) {
    const items = Object.entries(STATUS_LABELS)
      .map(([key, label]) => ({ label, value: data.status[key] || 0 }))
      .filter((i) => i.value > 0);
    const max = Math.max.apply(null, items.map((i) => i.value).concat([1]));
    renderBars($('#chartStatus'), items, 'var(--green)', max);
  }

  // ---------- filtros ----------
  function bindControls() {
    $('#btnRefresh').addEventListener('click', loadData);
    $('#btnFilter').addEventListener('click', function () {
      const next = state.filter === 'all' ? 'online' : state.filter === 'online' ? 'retail' : 'all';
      state.filter = next;
      const labels = { all: 'Todas las conexiones', online: 'Solo Online', retail: 'Solo Retail' };
      this.textContent = labels[next];
      this.classList.toggle('active', next !== 'all');
      render();
    });
  }

  bindControls();
  loadData();
})();