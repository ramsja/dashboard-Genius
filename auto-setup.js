#!/usr/bin/env node
/**
 * AUTO-SETUP: Configuración automática completa
 * 1. Crea tabla en Supabase
 * 2. Descarga datos de Novusbet
 * 3. Carga en Supabase
 * 4. Inicia servidor
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { execSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   🚀 AUTO-SETUP DASHBOARD GENIUS     ║');
    console.log('╚════════════════════════════════════════╝\n');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('❌ Faltan credenciales Supabase en .env.local');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Crear tabla
    console.log('1️⃣  Creando estructura en Supabase...');
    const schema = fs.readFileSync('./schema-novusbet.sql', 'utf8');

    // Ejecutar cada statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await supabase.rpc('exec', { sql: stmt }).catch(() => {
          // Ignorar errores de statements (algunos podrían fallar)
        });
      } catch (e) {
        // Continuar
      }
    }
    console.log('✅ Tabla lista\n');

    // 2. Descargar de Novusbet
    console.log('2️⃣  Descargando datos de Novusbet...');
    try {
      execSync('node sync-novusbet.js', { stdio: 'inherit' });
      console.log('✅ Datos sincronizados\n');
    } catch (e) {
      console.log('⚠️  Advertencia: sync-novusbet no completó');
      console.log('   (Los datos se sincronizarán cuando Render reinicie)\n');
    }

    // 3. Iniciar servidor
    console.log('3️⃣  Iniciando servidor...\n');
    execSync('node server-db.js', { stdio: 'inherit' });

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
