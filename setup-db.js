/**
 * Script para ejecutar schema SQL en Supabase
 * Uso: node setup-db.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setupDatabase() {
  try {
    console.log('📡 Conectando a Supabase...');
    console.log(`URL: ${SUPABASE_URL}`);

    // Leer el schema SQL
    const schema = fs.readFileSync('./schema-normalizado.sql', 'utf8');

    console.log('📝 Leyendo schema SQL...');
    console.log(`Tamaño: ${schema.length} caracteres`);

    // Dividir por puntos y comas (;) para ejecutar cada statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📊 Total de statements: ${statements.length}`);

    // Ejecutar cada statement
    let executed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      try {
        const { error } = await supabase.rpc('exec', { sql: stmt });
        if (error) {
          console.warn(`⚠️  Statement ${i + 1} (parcial): ${stmt.substring(0, 50)}...`);
          console.warn(`   Error: ${error.message}`);
        } else {
          executed++;
          if (executed % 10 === 0) {
            console.log(`✅ ${executed}/${statements.length} statements ejecutados`);
          }
        }
      } catch (err) {
        console.warn(`⚠️  Error en statement ${i + 1}: ${err.message}`);
      }
    }

    console.log('\n✅ Setup completado!');
    console.log(`   ${executed} statements ejecutados`);
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Ve a https://supabase.com/dashboard');
    console.log('   2. Entra en tu proyecto: dashboard-Genius');
    console.log('   3. Ve a SQL Editor');
    console.log('   4. Copia el contenido de schema-normalizado.sql');
    console.log('   5. Pégalo en el editor y haz click en "Run"');
    console.log('\n   O ejecuta este script nuevamente una vez configurado.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();
