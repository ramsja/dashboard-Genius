/* global Chart */
(function () {
  'use strict';

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js no cargó; la pestaña de cálculos no puede graficar.');
    return;
  }

  Chart.defaults.color = '#a7b9d8';
  Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
  Chart.defaults.font.family = '"Segoe UI",Arial,sans-serif';

  const GOLD = '#f5b942';
  const GREEN = '#30c48d';
  const RED = '#f87171';
  const nf = new Intl.NumberFormat('es-MX');
  const $ = (id) => document.getElementById(id);
  const fmtK = (v) =>
    v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v;

  const anios = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033'];
  const mercadoObs = [64.0, 72.0, 73.4, 76.8, 79.2, 88.0, null, null, null, null, null, null, null, null];
  const mercadoPro = [null, null, null, null, null, 88.0, 97.7, 108.4, 120.4, 133.6, 148.3, 164.6, 182.7, 202.8];
  const segmento = { labels: ['Apuestas deportivas', 'Casino online', 'Póker', 'Bingo', 'Otros'], data: [50, 32, 8, 6, 4] };
  const region = { labels: ['Europa', 'Norteamérica', 'Asia-Pacífico', 'Latinoamérica', 'África y Med. Oriente'], data: [41, 26, 19, 8, 6] };
  const device = { labels: ['Móvil / tablet', 'Escritorio'], data: [57, 43] };
  const operadores = {
    labels: ['Betsson', 'evoke (888)', 'Evolution (B2B)', 'Bet365', 'DraftKings', 'Entain', 'Flutter'],
    data: [1.2, 1.7, 2.0, 5.45, 6.3, 6.4, 16.3],
  };
  const ma = { labels: ['DraftKings–Jackpocket', 'Flutter–Snaitech', 'FDJ–Kindred'], data: [0.75, 2.5, 2.8] };

  let UMB = { top5GlobalM: 1700, top5LatAmM: 250, crecimientoUmbralPct: 8 };
  const OPZ_M = { Betsson: 1200, 'evoke (888)': 1700, 'Evolution (B2B)': 2000 };
  const GEM_KEY = 'geniusbetV1';
  const gemDef = { ingresoAnualM: 10, crecimientoPct: 70 };
  let GEM = { ...gemDef };
  try {
    GEM = { ...gemDef, ...(JSON.parse(localStorage.getItem(GEM_KEY) || '{}')) };
  } catch (e) {
    GEM = { ...gemDef };
  }

  let KPI_REF = [
    { n: 'iGaming EE.UU.', v: 27.6, ref: 'AGA 2025 · 7 estados' },
    { n: 'Casino en vivo', v: 24.0, ref: 'CAGR Evolution 2019–23' },
    { n: 'Sportsbook global', v: 14.0, ref: 'Track360 2026' },
    { n: 'Mercado global online', v: 11.0, ref: 'GVR 2026–2033 (CAGR)' },
    { n: 'Asia-Pacífico (región líder)', v: 9.2, ref: 'IMARC · región más rápida' },
    { n: 'Casino físico (referencia)', v: 4.5, ref: 'crecimiento tradicional' },
  ];
  let RIESGOS = [
    { r: 'Regulatorio: impuestos y licencias (BR · EE.UU. · SV)', p: 'Alta', i: 'Alto', m: 'Diversificar jurisdicciones · reserva de compliance' },
    { r: 'CAC creciente (+60% en gaming en 2 años)', p: 'Alta', i: 'Alto', m: 'SEO/contenido propio, referidos, priorizar retención' },
    { r: 'Abuso de bonos y fraude (64% del fraude iGaming)', p: 'Alta', i: 'Medio', m: 'KYC reforzado, límites de bono, detección con IA' },
    { r: 'Concentración: Flutter/DraftKings dominan el marketing', p: 'Media', i: 'Alto', m: 'Nichos regionales, apuestas locales, comunidad' },
    { r: 'Dependencia de proveedores (Evolution, plataforma)', p: 'Media', i: 'Medio', m: 'Estrategia multi-proveedor con cláusulas de salida' },
    { r: 'Ciberseguridad y lavado de dinero (AML)', p: 'Media', i: 'Alto', m: 'Certificaciones, pentests, monitoreo transaccional' },
    { r: 'Tipo de cambio y macro en mercados emergentes (SV/BR/KE)', p: 'Media', i: 'Medio', m: 'Cobertura cambiaria, precios en moneda local' },
    { r: 'Juego responsable y reputación', p: 'Media', i: 'Alto', m: 'Autoexclusión, límites de depósito, transparencia' },
  ];
  const NIV = { Alta: 'warn', Alto: 'warn', Media: 'gold', Medio: 'gold', Baja: '', Bajo: '' };

  let charts = null;

  function mkDonut(id, datos, colores) {
    return new Chart(document.getElementById(id), {
      type: 'doughnut',
      data: {
        labels: datos.labels,
        datasets: [{ data: datos.data, backgroundColor: colores, borderColor: '#0b1020', borderWidth: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + c.parsed + '%' } },
        },
      },
    });
  }

  function aniosPara(baseM, umbralM, g) {
    const r = (1 + g) / (1 + UMB.crecimientoUmbralPct / 100);
    if (r <= 1) return Infinity;
    return Math.log(umbralM / baseM) / Math.log(r);
  }

  function recalcular() {
    if (!charts) return;
    const CF = +$('inCF').value;
    const ARPU = +$('inARPU').value;
    const cv = +$('inCV').value / 100;
    const imp = +$('inIMP').value / 100;
    const CAC = +$('inCAC').value;
    const VIDA = +$('inVIDA').value;

    $('vCF').textContent = '$' + nf.format(CF);
    $('vARPU').textContent = '$' + nf.format(ARPU);
    $('vCV').textContent = Math.round(cv * 100) + '%';
    $('vIMP').textContent = Math.round(imp * 100) + '%';
    $('vCAC').textContent = '$' + nf.format(CAC);
    $('vVIDA').textContent = VIDA + ' meses';

    const margenPct = 1 - cv - imp;
    const mcUnit = ARPU * margenPct;
    const bep = margenPct > 0 ? CF / mcUnit : Infinity;
    const ltv = mcUnit * VIDA;
    const ratio = ltv / CAC;
    const payback = mcUnit > 0 ? CAC / mcUnit : Infinity;

    $('kBEP').textContent = margenPct > 0 ? nf.format(Math.ceil(bep)) + ' jugadores' : 'Inalcanzable';
    $('kIngBEP').textContent = '$' + nf.format(Math.round(bep * ARPU));
    $('kMC').textContent = Math.round(margenPct * 100) + '% · $' + nf.format(Math.round(mcUnit)) + '/jug.';
    $('kLTV').textContent = '$' + nf.format(Math.round(ltv));
    const rEl = $('kRatio');
    rEl.textContent = ratio.toFixed(1) + ' : 1';
    rEl.className = 'ck-v ' + (ratio >= 3 ? 'green' : ratio >= 1.5 ? 'gold' : 'red');
    const p = $('kPay');
    p.textContent = payback.toFixed(1) + ' meses';
    p.className = 'ck-v ' + (payback <= 6 ? 'green' : payback <= 12 ? 'gold' : 'red');

    const maxJ = Math.max(Math.ceil(bep * 2), 200);
    const paso = Math.max(Math.round(maxJ / 40), 1);
    const ing = [];
    const cos = [];
    for (let j = 0; j <= maxJ; j += paso) {
      ing.push({ x: j, y: j * ARPU });
      cos.push({ x: j, y: CF + j * ARPU * (cv + imp) });
    }
    charts.bep.data.datasets[0].data = ing;
    charts.bep.data.datasets[1].data = cos;
    charts.bep.data.datasets[2].data = [{ x: Math.ceil(bep), y: bep * ARPU }];
    charts.bep.update();

    const colPct = [50, 55, 60, 65, 70];
    const filARPU = [200, 250, 300, 350, 400];
    const cargaTotal = Math.round((cv + imp) * 100);
    let html = '<tr><th>ARPU ↓ / Carga total % →</th>' + colPct.map((c) => '<th>' + c + '%</th>').join('') + '</tr>';
    filARPU.forEach((a) => {
      html +=
        '<tr><td style="text-align:left">$' +
        a +
        '</td>' +
        colPct
          .map((c) => {
            const m = 1 - c / 100;
            const val = m > 0 ? Math.ceil(CF / (a * m)) : '∞';
            const hl = a === Math.min(400, Math.max(200, Math.round(ARPU / 50) * 50)) && Math.abs(c - cargaTotal) <= 2;
            return '<td class="' + (hl ? 'hl' : '') + '">' + (typeof val === 'number' ? nf.format(val) : val) + '</td>';
          })
          .join('') +
        '</tr>';
    });
    $('tbSens').innerHTML = html;
    gemRecalc();
  }

  function gemRecalc() {
    if (!charts) return;
    const base = +$('gIngreso').value;
    const g = +$('gCrecimiento').value / 100;
    const ARPU = +$('inARPU').value;
    const CAC = +$('inCAC').value;
    GEM = { ingresoAnualM: base, crecimientoPct: Math.round(g * 100) };
    try {
      localStorage.setItem(GEM_KEY, JSON.stringify(GEM));
    } catch (e) {}

    $('vgIng').textContent = '$' + nf.format(base) + ' M';
    $('vgCrec').textContent = Math.round(g * 100) + '%';

    const aL = aniosPara(base, UMB.top5LatAmM, g);
    const aG = aniosPara(base, UMB.top5GlobalM, g);
    const eL = $('gkLatAm');
    const eG = $('gkGlobal');
    eL.textContent = base >= UMB.top5LatAmM ? '✓ ya lo superas' : isFinite(aL) && aL > 0 ? aL.toFixed(1) + ' años' : 'no alcanza a este ritmo';
    eL.className = 'ck-v gold';
    eG.textContent = base >= UMB.top5GlobalM ? '✓ ya lo superas' : isFinite(aG) && aG > 0 ? aG.toFixed(1) + ' años' : 'solo vía M&A';
    eG.className = 'ck-v ' + (base >= UMB.top5GlobalM || (isFinite(aG) && aG > 0 && aG <= 12) ? 'green' : 'red');

    const jug = (base * 1e6) / 12 / ARPU;
    $('gkJug').textContent = nf.format(Math.round(jug));
    const mkt = CAC * jug * 1.5;
    $('gkMkt').textContent = mkt >= 1e6 ? '$' + (mkt / 1e6).toFixed(1) + ' M' : '$' + nf.format(Math.round(mkt / 1000)) + 'k';
    const y5 = base * Math.pow(1 + g, 5);
    $('gk5y').textContent = y5 >= 1000 ? '$' + (y5 / 1000).toFixed(2) + ' B' : '$' + nf.format(Math.round(y5)) + ' M';

    $('gTablaIng').textContent = '$' + nf.format(base) + ' M';
    const tc = $('gTablaCrec');
    tc.textContent = '+' + Math.round(g * 100) + '%';
    tc.className = 'tag gold';
    $('gTablaNota').textContent =
      base >= UMB.top5LatAmM
        ? '¡Ya en el Top 5 LatAm!'
        : jug >= 20000
          ? isFinite(aL) && aL > 0
            ? 'En ruta: ' + aL.toFixed(1) + ' años al Top 5 LatAm'
            : 'escala insuficiente'
          : 'Fase 1 · Despegue (validar BEP local)';

    const zLabels = ['GeniusBet', ...Object.keys(OPZ_M)];
    const zData = [base, ...Object.values(OPZ_M)];
    charts.geniusbet.data.labels = zLabels;
    charts.geniusbet.data.datasets[0].data = zData;
    charts.geniusbet.data.datasets[0].backgroundColor = zData.map((_, i) => (i === 0 ? GOLD : 'rgba(48,196,141,.45)'));
    charts.geniusbet.update();

    const y0 = 2026;
    const N = 12;
    const gArr = [];
    const aGlo = [];
    const aLat = [];
    const ref = [];
    for (let t = 0; t < N; t++) {
      gArr.push(base * Math.pow(1 + g, t));
      const f = Math.pow(1 + UMB.crecimientoUmbralPct / 100, t);
      aGlo.push(UMB.top5GlobalM * f);
      aLat.push(UMB.top5LatAmM * f);
      ref.push(1200 * f);
    }
    charts.ruta.data.labels = Array.from({ length: N }, (_, t) => String(y0 + t));
    charts.ruta.data.datasets[0].data = gArr;
    charts.ruta.data.datasets[1].data = aGlo;
    charts.ruta.data.datasets[2].data = aLat;
    charts.ruta.data.datasets[3].data = ref;
    charts.ruta.update();
    renderKpis();
  }

  function renderKpis() {
    if (!charts) return;
    const filas = [{ n: '🚀 GeniusBet (tu escenario)', v: GEM.crecimientoPct, ref: 'tu control en «Ruta al Top 5»' }, ...KPI_REF];
    charts.kpis.data.labels = filas.map((f) => f.n);
    charts.kpis.data.datasets[0].data = filas.map((f) => f.v);
    charts.kpis.data.datasets[0].backgroundColor = filas.map((f, i) =>
      i === 0 ? GOLD : f.n.indexOf('físico') >= 0 ? '#94a3b8' : 'rgba(96,165,250,.65)'
    );
    charts.kpis.update();
    $('tbKpis').innerHTML =
      '<tr><th>Indicador</th><th class="num">Ritmo</th><th>Referencia</th></tr>' +
      filas
        .map(
          (f) =>
            '<tr' +
            (f.n.indexOf('GeniusBet') >= 0 ? ' style="background:rgba(245,185,66,.07)"' : '') +
            '><td>' +
            f.n +
            '</td><td class="num">' +
            f.v +
            '% / año</td><td>' +
            f.ref +
            '</td></tr>'
        )
        .join('');
  }

  function renderRiesgos() {
    $('tbRiesgos').innerHTML =
      '<tr><th>Riesgo</th><th>Probabilidad</th><th>Impacto</th><th>Mitigación</th></tr>' +
      RIESGOS.map(
        (x) =>
          '<tr><td>' +
          x.r +
          '</td><td><span class="tag ' +
          (NIV[x.p] || '') +
          '">' +
          x.p +
          '</span></td><td><span class="tag ' +
          (NIV[x.i] || '') +
          '">' +
          x.i +
          '</span></td><td>' +
          x.m +
          '</td></tr>'
      ).join('');
  }

  function aplicarDatosExternos(d) {
    if (d.mercado) {
      if (d.mercado.y2025 != null) $('v2025').textContent = '$' + d.mercado.y2025 + ' B';
      if (d.mercado.y2026 != null) $('v2026').textContent = '$' + d.mercado.y2026 + ' B';
      if (d.mercado.cagr != null) {
        $('vCAGR').textContent = d.mercado.cagr + '%';
        $('d2026').textContent = '+' + d.mercado.cagr + '% interanual';
      }
      if (d.mercado.y2033 != null) $('v2033').textContent = '$' + d.mercado.y2033 + ' B';
    }
    if (d.serieMercado && charts && charts.crecimiento) {
      charts.crecimiento.data.labels = d.serieMercado.anios;
      charts.crecimiento.data.datasets[0].data = d.serieMercado.obs;
      charts.crecimiento.data.datasets[1].data = d.serieMercado.pro;
      charts.crecimiento.update();
    }
    if (d.operadores && charts && charts.operadores) {
      const entries = Object.entries(d.operadores).sort((a, b) => a[1] - b[1]);
      charts.operadores.data.labels = entries.map((e) => e[0]);
      charts.operadores.data.datasets[0].data = entries.map((e) => e[1]);
      charts.operadores.data.datasets[0].backgroundColor = entries.map((e) =>
        e[1] >= 16 ? GOLD : e[1] >= 5 ? 'rgba(245,185,66,.55)' : 'rgba(48,196,141,.45)'
      );
      charts.operadores.update();
    }
    if (d.umbrales) UMB = { ...UMB, ...d.umbrales };
    if (Array.isArray(d.kpis) && d.kpis.length) KPI_REF = d.kpis;
    if (Array.isArray(d.riesgos) && d.riesgos.length) RIESGOS = d.riesgos;
    if (d.geniusbet && !localStorage.getItem(GEM_KEY)) {
      $('gIngreso').value = Math.min(500, Math.max(1, d.geniusbet.ingresoAnualM || 10));
      $('gCrecimiento').value = Math.min(150, Math.max(20, d.geniusbet.crecimientoPct || 70));
    }
    gemRecalc();
    renderKpis();
    renderRiesgos();
  }

  async function buscarActualizaciones() {
    const chip = $('chipDatos');
    if (!/^https?:/.test(location.protocol)) {
      chip.textContent = 'Modo archivo local · sirve la carpeta por HTTP para auto-actualizar';
      return;
    }
    chip.textContent = 'Buscando actualizaciones…';
    try {
      const r = await fetch('./data/datos-geniusbet.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      aplicarDatosExternos(d);
      chip.textContent = '✓ Datos al: ' + (d.actualizado || 'hoy');
    } catch (e) {
      chip.textContent = 'Sin JSON accesible · valores embebidos';
    }
  }

  function initCharts() {
    if (charts) {
      Object.values(charts).forEach((c) => c && c.resize && c.resize());
      return;
    }

    $('gIngreso').value = Math.min(500, Math.max(1, GEM.ingresoAnualM));
    $('gCrecimiento').value = Math.min(150, Math.max(20, GEM.crecimientoPct));

    const crecimiento = new Chart(document.getElementById('chCrecimiento'), {
      type: 'line',
      data: {
        labels: anios,
        datasets: [
          {
            label: 'Observado (US$ B)',
            data: mercadoObs,
            borderColor: GREEN,
            backgroundColor: 'rgba(48,196,141,.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            borderWidth: 2.5,
          },
          {
            label: 'Proyección GVR (US$ B)',
            data: mercadoPro,
            borderColor: GOLD,
            borderDash: [7, 5],
            backgroundColor: 'rgba(245,185,66,.07)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: { y: { title: { display: true, text: 'US$ mil millones' }, ticks: { callback: (v) => '$' + v + 'B' } } },
      },
    });

    mkDonut('chSegmento', segmento, ['#f5b942', '#30c48d', '#60a5fa', '#e67e22', '#94a3b8']);
    mkDonut('chRegion', region, ['#60a5fa', '#f5b942', '#30c48d', '#e67e22', '#94a3b8']);
    mkDonut('chDevice', device, ['#30c48d', '#94a3b8']);

    const chOperadores = new Chart(document.getElementById('chOperadores'), {
      type: 'bar',
      data: {
        labels: operadores.labels,
        datasets: [
          {
            label: 'Ingresos FY2025 (US$ B)',
            data: operadores.data,
            backgroundColor: operadores.data.map((v) => (v >= 16 ? GOLD : v >= 5 ? 'rgba(245,185,66,.55)' : 'rgba(48,196,141,.45)')),
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ~$' + c.parsed.x + ' B' } } },
        scales: { x: { title: { display: true, text: 'US$ mil millones' }, ticks: { callback: (v) => '$' + v + 'B' } } },
      },
    });

    new Chart(document.getElementById('chMA'), {
      type: 'bar',
      data: {
        labels: ma.labels,
        datasets: [{ label: 'Valor de la operación (US$ B)', data: ma.data, backgroundColor: ['rgba(96,165,250,.6)', GOLD, GREEN], borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' $' + c.parsed.y + ' B' } } },
        scales: { y: { title: { display: true, text: 'US$ mil millones' }, ticks: { callback: (v) => '$' + v + 'B' } } },
      },
    });

    const bepChart = new Chart(document.getElementById('chBEP'), {
      type: 'line',
      data: {
        datasets: [
          { label: 'Ingresos totales', data: [], borderColor: GREEN, backgroundColor: 'rgba(48,196,141,.10)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
          { label: 'Costos totales (fijos + variables)', data: [], borderColor: RED, backgroundColor: 'rgba(248,113,113,.08)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2.5 },
          { label: 'Punto de equilibrio', type: 'scatter', data: [], pointStyle: 'star', pointRadius: 11, backgroundColor: GOLD },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              title: (c) => 'Jugadores: ' + nf.format(Math.round(c[0].parsed.x)),
              label: (c) => (c.dataset.type === 'scatter' ? ' Equilibrio: ' + fmtK(c.parsed.y) : ' ' + c.dataset.label + ': ' + fmtK(c.parsed.y)),
            },
          },
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Jugadores activos (mensual)' } },
          y: { title: { display: true, text: 'US$ por mes' }, ticks: { callback: fmtK } },
        },
      },
    });

    const chGeniusbet = new Chart(document.getElementById('chGeniusbet'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Ingresos anuales (US$ M)', data: [], backgroundColor: [], borderRadius: 6 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Zoom: competencia directa (US$ M)', color: '#a7b9d8' },
          tooltip: { callbacks: { label: (c) => ' $' + nf.format(Math.round(c.parsed.x)) + ' M' } },
        },
        scales: { x: { type: 'logarithmic', min: 1, max: 5000, title: { display: true, text: 'US$ M (escala log)' }, ticks: { callback: (v) => '$' + v + 'M' } } },
      },
    });

    const chRuta = new Chart(document.getElementById('chRuta'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'GeniusBet (tu escenario)', data: [], borderColor: GOLD, backgroundColor: 'rgba(245,185,66,.12)', fill: true, tension: 0.25, pointRadius: 3, borderWidth: 3 },
          { label: 'Umbral Top 5 global', data: [], borderColor: RED, borderDash: [7, 5], pointRadius: 0, borderWidth: 2 },
          { label: 'Umbral Top 5 LatAm', data: [], borderColor: GREEN, borderDash: [7, 5], pointRadius: 0, borderWidth: 2 },
          { label: 'Referencia Betsson', data: [], borderColor: '#94a3b8', borderDash: [2, 4], pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: 'Trayectoria hacia el Top 5 (US$ M, escala log)', color: '#a7b9d8' },
          tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': $' + nf.format(Math.round(c.parsed.y)) + ' M' } },
        },
        scales: { y: { type: 'logarithmic', min: 1, max: 8000, title: { display: true, text: 'US$ M' }, ticks: { callback: (v) => '$' + v + 'M' } } },
      },
    });

    const chKpis = new Chart(document.getElementById('chKpis'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Crecimiento anual %', data: [], backgroundColor: [], borderRadius: 6 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + '% / año' } } },
        scales: { x: { title: { display: true, text: '% por año' }, ticks: { callback: (v) => v + '%' } } },
      },
    });

    charts = { crecimiento, operadores: chOperadores, bep: bepChart, geniusbet: chGeniusbet, ruta: chRuta, kpis: chKpis };

    ['inCF', 'inARPU', 'inCV', 'inIMP', 'inCAC', 'inVIDA'].forEach((id) => $(id).addEventListener('input', recalcular));
    ['gIngreso', 'gCrecimiento'].forEach((id) => $(id).addEventListener('input', gemRecalc));
    $('btnActualizarMercado').addEventListener('click', buscarActualizaciones);

    recalcular();
    renderRiesgos();
    buscarActualizaciones();
  }

  function showView(name) {
    const ops = $('viewOps');
    const calc = $('viewCalc');
    const btnOps = $('tabOps');
    const btnCalc = $('tabCalc');
    const isCalc = name === 'calculos';
    ops.style.display = isCalc ? 'none' : 'block';
    calc.style.display = isCalc ? 'block' : 'none';
    btnOps.classList.toggle('active', !isCalc);
    btnCalc.classList.toggle('active', isCalc);
    if (isCalc) {
      history.replaceState(null, '', '#calculos');
      requestAnimationFrame(initCharts);
    } else {
      history.replaceState(null, '', '#');
    }
  }

  $('tabOps').addEventListener('click', () => showView('ops'));
  $('tabCalc').addEventListener('click', () => showView('calculos'));
  if (location.hash === '#calculos') showView('calculos');
})();
