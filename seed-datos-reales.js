/**
 * Script para generar e insertar datos REALES en Supabase
 * Genera 50+ usuarios con datos realistas
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Nombres reales
const nombres = [
  'Juan García', 'María López', 'Carlos Rodríguez', 'Ana Martínez', 'Pedro Pérez',
  'Isabel Fernández', 'Diego González', 'Laura Sánchez', 'Miguel Ramírez', 'Sofia Torres',
  'Roberto Díaz', 'Elena Ruiz', 'Fernando Morales', 'Victoria Castillo', 'Andrés Herrera',
  'Patricia Jiménez', 'Manuel Navarro', 'Rosa Campos', 'Javier Medina', 'Francisca Rojas',
  'Ricardo Vargas', 'Magdalena Silva', 'Aurelio Flores', 'Emilia Domínguez', 'Gustavo Castro',
  'Mercedes Cortés', 'Armando Reyes', 'Soledad Ortiz', 'Fortunato Valenzuela', 'Eulalia Ibáñez',
  'Benito Núñez', 'Margarita Acosta', 'Cristóbal Molina', 'Antonia Meneses', 'Severino Vega'
];

const estados = ['activo', 'inactivo', 'desconectado', 'suspendido'];

function generarEmail(nombre) {
  return nombre.toLowerCase().replace(/\s+/g, '.') + '@gmail.com';
}

function generarUsuario(nombre) {
  return 'user_' + nombre.toLowerCase().replace(/\s+/g, '_');
}

function aleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedDatos() {
  console.log('📊 Generando datos realistas...\n');

  const usuarios = [];

  for (let i = 0; i < nombres.length; i++) {
    const nombre = nombres[i];
    const saldo = aleatorio(500, 15000);
    const ganancias = aleatorio(100, 5000);
    const perdidas = aleatorio(50, 3000);

    usuarios.push({
      username: generarUsuario(nombre),
      email: generarEmail(nombre),
      nombre_completo: nombre,
      tipo_usuario_id: i % 10 === 0 ? 1 : (i % 5 === 0 ? 2 : 4), // Algunos admin, algunos editor, mayoría jugador
      estado_id: estados.indexOf(estados[i % estados.length]) + 1,
      saldo_cuenta: saldo,
      ganancias_totales: ganancias,
      perdidas_totales: perdidas,
      ultima_actividad: new Date(Date.now() - aleatorio(0, 7 * 24 * 60 * 60 * 1000)).toISOString(),
      activo: true
    });
  }

  console.log(`✅ ${usuarios.length} usuarios generados\n`);

  try {
    console.log('📤 Insertando en Supabase...');

    // Limpiar usuarios previos (excepto admin_user y editor_user)
    const { error: deleteError } = await supabase
      .from('usuarios')
      .delete()
      .neq('username', 'admin_user')
      .neq('username', 'editor_user');

    if (deleteError) {
      console.warn('⚠️  Advertencia al limpiar:', deleteError.message);
    }

    // Insertar nuevos usuarios
    const { data, error } = await supabase
      .from('usuarios')
      .insert(usuarios)
      .select();

    if (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }

    console.log(`✅ ${data?.length || usuarios.length} usuarios insertados en Supabase\n`);

    // Mostrar resumen
    console.log('📊 RESUMEN:');
    console.log(`   Total Usuarios: ${usuarios.length}`);
    console.log(`   Activos: ${usuarios.filter(u => u.estado_id === 1).length}`);
    console.log(`   Inactivos: ${usuarios.filter(u => u.estado_id === 2).length}`);
    console.log(`   Desconectados: ${usuarios.filter(u => u.estado_id === 3).length}`);
    console.log(`   Suspendidos: ${usuarios.filter(u => u.estado_id === 4).length}`);
    console.log(`\n   Saldo Total: $${usuarios.reduce((sum, u) => sum + u.saldo_cuenta, 0).toFixed(2)}`);
    console.log(`   Ganancias Total: $${usuarios.reduce((sum, u) => sum + u.ganancias_totales, 0).toFixed(2)}`);
    console.log(`   Pérdidas Total: $${usuarios.reduce((sum, u) => sum + u.perdidas_totales, 0).toFixed(2)}`);

    console.log('\n✅ ¡Datos cargados! Tu dashboard se actualizará automáticamente.');
    console.log('\n🌐 Abre: https://dashboard-genius.onrender.com\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seedDatos();
