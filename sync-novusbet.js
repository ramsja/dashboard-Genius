/**
 * SINCRONIZAR DATOS DESDE NOVUSBET A SUPABASE
 * Descarga transacciones reales y carga en el dashboard
 */

require('dotenv').config({ path: '.env.local' });
const https = require('https');
const { URL } = require('url');
const { createClient } = require('@supabase/supabase-js');

// Configuración
const BASE_URL = 'https://headoffice.novusbet.com';
const LOGIN_URL = `${BASE_URL}/backoffice/auth/login`;
const TRANSACTIONS_URL = `${BASE_URL}/backoffice/transactions-v2`;
const EXPORT_URL = `${BASE_URL}/backoffice/transactions-v2/export`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BO_USERNAME = process.env.BO_USERNAME || '';
const BO_PASSWORD = process.env.BO_PASSWORD || '';

// Rango de fechas: por defecto solo HOY. Este negocio mueve decenas de miles
// de transacciones por día (~32,700/día medido en producción), así que un
// rango de varios días puede superar el millón de registros y la
// exportación de Novusbet nunca termina de prepararse (queda colgada).
const DAYS_BACK = parseInt(process.env.SYNC_DAYS_BACK || '0', 10);
const now = new Date();
const startDate = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
const START_DATE = process.env.START_DATE || startDate.toISOString().split('T')[0];
const END_DATE = process.env.END_DATE || now.toISOString().split('T')[0];

const TIMEOUT = 120000;
const MAX_EXPORT_ATTEMPTS = 200;
const EXPORT_WAIT_SECONDS = 3;

// Alerta de apuesta grande: monto fijo, sin cálculo adaptativo (a pedido,
// para mantenerlo simple y liviano en consultas a Supabase). Deportes
// tiene su propio umbral, mucho más sensible que casino/otros.
// Ajustable sin redeploy:
//   fly secrets set UMBRAL_FIJO_APUESTA=20000
//   fly secrets set UMBRAL_FIJO_APUESTA_DEPORTES=3000
const UMBRAL_FIJO_APUESTA = parseFloat(process.env.UMBRAL_FIJO_APUESTA || '15000');
const UMBRAL_FIJO_APUESTA_DEPORTES = parseFloat(process.env.UMBRAL_FIJO_APUESTA_DEPORTES || '2500');

// Alerta de GANANCIA grande: módulo separado de la de apuestas. Umbral
// fijo (no adaptativo), pedido explícitamente en $15,000.
// Ajustable sin redeploy: fly secrets set UMBRAL_ALERTA_GANANCIA=20000
const UMBRAL_ALERTA_GANANCIA = parseFloat(process.env.UMBRAL_ALERTA_GANANCIA || '15000');

// A partir de este monto (apuesta o ganancia), la alerta se marca como
// "crítica" en vez de "normal" — mismo umbral fijo para ambos módulos.
// Ajustable: fly secrets set UMBRAL_SEVERIDAD_CRITICA=25000
const UMBRAL_SEVERIDAD_CRITICA = parseFloat(process.env.UMBRAL_SEVERIDAD_CRITICA || '20000');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

let supabase = null;

// ============================================================
// UTILIDADES HTTP
// ============================================================

function httpsRequest(method, url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      method,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { ...HEADERS, ...options.headers },
      timeout: TIMEOUT,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        })
      );
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function extractCookie(response) {
  const setCookie = response.headers['set-cookie'];
  if (!setCookie) return '';
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

function extractCSRFToken(html) {
  const match = html.match(/<input[^>]*name="_token"[^>]*value="([^"]+)"/);
  return match ? match[1] : '';
}

// ============================================================
// LOGIN
// ============================================================

async function login() {
  console.log('🔐 Conectando a Novusbet...');

  const loginPageRes = await httpsRequest('GET', LOGIN_URL);
  if (loginPageRes.status !== 200) {
    throw new Error(`Login page error: ${loginPageRes.status}`);
  }

  const token = extractCSRFToken(loginPageRes.body);
  if (!token) {
    throw new Error('CSRF token not found');
  }

  const cookie = extractCookie(loginPageRes);

  const body = new URLSearchParams();
  body.append('_token', token);
  body.append('username', BO_USERNAME);
  body.append('password', BO_PASSWORD);

  const loginRes = await httpsRequest('POST', LOGIN_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Referer': LOGIN_URL,
      'Origin': BASE_URL,
    },
    body: body.toString(),
  });

  const location = loginRes.headers['location'] || '';
  const validRedirect =
    (loginRes.status === 301 || loginRes.status === 302 || loginRes.status === 303) &&
    location.includes('/backoffice/dashboard');

  if (!validRedirect) {
    throw new Error(`Login failed: HTTP ${loginRes.status}, Location: ${location}`);
  }

  const newCookie = extractCookie(loginRes);
  const finalCookie = newCookie || cookie;

  console.log('✅ Autenticación exitosa');
  return { token, cookie: finalCookie };
}

// ============================================================
// DESCARGAR CSV
// ============================================================

function buildPayload(token, fechaDesde, fechaHasta) {
  const payload = new URLSearchParams();
  payload.append('site_id[]', '1049');
  payload.append('user_type', '2');
  payload.append('subusers', '0');
  payload.append('causal_product_id[]', process.env.CAUSAL_PRODUCT_ID || '');
  payload.append('per_page', '50');
  payload.append('from-date', `${fechaDesde} 00:00`);
  payload.append('to-date', `${fechaHasta} 23:59`);
  payload.append('_token', token);
  return payload;
}

async function downloadCSV(token, cookie, fechaDesde = START_DATE, fechaHasta = END_DATE) {
  console.log(`📥 Descargando transacciones (${fechaDesde} → ${fechaHasta})...`);

  const payload = buildPayload(token, fechaDesde, fechaHasta);

  const initRes = await httpsRequest('POST', EXPORT_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': TRANSACTIONS_URL,
      'Origin': BASE_URL,
    },
    body: payload.toString(),
  });

  if (initRes.status !== 200) {
    throw new Error(`Export init failed: ${initRes.status}. Body: ${initRes.body.slice(0, 300)}`);
  }

  let initJson;
  try {
    initJson = JSON.parse(initRes.body);
  } catch (e) {
    throw new Error(`Respuesta no es JSON: ${initRes.body.slice(0, 300)}`);
  }

  const scrollId = initJson.scrollId;
  if (!initJson.response || !scrollId) {
    throw new Error(`No scrollId received. Respuesta: ${JSON.stringify(initJson).slice(0, 300)}`);
  }

  console.log(`✅ Exportación iniciada (scrollId: ${scrollId})`);

  let downloadReady = false;
  let attempts = 0;
  let lastJson = initJson;

  while (!downloadReady && attempts < MAX_EXPORT_ATTEMPTS) {
    attempts++;
    payload.set('scrollId', String(lastJson.scrollId || scrollId));

    const statusRes = await httpsRequest('POST', EXPORT_URL, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': TRANSACTIONS_URL,
        'Origin': BASE_URL,
      },
      body: payload.toString(),
    });

    const statusJson = JSON.parse(statusRes.body);
    lastJson = statusJson;
    const isReady = statusJson.download === true || statusJson.download === 1 || statusJson.download === '1';

    if (attempts % 10 === 0 || isReady) {
      console.log(`  Intento ${attempts}/${MAX_EXPORT_ATTEMPTS} - itemsCount=${statusJson.itemsCount || 0} download=${statusJson.download}`);
    }
    lastJson = { itemsCount: statusJson.itemsCount, download: statusJson.download, response: statusJson.response, scrollId: statusJson.scrollId };

    if (isReady) {
      downloadReady = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, EXPORT_WAIT_SECONDS * 1000));
  }

  if (!downloadReady) {
    throw new Error(`Export timeout after ${attempts} attempts. Última respuesta: ${JSON.stringify(lastJson).slice(0, 300)}`);
  }

  console.log('📊 Descargando archivo...');

  payload.set('download', '1');
  const downloadRes = await httpsRequest('POST', EXPORT_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': TRANSACTIONS_URL,
      'Origin': BASE_URL,
    },
    body: payload.toString(),
  });

  if (downloadRes.status !== 200) {
    throw new Error(`Download failed: ${downloadRes.status}`);
  }

  return downloadRes.body;
}

// ============================================================
// PROCESAR CSV Y CARGAR EN SUPABASE
// ============================================================

// Parser CSV robusto: soporta comillas, comas dentro de campos y ; como delimitador
function parseCSV(content) {
  const cleaned = content.replace(/^﻿/, '');
  const delimiter = (cleaned.split('\n')[0].match(/;/g) || []).length >
    (cleaned.split('\n')[0].match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') i++;
        row.push(field);
        field = '';
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = (rows[i][idx] || '').trim();
    });
    records.push(record);
  }

  return records;
}

function classifyDiscipline(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  if (/casino|slot|live casino|pragmatic|betsoft/.test(text)) return 'casino';
  if (/sport|deport|futbol|fútbol|basket|tenis/.test(text)) return 'deportes';
  return 'otros';
}

// Extrae el nombre limpio del juego desde la descripción real de Novusbet,
// ej. "Silly Sweets Cascade Rush Apuesta" y "Silly Sweets Cascade Rush
// Ganancia" deben contarse como EL MISMO juego, no como dos distintos.
const SUFIJOS_MOVIMIENTO = [
  'apuesta', 'ganancia', 'perdida', 'pérdida', 'bet', 'win', 'lose',
  'deposito', 'depósito', 'deposit', 'retiro', 'withdraw', 'bono', 'bonus',
];
const SUFIJOS_REGEX = new RegExp(`\\s+(${SUFIJOS_MOVIMIENTO.join('|')})\\s*$`, 'i');

// Igual al esApuesta() del dashboard: distingue una apuesta real
// (descripción/juego dice "Bet"/"Apuesta") de un depósito, retiro o
// ganancia, que no deberían disparar alerta por monto alto.
const APUESTA_REGEX = /\b(bet|apuesta)\b/i;
function esApuesta(descripcion, juego) {
  return APUESTA_REGEX.test(descripcion || juego || '');
}

const GANANCIA_REGEX = /\b(win|ganancia)\b/i;
function esGanancia(descripcion) {
  return GANANCIA_REGEX.test(descripcion || '');
}

// Descripciones que no son nombres de juego reales: placeholders sin
// rellenar que vienen así del propio Novusbet ({{gamename}}), o texto
// administrativo (solicitudes, premios, ajustes) que no corresponde a
// ninguna tragamonedas/juego en particular.
const JUEGO_JUNK_REGEX = /\{\{|\}\}|^premio$|^solicitud\b|^ajuste$|^bono$|^cashback$|^credito$|^crédito$|^comisión$|^comision$|^n\/?a$|^-$/i;

function extraerJuego(record) {
  const descripcion = getField(record, 'descripción', 'descripcion', 'description');
  if (!descripcion) return '';
  const limpio = (descripcion.replace(SUFIJOS_REGEX, '').trim() || descripcion).trim();
  if (!limpio || limpio.length < 3 || JUEGO_JUNK_REGEX.test(limpio)) return '';
  return limpio;
}

function classifyClientStatus(record) {
  // IMPORTANTE: en el export real de transacciones de Novusbet, la columna
  // "estado" es un valor NUMÉRICO (ej. "-0.2", "-5", "0.00" — parece ser un
  // monto/código interno), NO el estado de cuenta del jugador (activo,
  // congelado, etc.). Ese dato simplemente no viene en este CSV.
  //
  // Antes buscábamos esas palabras en TODO el texto de la fila, lo que
  // producía falsos positivos (ej. "Actividad de apuestas" activaba
  // "activo" sin que tuviera relación real con el estado del cliente).
  // Ahora solo confiamos en un campo explícito de estado si es texto real
  // (no numérico); si no existe, se marca honestamente como "sin_dato" en
  // vez de inventar un estado.
  const estadoCampo = getField(record, 'estado', 'status', 'estado del jugador', 'estado del cliente').trim();
  const esNumerico = estadoCampo !== '' && !isNaN(estadoCampo.replace(',', '.'));

  if (estadoCampo && !esNumerico) {
    const texto = estadoCampo.toLowerCase();
    if (/congelad|frozen/.test(texto)) return 'congelado';
    if (/\bactivo\b|\bactive\b|\bonline\b|conectado/.test(texto)) return 'activo';
    if (/\binactivo\b|\binactive\b|\boffline\b|sin actividad/.test(texto)) return 'inactivo';
    if (/desconectado|disconnected|\blogout\b|cerrado/.test(texto)) return 'desconectado';
    if (/bloqueado|blocked|suspendido|suspended|pendiente/.test(texto)) return 'suspendido';
  }

  return 'sin_dato';
}

function getField(record, ...names) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== '') return record[name];
  }
  return '';
}

async function uploadToSupabase(records) {
  if (!supabase) {
    console.log('⚠️  Supabase no configurado');
    return;
  }

  console.log(`📤 Cargando ${records.length} registros en Supabase (transacciones_novusbet)...`);

  const numero = (valor) => parseFloat((valor || '').toString().replace(/[^0-9.-]/g, '')) || 0;

  const formattedRecords = records.map((record) => ({
    // "id de transacción" es el ID único que asigna Novusbet a cada
    // movimiento — lo usamos como llave para upsert, así el historial se
    // ACUMULA en vez de borrarse en cada sincronización.
    id_transaccion_novusbet: getField(record, 'id de transacción', 'id_transaccion', 'transaction_id'),
    usuario: getField(record, 'usuario', 'user', 'username', 'cliente', 'nombre') || 'N/A',
    tipo_transaccion: getField(record, 'tipo de transacción', 'tipo', 'type', 'transaction_type') || 'N/A',
    monto: numero(getField(record, 'monto', 'amount', 'total')),
    disciplina: classifyDiscipline(record),
    estado_cliente: classifyClientStatus(record),
    descripcion: getField(record, 'descripcion', 'description', 'descripción', 'grupo causal'),
    fecha: getField(record, 'crear hora', 'fecha', 'created_at', 'date') || new Date().toISOString(),
    casa_apuestas: getField(record, 'casa de apuestas', 'casa', 'site'),
    id_usuario_novusbet: getField(record, 'id de usuario', 'id_usuario', 'user_id'),
    moneda: getField(record, 'moneda', 'currency'),
    ingresos: numero(getField(record, 'ingresos', 'income')),
    comision: numero(getField(record, 'comisión', 'comision', 'commission')),
    saldo: numero(getField(record, 'saldo', 'balance')),
    saldo_actual: numero(getField(record, 'saldo actual', 'current_balance')),
    billeteras: getField(record, 'billeteras', 'wallet', 'wallets'),
    grupo_causal: getField(record, 'grupo causal', 'causal', 'causal_group'),
    juego: extraerJuego(record),
    datos_raw: JSON.stringify(record),
  })).map((r) => ({
    ...r,
    // Precalculado en la app (no con regex en la base) para que el
    // resumen diario sea barato: solo filtra por columna booleana.
    es_apuesta: esApuesta(r.descripcion, r.juego),
    es_ganancia: esGanancia(r.descripcion),
  })).filter((r) => r.id_transaccion_novusbet); // sin id no se puede deduplicar, se descarta

  // Lotes chicos para no chocar con el statement timeout de Supabase en
  // días con mucho volumen (se vieron días de 80k-100k+ transacciones). Si
  // un lote falla igual se reintenta una vez más chico antes de saltarlo,
  // así un timeout puntual no tira todo el resto del día.
  const BATCH_SIZE = 250;
  let inserted = 0;
  let fallidos = 0;

  const insertarLote = async (lote) => {
    const { error } = await supabase
      .from('transacciones_novusbet')
      .upsert(lote, { onConflict: 'id_transaccion_novusbet', ignoreDuplicates: false });
    return error;
  };

  for (let i = 0; i < formattedRecords.length; i += BATCH_SIZE) {
    const batch = formattedRecords.slice(i, i + BATCH_SIZE);
    let error = await insertarLote(batch);

    if (error) {
      console.error(`⚠️ Lote falló (${batch.length} filas), reintentando en mitades:`, error.message);
      // Reintenta partiendo el lote en dos, para aislar el statement timeout
      const mitad = Math.ceil(batch.length / 2);
      const mitades = [batch.slice(0, mitad), batch.slice(mitad)].filter((m) => m.length > 0);
      for (const sub of mitades) {
        const subError = await insertarLote(sub);
        if (subError) {
          console.error(`❌ Sub-lote descartado (${sub.length} filas):`, subError.message);
          fallidos += sub.length;
        } else {
          inserted += sub.length;
        }
      }
    } else {
      inserted += batch.length;
    }

    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(`  ...${inserted}/${formattedRecords.length} sincronizados${fallidos ? ` (${fallidos} descartados)` : ''}`);
    }
  }

  console.log(`✅ ${inserted} registros cargados en Supabase${fallidos ? ` (⚠️ ${fallidos} descartados por errores repetidos)` : ''}`);

  await guardarAlertasApuestas(formattedRecords);
  await guardarAlertasGanancias(formattedRecords);
  const resumenOk = await calcularYGuardarResumenDiario(formattedRecords);

  return { inserted, resumenOk };
}

// Arma el resumen diario por usuario EN MEMORIA, a partir de los mismos
// registros que se acaban de subir (no vuelve a consultar
// transacciones_novusbet). Evita el GROUP BY pesado en la base — eso fue
// lo que causaba "canceling statement due to statement timeout" incluso
// para un solo día. Devuelve true/false según si se pudo guardar, para
// que quien pode el detalle crudo sepa si es seguro hacerlo.
async function calcularYGuardarResumenDiario(formattedRecords) {
  if (!supabase) return false;

  const porUsuarioDia = {};
  formattedRecords.forEach((r) => {
    if (!r.id_usuario_novusbet) return;
    const dia = (r.fecha || '').slice(0, 10);
    if (!dia) return;
    const key = `${r.id_usuario_novusbet}|${dia}`;
    if (!porUsuarioDia[key]) {
      porUsuarioDia[key] = {
        id_usuario_novusbet: r.id_usuario_novusbet,
        usuario: r.usuario,
        casa_apuestas: r.casa_apuestas,
        dia,
        transacciones: 0,
        apuestas: 0,
        monto_total: 0,
        apostado: 0,
        ganado: 0,
        juegos: new Set(),
        ultima_actividad: null,
      };
    }
    const u = porUsuarioDia[key];
    u.transacciones += 1;
    u.monto_total += r.monto || 0;
    if (r.es_apuesta) {
      u.apuestas += 1;
      u.apostado += Math.abs(r.monto || 0);
    }
    if (r.es_ganancia) u.ganado += Math.abs(r.monto || 0);
    // Solo contamos como "juego jugado" si la transacción es una apuesta
    // real. Si no filtramos por esto, cualquier descripción con un nombre
    // (depósito, retiro, bono, cashback, premio) termina apareciendo como
    // si fuera un juego, aunque nunca se apostó en él.
    if (r.es_apuesta && r.juego) u.juegos.add(r.juego);
    if (!u.ultima_actividad || r.fecha > u.ultima_actividad) u.ultima_actividad = r.fecha;
  });

  const filas = Object.values(porUsuarioDia).map((u) => ({ ...u, juegos: Array.from(u.juegos) }));
  if (filas.length === 0) return true; // nada que resumir, no es un fallo

  const BATCH_SIZE = 500;
  try {
    for (let i = 0; i < filas.length; i += BATCH_SIZE) {
      const lote = filas.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('resumen_diario_usuarios')
        .upsert(lote, { onConflict: 'id_usuario_novusbet,dia' });
      if (error) throw error;
    }
    return true;
  } catch (e) {
    console.log('⚠️ No se pudo guardar el resumen diario:', e.message);
    return false;
  }
}

// Cualquier apuesta >= UMBRAL_FIJO_APUESTA (monto fijo, sin cálculo
// adaptativo) queda registrada en alertas_apuestas. No es crítico si
// falla, no debe tirar el resto de la sincronización.
async function guardarAlertasApuestas(formattedRecords) {
  if (!supabase) return;

  // Simplificado a pedido: solo monto fijo, sin el cálculo adaptativo
  // (percentil 99 / promedio por usuario) — menos consultas a Supabase
  // en cada sync, importante con el plan gratuito ya ajustado. Deportes
  // usa un umbral aparte, mucho más bajo que casino/otros.
  const alertas = formattedRecords
    .filter((r) => {
      if (!r.es_apuesta) return false;
      const umbral = r.disciplina === 'deportes' ? UMBRAL_FIJO_APUESTA_DEPORTES : UMBRAL_FIJO_APUESTA;
      return Math.abs(r.monto) >= umbral;
    })
    .map((r) => {
      const umbral = r.disciplina === 'deportes' ? UMBRAL_FIJO_APUESTA_DEPORTES : UMBRAL_FIJO_APUESTA;
      return {
        id_transaccion_novusbet: r.id_transaccion_novusbet,
        id_usuario_novusbet: r.id_usuario_novusbet,
        usuario: r.usuario,
        casa_apuestas: r.casa_apuestas,
        monto: r.monto,
        disciplina: r.disciplina,
        juego: r.juego,
        descripcion: r.descripcion,
        fecha: r.fecha,
        umbral_usado: umbral,
        motivo_alerta: 'fijo',
        severidad: Math.abs(r.monto) >= UMBRAL_SEVERIDAD_CRITICA ? 'critica' : 'normal',
      };
    });

  if (alertas.length === 0) return;

  try {
    const { error } = await supabase
      .from('alertas_apuestas')
      .upsert(alertas, { onConflict: 'id_transaccion_novusbet', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`🚨 ${alertas.length} alertas de apuesta grande (umbral global $${umbralGlobal.toFixed(2)})`);
  } catch (e) {
    console.log('⚠️ No se pudieron guardar las alertas de apuesta:', e.message);
  }
}

// Módulo separado de alertas: cualquier GANANCIA (pago/win, es_ganancia)
// con monto absoluto >= UMBRAL_ALERTA_GANANCIA queda en alertas_ganancias.
// Umbral fijo (no adaptativo, a diferencia de las de apuesta). No es
// crítico si falla, no debe tirar el resto de la sincronización.
// Clasifica si el usuario viene "en alza", "en baja" o "estable" en sus
// ganancias, comparando el promedio de sus últimos días recientes contra
// el promedio de los días anteriores a esos — sobre resumen_diario_usuarios
// (liviana, ya calculada), sin tocar el detalle crudo. Es el "patrón" que
// se pidió, hecho con estadística simple en vez de una red neuronal: con
// pocos meses de datos un modelo entrenado no tendría con qué aprender de
// forma confiable, y esto da la misma señal práctica (¿va para arriba o
// para abajo?) sin infraestructura de ML.
function clasificarTendencia(diasOrdenados) {
  if (diasOrdenados.length < 4) return 'sin_dato'; // no hay suficiente historial todavía
  const mitad = Math.floor(diasOrdenados.length / 2);
  const anteriores = diasOrdenados.slice(0, mitad);
  const recientes = diasOrdenados.slice(mitad);
  const promedio = (arr) => arr.reduce((s, d) => s + d.ganado, 0) / arr.length;
  const promAnterior = promedio(anteriores);
  const promReciente = promedio(recientes);
  if (promAnterior === 0) return promReciente > 0 ? 'alza' : 'sin_dato';
  const cambio = (promReciente - promAnterior) / promAnterior;
  if (cambio >= 0.2) return 'alza';
  if (cambio <= -0.2) return 'baja';
  return 'estable';
}

async function guardarAlertasGanancias(formattedRecords) {
  if (!supabase) return;

  const candidatas = formattedRecords.filter((r) => r.es_ganancia && Math.abs(r.monto) >= UMBRAL_ALERTA_GANANCIA);
  if (candidatas.length === 0) return;

  const patrones = {};
  try {
    const ids = [...new Set(candidatas.map((r) => r.id_usuario_novusbet).filter(Boolean))];
    if (ids.length > 0) {
      const { data: historial } = await supabase
        .from('resumen_diario_usuarios')
        .select('id_usuario_novusbet, dia, ganado')
        .in('id_usuario_novusbet', ids)
        .order('dia', { ascending: true });
      const porUsuario = {};
      (historial || []).forEach((h) => {
        if (!porUsuario[h.id_usuario_novusbet]) porUsuario[h.id_usuario_novusbet] = [];
        porUsuario[h.id_usuario_novusbet].push({ dia: h.dia, ganado: Number(h.ganado) || 0 });
      });
      Object.entries(porUsuario).forEach(([id, dias]) => { patrones[id] = clasificarTendencia(dias); });
    }
  } catch (e) {
    // resumen_diario_usuarios puede no tener historial suficiente todavía
  }

  const alertas = candidatas.map((r) => ({
    id_transaccion_novusbet: r.id_transaccion_novusbet,
    id_usuario_novusbet: r.id_usuario_novusbet,
    usuario: r.usuario,
    casa_apuestas: r.casa_apuestas,
    monto: r.monto,
    disciplina: r.disciplina,
    juego: r.juego,
    descripcion: r.descripcion,
    fecha: r.fecha,
    umbral_usado: UMBRAL_ALERTA_GANANCIA,
    patron: patrones[r.id_usuario_novusbet] || 'sin_dato',
    severidad: Math.abs(r.monto) >= UMBRAL_SEVERIDAD_CRITICA ? 'critica' : 'normal',
  }));

  try {
    const { error } = await supabase
      .from('alertas_ganancias')
      .upsert(alertas, { onConflict: 'id_transaccion_novusbet', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`💰 ${alertas.length} alertas de ganancia grande (>= $${UMBRAL_ALERTA_GANANCIA})`);
  } catch (e) {
    console.log('⚠️ No se pudieron guardar las alertas de ganancia:', e.message);
  }
}

// Recalcula el resumen DIARIO de un solo día (tabla
// resumen_diario_usuarios, ver CREAR-RESUMEN-DIARIO-Y-RANKING.sql).
// Rápido porque escanea un solo día, y seguro de repetir (sobreescribe,
// no suma). No crítico, no debe tirar el sync si falla.
async function actualizarResumenDiario(fechaStr) {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('actualizar_resumen_diario_usuarios', {
      fecha_desde: fechaStr,
      fecha_hasta: fechaStr,
    });
    if (error) throw error;
  } catch (e) {
    console.log(`⚠️ No se pudo actualizar el resumen diario de ${fechaStr}:`, e.message);
  }
}

// Retención del detalle crudo de transacciones_novusbet: más allá de
// este límite, ya sirvió para alimentar el resumen diario/ranking, así
// que se borra para no acumular millones de filas en un plan gratuito
// de Supabase (el proyecto ya llegó a "exhausting multiple resources"
// con retención de 60 días). Bajado a 21 días por defecto para achicar
// la tabla y aliviar la carga. Ajustable: fly secrets set RETENCION_TRANSACCIONES_DIAS=30
const RETENCION_TRANSACCIONES_DIAS = parseInt(process.env.RETENCION_TRANSACCIONES_DIAS || '21', 10);

// Borra el detalle crudo de un día si ya quedó fuera de la ventana de
// retención. Se llama DESPUÉS de actualizarResumenDiario(), nunca antes.
async function podarTransaccionesDelDia(fechaStr) {
  if (!supabase) return;
  const antiguedadDias = Math.floor((Date.now() - new Date(fechaStr).getTime()) / (24 * 60 * 60 * 1000));
  if (antiguedadDias <= RETENCION_TRANSACCIONES_DIAS) return;

  try {
    const { error } = await supabase
      .from('transacciones_novusbet')
      .delete()
      .gte('fecha', `${fechaStr}T00:00:00`)
      .lte('fecha', `${fechaStr}T23:59:59`);
    if (error) throw error;
    console.log(`🧹 Detalle crudo de ${fechaStr} podado (ya resumido, fuera de los ${RETENCION_TRANSACCIONES_DIAS} días de retención)`);
  } catch (e) {
    console.log(`⚠️ No se pudo podar ${fechaStr}:`, e.message);
  }
}

// ============================================================
// MAIN
// ============================================================

function asegurarSupabase() {
  if (!supabase && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
}

// Sincroniza un rango de fechas (usado tanto por main() como por el
// backfill histórico). No hace process.exit — segura para llamar desde el
// servidor sin tumbarlo si algo falla.
async function sincronizarRango(fechaDesde, fechaHasta) {
  asegurarSupabase();
  if (!supabase) {
    console.log('⚠️ Faltan credenciales de Supabase, solo se descargará y clasificará el CSV');
  }

  const { token, cookie } = await login();
  const csvContent = await downloadCSV(token, cookie, fechaDesde, fechaHasta);
  const records = parseCSV(csvContent);

  console.log(`\n📊 ${records.length} transacciones procesadas (${fechaDesde} → ${fechaHasta})`);

  const disciplinas = {};
  const estados = {};
  records.forEach((r) => {
    const d = classifyDiscipline(r);
    const e = classifyClientStatus(r);
    disciplinas[d] = (disciplinas[d] || 0) + 1;
    estados[e] = (estados[e] || 0) + 1;
  });
  console.log('   Por disciplina:', disciplinas);
  console.log('   Por estado cliente:', estados);

  let resumenOk = true;
  if (records.length > 0) {
    const resultado = await uploadToSupabase(records);
    resumenOk = resultado.resumenOk;
  } else {
    console.log('⚠️ No se encontraron transacciones en el rango de fechas indicado');
  }

  return { total: records.length, resumenOk };
}

async function main() {
  try {
    if (!BO_USERNAME || !BO_PASSWORD) {
      console.error('❌ Faltan BO_USERNAME o BO_PASSWORD en .env.local');
      process.exit(1);
    }

    const { total } = await sincronizarRango(START_DATE, END_DATE);
    console.log('\n✅ Sincronización completada');
    return total;
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    throw err;
  }
}

// Backfill histórico: sincroniza día por día desde hace `dias` días hasta
// hoy. Se hace UN día a la vez (no un rango grande) porque un rango de 30
// días de una sola pasada nunca termina de exportar en Novusbet (~30-35k
// transacciones/día hacen que la exportación se cuelgue). Cada día usa
// upsert por id_transaccion_novusbet, así que reintentar no duplica nada.
// Recorre un rango de fechas EXACTO, día por día (ambos extremos
// incluidos), sincronizando cada uno por separado — igual razón que
// arriba: un rango de varios días de una sola pasada nunca termina de
// exportar en Novusbet. Es la base tanto de "traer N días" como de
// "traer desde tal fecha hasta tal otra".
async function syncRangoHistorico(fechaDesdeStr, fechaHastaStr, onProgreso) {
  if (!BO_USERNAME || !BO_PASSWORD) {
    throw new Error('Faltan BO_USERNAME o BO_PASSWORD');
  }

  const fechaDesde = new Date(`${fechaDesdeStr}T00:00:00Z`);
  const fechaHasta = new Date(`${fechaHastaStr}T00:00:00Z`);
  const diasTotal = Math.round((fechaHasta - fechaDesde) / (24 * 60 * 60 * 1000)) + 1;

  let totalGeneral = 0;
  let diasProcesados = 0;
  const resultadosPorDia = [];

  for (let t = fechaDesde.getTime(); t <= fechaHasta.getTime(); t += 24 * 60 * 60 * 1000) {
    const fechaStr = new Date(t).toISOString().split('T')[0];
    diasProcesados += 1;

    try {
      console.log(`\n📅 Sincronizando día ${fechaStr} (${diasProcesados}/${diasTotal})...`);
      const { total, resumenOk } = await sincronizarRango(fechaStr, fechaStr);
      totalGeneral += total;
      resultadosPorDia.push({ fecha: fechaStr, transacciones: total, ok: true, resumenOk });
      // Solo se poda el detalle crudo si el resumen se guardó bien — si no,
      // se conserva para poder reintentar el resumen más adelante sin
      // perder el día por completo.
      if (resumenOk) {
        await podarTransaccionesDelDia(fechaStr);
      } else {
        console.log(`⚠️ Resumen de ${fechaStr} no se pudo guardar — se conserva el detalle crudo sin podar`);
      }
    } catch (err) {
      console.error(`❌ Error sincronizando ${fechaStr}:`, err.message);
      resultadosPorDia.push({ fecha: fechaStr, error: err.message, ok: false });
    }

    if (onProgreso) onProgreso({ diasProcesados, diasTotal, totalGeneral, resultadosPorDia });

    // Pequeña pausa entre días para no saturar el backoffice de Novusbet
    if (t < fechaHasta.getTime()) await new Promise((r) => setTimeout(r, 2000));
  }

  return { totalGeneral, resultadosPorDia };
}

// Atajo: trae los últimos `dias` días hasta hoy.
async function syncHistorico(dias, onProgreso) {
  const hoy = new Date().toISOString().split('T')[0];
  const desde = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return syncRangoHistorico(desde, hoy, onProgreso);
}

// ============================================================
// USUARIOS REALES (estado de cuenta: Habilitado/Congelado/etc.)
//
// A diferencia de Transacciones, esta pantalla NO tiene un export
// asíncrono por HTTP que podamos reproducir fácilmente (dispara un job
// que se notifica por WebSocket, y no logramos capturar esa notificación
// de forma confiable). En cambio, la tabla de resultados viene renderizada
// directo en el HTML de /backoffice/users cuando se le pasan los filtros
// correctos — así que la leemos ahí, sin necesitar el export ni el socket.
// ============================================================

const USERS_URL = `${BASE_URL}/backoffice/users`;

// Columnas en el orden real de la tabla (ver <thead> de /backoffice/users)
const COLUMNAS_USUARIOS = [
  'id_usuario', 'usuario', 'apellido', 'nombre', 'tipo', 'estado_conexion',
  'padre', 'correo', 'moneda', 'saldo', 'saldo_retirable', 'bono', 'sitio',
  'estado', 'first_deposit_at', 'ultimo_acceso', 'fecha_creacion', 'info',
];

function limpiarCeldaHTML(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&Uacute;/g, 'Ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsuariosHTML(html) {
  const tbodyMatch = html.match(/<tbody id="response">([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];

  const filas = tbodyMatch[1].split(/<tr[ >]/).slice(1);
  const usuarios = [];

  for (const filaHtml of filas) {
    const celdas = [...filaHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limpiarCeldaHTML(m[1]));
    if (celdas.length < COLUMNAS_USUARIOS.length - 2) continue; // fila incompleta/basura

    const registro = {};
    COLUMNAS_USUARIOS.forEach((col, i) => { registro[col] = celdas[i] || ''; });

    // El id de usuario viene primero en la celda, a veces con texto extra
    registro.id_usuario = (registro.id_usuario.match(/\d+/) || [''])[0];

    if (registro.id_usuario) usuarios.push(registro);
  }

  return usuarios;
}

function numeroMonto(v) {
  return parseFloat((v || '').toString().replace(/[^0-9.-]/g, '')) || 0;
}

function fechaISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function construirParamsUsuarios(pagina) {
  const params = new URLSearchParams();
  [0, 1, 2, 3, 4, 5, 6].forEach((s) => params.append('status[]', s));
  // Sin type[] el backoffice solo devuelve la cima de la jerarquía (agentes raíz).
  // Hay que pedir los 4 tipos explícitamente para traer también Jugadores.
  [1, 2, 3, 4].forEach((t) => params.append('type[]', t));
  params.append('site_id[]', '1049'); // Geniusbet SV
  params.append('is_test', 'all'); // incluye cuentas reales y de prueba, como el panel
  params.append('per_page', '1000');
  if (pagina > 1) params.append('page', String(pagina));
  return params;
}

function extraerRegistrosTotales(html) {
  const m = html.match(/Registros totales:?\s*([0-9.,]+)/i);
  return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : null;
}

async function sincronizarUsuarios(onProgreso) {
  asegurarSupabase();

  const { cookie } = await login();

  console.log('📥 Descargando usuarios reales (estado de cuenta)...');

  let pagina = 1;
  let totalGuardados = 0;
  let totalEsperado = null;

  while (true) {
    const params = construirParamsUsuarios(pagina);
    const res = await httpsRequest('GET', `${USERS_URL}?${params.toString()}`, {
      headers: { Cookie: cookie },
    });

    if (res.status !== 200) {
      throw new Error(`Error obteniendo usuarios (página ${pagina}): HTTP ${res.status}`);
    }

    if (totalEsperado === null) totalEsperado = extraerRegistrosTotales(res.body);

    const filas = parseUsuariosHTML(res.body);
    if (filas.length === 0) break;

    const registros = filas.map((r) => ({
      id_usuario: r.id_usuario,
      usuario: r.usuario,
      apellido: r.apellido,
      nombre: r.nombre,
      tipo: r.tipo,
      padre: r.padre,
      correo: r.correo,
      moneda: r.moneda,
      saldo: numeroMonto(r.saldo),
      saldo_retirable: numeroMonto(r.saldo_retirable),
      bono: numeroMonto(r.bono),
      sitio: r.sitio,
      estado: r.estado,
      ultimo_acceso: fechaISO(r.ultimo_acceso),
      fecha_creacion: fechaISO(r.fecha_creacion),
      actualizado_at: new Date().toISOString(),
    }));

    if (supabase) {
      const { error } = await supabase.from('usuarios_novusbet').upsert(registros, { onConflict: 'id_usuario' });
      if (error) throw error;
    }

    totalGuardados += registros.length;
    if (onProgreso) onProgreso({ pagina, totalGuardados, totalEsperado });
    console.log(`📊 Página ${pagina}: ${registros.length} usuarios (acumulado ${totalGuardados}${totalEsperado ? ` / ${totalEsperado}` : ''})`);

    if (filas.length < 1000) break; // última página
    pagina += 1;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`✅ ${totalGuardados} usuarios reales sincronizados (con estado de cuenta)`);
  return totalGuardados;
}

if (require.main === module) {
  main().catch(() => process.exit(1));
}

module.exports = {
  main, syncHistorico, syncRangoHistorico, parseCSV, sincronizarUsuarios, parseUsuariosHTML,
  actualizarResumenDiario, podarTransaccionesDelDia, END_DATE,
};
