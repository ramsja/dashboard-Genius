/**
 * SUPABASE CONFIGURATION
 *
 * Instrucciones:
 * 1. Crear cuenta en https://supabase.com
 * 2. Crear nuevo proyecto (PostgreSQL)
 * 3. Copiar URL y API keys
 * 4. Crear archivo .env.local con:
 *
 *    SUPABASE_URL=https://your-project.supabase.co
 *    SUPABASE_ANON_KEY=your-anon-key
 *    SUPABASE_SERVICE_KEY=your-service-role-key
 *
 * 5. Ejecutar: node import-data-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno no configuradas');
  console.error('Crear archivo .env.local con SUPABASE_URL y SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Cliente Supabase (service role para admin)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase, supabaseUrl };
