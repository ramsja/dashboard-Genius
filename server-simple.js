/**
 * SERVIDOR SIMPLE Y CONFIABLE
 * Sin dependencias complejas, solo lo esencial
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DASHBOARD_DIR = path.join(__dirname, 'dashboard');

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

// Datos de prueba
const DATOS_RESUMEN = {
  totals: {
    activo: 175,
    inactivo: 56,
    desconectado: 11,
    suspendido: 4,
    otros: 2
  },
  generated_at: new Date().toISOString(),
  status_by_discipline: {
    deportes: { activo: 113, inactivo: 33, desconectado: 7, suspendido: 2, otros: 1 },
    casino: { activo: 61, inactivo: 22, desconectado: 3, suspendido: 1, otros: 0 }
  }
};

const DATOS_CAMPOS = {
  disciplines: { deportes: 129, casino: 71, otros: 31 },
  metadata: {
    total_records: 231,
    last_update: new Date().toISOString(),
    data_source: 'CSV'
  }
};

// Crear servidor
const server = http.createServer((req, res) => {
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

  // APIs
  if (pathname === '/api/resumen') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(DATOS_RESUMEN));
    return;
  }

  if (pathname === '/api/campos') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(DATOS_CAMPOS));
    return;
  }

  if (pathname === '/api/usuarios') {
    const usuarios = [
      { id: 1, username: 'user1', estado: 'activo', last_activity: new Date().toISOString() },
      { id: 2, username: 'user2', estado: 'inactivo', last_activity: new Date().toISOString() },
      { id: 3, username: 'user3', estado: 'activo', last_activity: new Date().toISOString() }
    ];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(usuarios));
    return;
  }

  // Descargas CSV
  if (pathname === '/download/usuarios.csv') {
    const csv = 'id,username,estado\n1,user1,activo\n2,user2,inactivo\n3,user3,activo';
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="usuarios.csv"'
    });
    res.end(csv);
    return;
  }

  // Archivos estáticos
  if (pathname === '/' || pathname === '') {
    pathname = '/inicio.html';
  }

  const filePath = path.join(DASHBOARD_DIR, pathname);

  // Seguridad: no permitir salir del directorio
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

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║    🎯 Dashboard Genius - Corriendo    ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`🖥️  Servidor: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/resumen`);
  console.log(`📥 Descargas: http://localhost:${PORT}/download/usuarios.csv`);
  console.log(`\n⏸️  Presiona Ctrl+C para detener\n`);
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
  process.exit(1);
});
