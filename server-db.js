/**
 * SERVIDOR CON SUPABASE - DASHBOARD GENIUS
 * Conecta con base de datos PostgreSQL normalizada
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const DASHBOARD_DIR = path.join(__dirname, 'dashboard');

// Configurar Supabase
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  console.log('✅ Conectado a Supabase');
} else {
  console.log('⚠️ Variables de Supabase no configuradas, usando datos de prueba');
}

// Tipos MIME
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Datos de prueba si no hay Supabase
const DATOS_PRUEBA = {
  usuarios: [
    { id: 1, username: 'user1', nombre_completo: 'Juan García', estado: 'activo', saldo_cuenta: 5000, ganancias_totales: 2500, perdidas_totales: 1000 },
    { id: 2, username: 'user2', nombre_completo: 'María López', estado: 'activo', saldo_cuenta: 3500, ganancias_totales: 1800, perdidas_totales: 1200 },
    { id: 3, username: 'user3', nombre_completo: 'Carlos Rodríguez', estado: 'inactivo', saldo_cuenta: 2000, ganancias_totales: 500, perdidas_totales: 300 }
  ],
  disciplinas: {
    deportes: 129,
    casino: 71,
    otros: 31
  },
  resumen: {
    activo: 175,
    inactivo: 56,
    desconectado: 11,
    suspendido: 4,
    otros: 2
  }
};

// Helper para generar CSV
function generarCSV(datos, headers) {
  const csv = [headers.join(',')];
  datos.forEach(row => {
    const valores = headers.map(h => {
      const valor = row[h];
      if (valor === null || valor === undefined) return '';
      if (typeof valor === 'string' && (valor.includes(',') || valor.includes('"'))) {
        return `"${valor.replace(/"/g, '""')}"`;
      }
      return valor;
    });
    csv.push(valores.join(','));
  });
  return csv.join('\n');
}

// Crear servidor
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`📡 ${req.method} ${pathname}`);

  try {
    // API: USUARIOS
    if (pathname === '/api/usuarios') {
      let usuarios;
      if (supabase) {
        const { data, error } = await supabase
          .from('usuarios')
          .select('id, username, nombre_completo, estado_id, saldo_cuenta, ultima_actividad')
          .eq('activo', true)
          .order('nombre_completo');

        usuarios = data || [];
        if (error) console.error('Error:', error);
      } else {
        usuarios = DATOS_PRUEBA.usuarios;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usuarios));
      return;
    }

    // API: RESUMEN
    if (pathname === '/api/resumen') {
      let resumen;
      if (supabase) {
        const { data, error } = await supabase
          .from('usuarios')
          .select('estado_id, estados_usuario(nombre)')
          .eq('activo', true);

        if (data) {
          const conteo = {};
          data.forEach(u => {
            const estado = u.estados_usuario?.nombre || 'otros';
            conteo[estado] = (conteo[estado] || 0) + 1;
          });
          resumen = { totals: conteo, generated_at: new Date().toISOString() };
        } else {
          resumen = { totals: DATOS_PRUEBA.resumen, generated_at: new Date().toISOString() };
        }
      } else {
        resumen = { totals: DATOS_PRUEBA.resumen, generated_at: new Date().toISOString() };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resumen));
      return;
    }

    // API: DISCIPLINAS
    if (pathname === '/api/disciplinas') {
      let disciplinas;
      if (supabase) {
        const { data, error } = await supabase.from('disciplinas').select('*').eq('activa', true);
        disciplinas = data || [];
      } else {
        disciplinas = [
          { id: 1, nombre: 'Deportes', usuarios: DATOS_PRUEBA.disciplinas.deportes },
          { id: 2, nombre: 'Casino', usuarios: DATOS_PRUEBA.disciplinas.casino },
          { id: 3, nombre: 'Otros', usuarios: DATOS_PRUEBA.disciplinas.otros }
        ];
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(disciplinas));
      return;
    }

    // API: TRANSACCIONES NOVUSBET (EN TIEMPO REAL)
    if (pathname === '/api/transacciones-novusbet') {
      let transacciones = [];
      if (supabase) {
        const { data } = await supabase
          .from('transacciones_novusbet')
          .select('*')
          .order('fecha', { ascending: false })
          .limit(1000);
        transacciones = data || [];
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(transacciones));
      return;
    }

    // API: RESUMEN POR DISCIPLINA NOVUSBET
    if (pathname === '/api/transacciones-resumen') {
      let resumen = {};
      if (supabase) {
        const { data } = await supabase
          .from('transacciones_novusbet')
          .select('disciplina, monto');

        if (data) {
          resumen = { deportes: 0, casino: 0, otros: 0, total: 0 };
          data.forEach(t => {
            const disc = (t.disciplina || 'otros').toLowerCase();
            if (resumen[disc] !== undefined) {
              resumen[disc] += (t.monto || 0);
            } else {
              resumen[disc] = (t.monto || 0);
            }
            resumen.total += (t.monto || 0);
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resumen));
      return;
    }

    // DESCARGAR: CSV de Usuarios
    if (pathname === '/download/usuarios.csv') {
      let usuarios;
      if (supabase) {
        const { data } = await supabase
          .from('usuarios')
          .select('id, username, nombre_completo, saldo_cuenta, ganancias_totales, perdidas_totales')
          .eq('activo', true)
          .order('nombre_completo');
        usuarios = data || [];
      } else {
        usuarios = DATOS_PRUEBA.usuarios;
      }

      const csv = generarCSV(usuarios, ['id', 'username', 'nombre_completo', 'saldo_cuenta', 'ganancias_totales', 'perdidas_totales']);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="usuarios-${new Date().toISOString().split('T')[0]}.csv"`
      });
      res.end('﻿' + csv); // BOM para Excel
      return;
    }

    // DESCARGAR: CSV de Transacciones Novusbet
    if (pathname === '/download/transacciones-novusbet.csv') {
      let transacciones;
      if (supabase) {
        const { data } = await supabase
          .from('transacciones_novusbet')
          .select('usuario, tipo_transaccion, monto, disciplina, descripcion, fecha')
          .order('fecha', { ascending: false })
          .limit(5000);
        transacciones = data || [];
      } else {
        transacciones = [];
      }

      const csv = generarCSV(transacciones, ['usuario', 'tipo_transaccion', 'monto', 'disciplina', 'descripcion', 'fecha']);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transacciones-novusbet-${new Date().toISOString().split('T')[0]}.csv"`
      });
      res.end('﻿' + csv);
      return;
    }

    // DESCARGAR: CSV de Apuestas
    if (pathname === '/download/apuestas.csv') {
      let apuestas;
      if (supabase) {
        const { data } = await supabase
          .from('apuestas')
          .select('id, usuario_id, monto_apostado, cuota_aplicada, resultado, fecha_apuesta')
          .limit(1000)
          .order('fecha_apuesta', { ascending: false });
        apuestas = data || [];
      } else {
        apuestas = [];
      }

      const csv = generarCSV(apuestas, ['id', 'usuario_id', 'monto_apostado', 'cuota_aplicada', 'resultado', 'fecha_apuesta']);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="apuestas-${new Date().toISOString().split('T')[0]}.csv"`
      });
      res.end('﻿' + csv);
      return;
    }

    // DESCARGAR: CSV de Transacciones
    if (pathname === '/download/transacciones.csv') {
      let transacciones;
      if (supabase) {
        const { data } = await supabase
          .from('transacciones')
          .select('id, usuario_id, tipo, monto, saldo_nuevo, descripcion, fecha_transaccion')
          .limit(1000)
          .order('fecha_transaccion', { ascending: false });
        transacciones = data || [];
      } else {
        transacciones = [];
      }

      const csv = generarCSV(transacciones, ['id', 'usuario_id', 'tipo', 'monto', 'saldo_nuevo', 'descripcion', 'fecha_transaccion']);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transacciones-${new Date().toISOString().split('T')[0]}.csv"`
      });
      res.end('﻿' + csv);
      return;
    }

    // DESCARGAR: JSON completo
    if (pathname === '/download/reporte-completo.json') {
      let reporte = {};
      if (supabase) {
        const [usuarios, apuestas, transacciones] = await Promise.all([
          supabase.from('usuarios').select('*').limit(1000),
          supabase.from('apuestas').select('*').limit(1000),
          supabase.from('transacciones').select('*').limit(1000)
        ]);
        reporte = {
          usuarios: usuarios.data || [],
          apuestas: apuestas.data || [],
          transacciones: transacciones.data || [],
          generado: new Date().toISOString()
        };
      } else {
        reporte = { usuarios: DATOS_PRUEBA.usuarios, mensaje: 'Datos de prueba (sin Supabase)' };
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte-${new Date().toISOString().split('T')[0]}.json"`
      });
      res.end(JSON.stringify(reporte, null, 2));
      return;
    }

    // Archivos estáticos
    if (pathname === '/' || pathname === '') {
      pathname = '/inicio.html';
    }

    const filePath = path.join(DASHBOARD_DIR, pathname);

    // Seguridad
    if (!filePath.startsWith(DASHBOARD_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Leer archivo
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 - Archivo no encontrado</h1>');
        } else {
          res.writeHead(500);
          res.end('Error del servidor');
        }
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Headers anti-caché para HTML
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      res.writeHead(200, headers);
      res.end(data);
    });

  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║    🎯 Dashboard Genius - Corriendo    ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`🖥️  Servidor: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 APIs: /api/usuarios, /api/resumen, /api/disciplinas`);
  console.log(`📥 Descargas: /download/usuarios.csv, /download/apuestas.csv, /download/transacciones.csv`);
  console.log(`📄 Reporte JSON: /download/reporte-completo.json`);
  console.log(`\n⏸️  Presiona Ctrl+C para detener\n`);
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
  process.exit(1);
});
