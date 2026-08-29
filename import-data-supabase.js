/**
 * IMPORTAR DATOS DEL CSV A SUPABASE
 *
 * Uso: node import-data-supabase.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { supabase } = require('./supabase-config');

const CSV_PATH = path.join(__dirname, 'descargas/transacciones_producto__2026-08-28_2026-08-28.csv');

const mapearEstado = (tipo) => {
  if (tipo.includes('Online')) return 'activo';
  if (tipo.includes('Offline')) return 'inactivo';
  if (tipo.includes('Suspended')) return 'suspendido';
  return 'desconectado';
};

const mapearDisciplina = (producto) => {
  if (producto.includes('Casino')) return 'casino';
  if (producto.includes('Deporte') || producto.includes('SportBooks')) return 'deportes';
  return 'otros';
};

async function importarDatos() {
  try {
    console.log('📊 Iniciando importación de datos...\n');

    // 1. Crear disciplinas
    console.log('1️⃣  Creando disciplinas...');
    await supabase.from('disciplinas').insert([
      { nombre: 'deportes', descripcion: 'Apuestas deportivas' },
      { nombre: 'casino', descripcion: 'Juegos de casino' },
      { nombre: 'otros', descripcion: 'Otros productos' }
    ]).select();

    // 2. Obtener disciplinas
    const { data: disciplinas } = await supabase.from('disciplinas').select('id, nombre');
    const disciplinasMap = {};
    disciplinas.forEach(d => { disciplinasMap[d.nombre] = d.id; });

    console.log('✓ Disciplinas creadas\n');

    // 3. Leer y procesar CSV
    console.log('2️⃣  Leyendo transacciones del CSV...');
    const usuarios = new Map();
    const transacciones = [];
    const productos = new Set();

    const fileStream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headerProcessed = false;
    let lineCount = 0;

    for await (const line of rl) {
      if (!headerProcessed) {
        headerProcessed = true;
        continue;
      }

      lineCount++;
      if (lineCount % 500 === 0) console.log(`  ⏳ Procesados ${lineCount} registros...`);

      try {
        const parts = line.split(',');
        const userId = parts[3]?.replace(/"/g, '').trim();
        const username = parts[4]?.replace(/"/g, '').trim();
        const tipo = parts[6]?.replace(/"/g, '').trim();
        const moneda = parts[8]?.replace(/"/g, '').trim();
        const monto = parseFloat(parts[9]?.replace(/"/g, '').trim() || 0);
        const estado = parts[10]?.replace(/"/g, '').trim();
        const saldo = parseFloat(parts[11]?.replace(/"/g, '').trim() || 0);
        const comision = parseFloat(parts[12]?.replace(/"/g, '').trim() || 0);
        const producto = parts[19]?.replace(/"/g, '').trim();
        const descripcion = parts[20]?.replace(/"/g, '').trim();
        const ip = parts[22]?.replace(/"/g, '').trim();
        const fecha = parts[0]?.replace(/"/g, '').trim();

        if (!userId || !username) continue;

        // Registrar usuario
        if (!usuarios.has(userId)) {
          usuarios.set(userId, {
            id: parseInt(userId),
            username: username,
            estado: mapearEstado(tipo),
            casa_apuestas: 'geniusbet.sv',
            last_activity: fecha,
            created_at: fecha
          });
        }

        // Registrar producto
        if (producto) {
          productos.add({
            nombre: producto,
            disciplina: mapearDisciplina(producto)
          });
        }

        // Registrar transacción
        transacciones.push({
          id: parseInt(parts[6]?.replace(/"/g, '').trim() || Math.random() * 1000000),
          usuario_id: parseInt(userId),
          tipo: tipo === 'Withdraw' ? 'Withdraw' : tipo === 'Deposit' ? 'Deposit' : 'Bet',
          monto: Math.abs(monto),
          moneda: moneda || 'USD',
          saldo_actual: saldo,
          comision: Math.abs(comision),
          estado: estado === '-0.1' ? 'pending' : 'completed',
          descripcion: descripcion,
          ip_address: ip,
          created_at: fecha
        });
      } catch (err) {
        // Saltar líneas malformadas
      }
    }

    console.log(`✓ Procesados ${lineCount} registros del CSV\n`);

    // 4. Insertar usuarios
    console.log('3️⃣  Insertando usuarios...');
    const usuariosArray = Array.from(usuarios.values()).slice(0, 100);
    if (usuariosArray.length > 0) {
      const { error } = await supabase.from('usuarios').insert(usuariosArray);
      if (error && !error.message.includes('duplicate')) {
        console.error('⚠️  Error:', error);
      }
    }
    console.log(`✓ ${usuariosArray.length} usuarios insertados\n`);

    // 5. Insertar productos
    console.log('4️⃣  Insertando productos...');
    const productosArray = Array.from(productos).slice(0, 50).map(p => ({
      nombre: p.nombre,
      disciplina_id: disciplinasMap[p.disciplina]
    }));

    if (productosArray.length > 0) {
      const { error } = await supabase.from('productos').insert(productosArray);
      if (error && !error.message.includes('duplicate')) {
        console.error('⚠️  Error:', error);
      }
    }
    console.log(`✓ ${productosArray.length} productos insertados\n`);

    // 6. Insertar transacciones (primeras 500)
    console.log('5️⃣  Insertando transacciones...');
    const transaccionesArray = transacciones.slice(0, 500);

    if (transaccionesArray.length > 0) {
      const chunks = [];
      for (let i = 0; i < transaccionesArray.length; i += 100) {
        chunks.push(transaccionesArray.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const { error } = await supabase.from('transacciones').insert(chunk);
        if (error && !error.message.includes('duplicate')) {
          console.error('⚠️  Error en chunk:', error);
        }
      }
    }
    console.log(`✓ ${transaccionesArray.length} transacciones insertadas\n`);

    // 7. Generar estadísticas
    console.log('6️⃣  Generando estadísticas...');
    const stats = {
      fecha: new Date().toISOString().split('T')[0],
      total_usuarios: usuariosArray.length,
      usuarios_activos: usuariosArray.filter(u => u.estado === 'activo').length,
      usuarios_inactivos: usuariosArray.filter(u => u.estado === 'inactivo').length,
      usuarios_desconectados: usuariosArray.filter(u => u.estado === 'desconectado').length,
      usuarios_suspendidos: usuariosArray.filter(u => u.estado === 'suspendido').length,
      total_depositos: transaccionesArray
        .filter(t => t.tipo === 'Deposit')
        .reduce((sum, t) => sum + t.monto, 0),
      total_retiros: transaccionesArray
        .filter(t => t.tipo === 'Withdraw')
        .reduce((sum, t) => sum + t.monto, 0),
      total_apuestas: transaccionesArray
        .filter(t => t.tipo === 'Bet')
        .reduce((sum, t) => sum + t.monto, 0),
      comisiones_totales: transaccionesArray
        .reduce((sum, t) => sum + t.comision, 0)
    };

    await supabase.from('estadisticas').insert([stats]);
    console.log('✓ Estadísticas generadas\n');

    console.log('════════════════════════════════════════');
    console.log('✅ IMPORTACIÓN COMPLETADA');
    console.log('════════════════════════════════════════');
    console.log(`📊 Usuarios: ${usuariosArray.length}`);
    console.log(`📊 Productos: ${productosArray.length}`);
    console.log(`📊 Transacciones: ${transaccionesArray.length}`);
    console.log(`📊 Estadísticas: Guardadas`);
    console.log('════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Error en importación:', err);
    process.exit(1);
  }
}

importarDatos();
