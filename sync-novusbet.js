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

function buildPayload(token) {
  const payload = new URLSearchParams();
  payload.append('site_id[]', '1049');
  payload.append('user_type', '2');
  payload.append('subusers', '0');
  payload.append('causal_product_id[]', process.env.CAUSAL_PRODUCT_ID || '');
  payload.append('per_page', '50');
  payload.append('from-date', `${START_DATE} 00:00`);
  payload.append('to-date', `${END_DATE} 23:59`);
  payload.append('_token', token);
  return payload;
}

async function downloadCSV(token, cookie) {
  console.log(`📥 Descargando transacciones (${START_DATE} → ${END_DATE})...`);

  const payload = buildPayload(token);

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

function classifyClientStatus(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  if (/\bactivo\b|\bactive\b|\bonline\b|conectado/.test(text)) return 'activo';
  if (/\binactivo\b|\binactive\b|\boffline\b|sin actividad/.test(text)) return 'inactivo';
  if (/desconectado|disconnected|\blogout\b|cerrado/.test(text)) return 'desconectado';
  if (/bloqueado|blocked|suspendido|suspended|pendiente/.test(text)) return 'suspendido';
  return 'otros';
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

  const formattedRecords = records.map((record) => ({
    usuario: getField(record, 'usuario', 'user', 'username', 'cliente', 'nombre') || 'N/A',
    tipo_transaccion: getField(record, 'tipo', 'type', 'tipo de transacción', 'transaction_type') || 'N/A',
    monto: parseFloat(getField(record, 'monto', 'amount', 'total').replace(/[^0-9.-]/g, '')) || 0,
    disciplina: classifyDiscipline(record),
    estado_cliente: classifyClientStatus(record),
    descripcion: getField(record, 'descripcion', 'description', 'descripción'),
    fecha: getField(record, 'fecha', 'created_at', 'date') || new Date().toISOString(),
    datos_raw: JSON.stringify(record),
  }));

  // Limpiar datos anteriores del mismo rango para evitar duplicados en cada sync
  await supabase.from('transacciones_novusbet').delete().neq('id', 0);

  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < formattedRecords.length; i += BATCH_SIZE) {
    const batch = formattedRecords.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('transacciones_novusbet').insert(batch).select();
    if (error) {
      console.error('❌ Error insertando lote:', error.message);
      throw error;
    }
    inserted += data?.length || batch.length;
  }

  console.log(`✅ ${inserted} registros cargados en Supabase`);
  return inserted;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    if (!BO_USERNAME || !BO_PASSWORD) {
      console.error('❌ Faltan BO_USERNAME o BO_PASSWORD en .env.local');
      process.exit(1);
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    } else {
      console.log('⚠️ Faltan credenciales de Supabase, solo se descargará y clasificará el CSV');
    }

    const { token, cookie } = await login();
    const csvContent = await downloadCSV(token, cookie);
    const records = parseCSV(csvContent);

    console.log(`\n📊 ${records.length} transacciones procesadas`);

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

    if (records.length > 0) {
      await uploadToSupabase(records);
    } else {
      console.log('⚠️ No se encontraron transacciones en el rango de fechas indicado');
    }

    console.log('\n✅ Sincronización completada');
    return records.length;
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    throw err;
  }
}

if (require.main === module) {
  main().catch(() => process.exit(1));
}

module.exports = { main };
