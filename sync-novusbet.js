/**
 * SINCRONIZAR DATOS DESDE NOVUSBET A SUPABASE
 * Descarga transacciones reales y carga en el dashboard
 */

require('dotenv').config({ path: '.env.local' });
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuración
const BASE_URL = 'https://headoffice.novusbet.com';
const LOGIN_URL = `${BASE_URL}/backoffice/auth/login`;
const TRANSACTIONS_URL = `${BASE_URL}/backoffice/transactions-v2`;
const EXPORT_URL = `${BASE_URL}/backoffice/transactions-v2/export`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BO_USERNAME = process.env.BO_USERNAME || 'FinanceSV';
const BO_PASSWORD = process.env.BO_PASSWORD || 'Anma07covi*';

const TIMEOUT = 120000;
const MAX_EXPORT_ATTEMPTS = 200;
const EXPORT_WAIT_SECONDS = 3;

// User Agent
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

  try {
    // 1. Obtener página de login
    const loginPageRes = await httpsRequest('GET', LOGIN_URL);
    if (loginPageRes.status !== 200) {
      throw new Error(`Login page error: ${loginPageRes.status}`);
    }

    const token = extractCSRFToken(loginPageRes.body);
    if (!token) {
      throw new Error('CSRF token not found');
    }

    const cookie = extractCookie(loginPageRes);

    // 2. Enviar credenciales
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

    if (loginRes.status !== 301 && loginRes.status !== 302) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }

    const newCookie = extractCookie(loginRes);
    const finalCookie = newCookie || cookie;

    console.log('✅ Autenticación exitosa');
    return { token, cookie: finalCookie };
  } catch (err) {
    console.error('❌ Error en login:', err.message);
    throw err;
  }
}

// ============================================================
// DESCARGAR CSV
// ============================================================

async function downloadCSV(token, cookie) {
  console.log('📥 Descargando transacciones...');

  const today = new Date().toISOString().split('T')[0];
  const payload = new URLSearchParams();
  payload.append('site_id[]', '1049');
  payload.append('user_type', '2');
  payload.append('subusers', '0');
  payload.append('per_page', '1000');
  payload.append('from-date', `${today} 00:00`);
  payload.append('to-date', `${today} 23:59`);
  payload.append('_token', token);

  try {
    // Iniciar exportación
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
      throw new Error(`Export init failed: ${initRes.status}`);
    }

    const initJson = JSON.parse(initRes.body);
    const scrollId = initJson.scrollId;

    if (!scrollId) {
      throw new Error('No scrollId received');
    }

    console.log(`✅ Exportación iniciada (scrollId: ${scrollId})`);

    // Esperar preparación
    let downloadReady = false;
    let attempts = 0;

    while (!downloadReady && attempts < MAX_EXPORT_ATTEMPTS) {
      attempts++;
      payload.set('scrollId', scrollId);

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
      const isReady = statusJson.download === true || statusJson.download === 1 || statusJson.download === '1';

      if (attempts % 20 === 0) {
        console.log(`  Intento ${attempts}/${MAX_EXPORT_ATTEMPTS} - ${statusJson.itemsCount || 0} registros`);
      }

      if (isReady) {
        downloadReady = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, EXPORT_WAIT_SECONDS * 1000));
    }

    if (!downloadReady) {
      throw new Error(`Export timeout after ${attempts} attempts`);
    }

    console.log('📊 Descargando archivo...');

    // Descargar CSV
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
  } catch (err) {
    console.error('❌ Error descargando CSV:', err.message);
    throw err;
  }
}

// ============================================================
// PROCESAR CSV Y CARGAR EN SUPABASE
// ============================================================

function classifyDiscipline(row) {
  const text = Object.values(row).join(' ').toLowerCase();
  if (text.includes('casino') || text.includes('slot') || text.includes('live')) {
    return 'casino';
  }
  if (text.includes('deport') || text.includes('futbol') || text.includes('sport')) {
    return 'deportes';
  }
  return 'otros';
}

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const record = {};

    headers.forEach((header, idx) => {
      record[header] = values[idx] ? values[idx].trim() : '';
    });

    records.push(record);
  }

  return records;
}

async function uploadToSupabase(records) {
  if (!supabase) {
    console.log('⚠️  Supabase no configurado');
    return;
  }

  console.log(`📤 Cargando ${records.length} registros en Supabase...`);

  const formattedRecords = records.map((record) => ({
    usuario: record.usuario || record.user || record.username || 'N/A',
    tipo_transaccion: record.tipo || record.type || 'N/A',
    monto: parseFloat(record.monto || record.amount || 0),
    disciplina: classifyDiscipline(record),
    descripcion: record.descripcion || record.description || '',
    fecha: record.fecha || new Date().toISOString(),
    datos_raw: JSON.stringify(record),
  }));

  try {
    // Crear tabla si no existe
    const { error: createError } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS transacciones_novusbet (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario TEXT NOT NULL,
          tipo_transaccion TEXT,
          monto NUMERIC,
          disciplina TEXT,
          descripcion TEXT,
          fecha TIMESTAMPTZ DEFAULT NOW(),
          datos_raw JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_novusbet_usuario ON transacciones_novusbet(usuario);
        CREATE INDEX IF NOT EXISTS idx_novusbet_disciplina ON transacciones_novusbet(disciplina);
      `,
    });

    // Insertar registros
    const { data, error } = await supabase
      .from('transacciones_novusbet')
      .insert(formattedRecords)
      .select();

    if (error) {
      console.error('❌ Error inserting records:', error.message);
      throw error;
    }

    console.log(`✅ ${data?.length || formattedRecords.length} registros cargados`);
    return data;
  } catch (err) {
    console.error('❌ Error en Supabase:', err.message);
    throw err;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    // Validar configuración
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env.local');
      process.exit(1);
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Login
    const { token, cookie } = await login();

    // 2. Descargar CSV
    const csvContent = await downloadCSV(token, cookie);

    // 3. Procesar
    const records = parseCSV(csvContent);
    console.log(`\n📊 ${records.length} transacciones procesadas`);

    // 4. Cargar en Supabase
    if (records.length > 0) {
      await uploadToSupabase(records);
    }

    console.log('\n✅ Sincronización completada');
    console.log('🌐 Dashboard se actualizará en https://dashboard-genius.onrender.com');
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
  }
}

main();
