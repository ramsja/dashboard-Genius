const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const REPORTES_DIR = path.join(__dirname, 'reportes');

// Inicializar Supabase si está configurado
let supabase = null;
const USAR_SUPABASE = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;

if (USAR_SUPABASE) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    console.log('✅ Conectado a Supabase');
  } catch (err) {
    console.warn('⚠️  Supabase no disponible, usando archivos JSON');
  }
}

// Servir archivos estáticos
app.use(express.static('dashboard'));
app.use('/reportes', express.static('reportes'));

// Ruta principal - Centro de Control
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'inicio.html'));
});

// Ruta alternativa al dashboard original
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// API para obtener datos actuales
app.get('/api/resumen', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('estadisticas')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      if (data) return res.json(data);
    }

    // Fallback a archivos JSON
    const fileData = fs.readFileSync(path.join(REPORTES_DIR, 'clientes-resumen.json'), 'utf8');
    res.json(JSON.parse(fileData));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar el resumen' });
  }
});

app.get('/api/campos', async (req, res) => {
  try {
    if (supabase) {
      const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('*, disciplinas(nombre)')
        .limit(1000);

      if (error) throw error;

      const disciplines = {};
      usuarios?.forEach(u => {
        if (u.disciplinas?.nombre) {
          disciplines[u.disciplinas.nombre] = (disciplines[u.disciplinas.nombre] || 0) + 1;
        }
      });

      return res.json({ disciplines });
    }

    // Fallback a archivos JSON
    const fileData = fs.readFileSync(path.join(REPORTES_DIR, 'resumen-campos.json'), 'utf8');
    res.json(JSON.parse(fileData));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar los campos' });
  }
});

// Importar funciones de exportación
const { reporteUsuarios, reporteTransacciones, reporteEstadisticas, generarJSON, crearArchivo } = require('./export-reports');

// ============================================
// RUTAS DE DESCARGA
// ============================================

// Descargar usuarios CSV
app.get('/download/usuarios.csv', async (req, res) => {
  try {
    if (!supabase) {
      const fileData = fs.readFileSync(path.join(REPORTES_DIR, 'clientes-resumen.json'), 'utf8');
      const data = JSON.parse(fileData);
      return res.json(data);
    }

    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('*')
      .limit(1000);

    if (error) throw error;
    const csv = reporteUsuarios(usuarios || []);
    crearArchivo(csv, 'usuarios.csv', res);
  } catch (err) {
    res.status(500).json({ error: 'Error descargando usuarios' });
  }
});

// Descargar transacciones CSV
app.get('/download/transacciones.csv', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'BD no disponible' });

    const { data: transacciones, error } = await supabase
      .from('transacciones')
      .select('*')
      .limit(1000);

    if (error) throw error;
    const csv = reporteTransacciones(transacciones || []);
    crearArchivo(csv, 'transacciones.csv', res);
  } catch (err) {
    res.status(500).json({ error: 'Error descargando transacciones' });
  }
});

// Descargar estadísticas CSV
app.get('/download/estadisticas.csv', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'BD no disponible' });

    const { data: estadisticas, error } = await supabase
      .from('estadisticas')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    const csv = reporteEstadisticas(estadisticas || []);
    crearArchivo(csv, 'estadisticas.csv', res);
  } catch (err) {
    res.status(500).json({ error: 'Error descargando estadísticas' });
  }
});

// Descargar usuarios JSON
app.get('/download/usuarios.json', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'BD no disponible' });

    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('*')
      .limit(1000);

    if (error) throw error;
    const json = generarJSON(usuarios || [], 'Usuarios');
    crearArchivo(json, 'usuarios.json', res);
  } catch (err) {
    res.status(500).json({ error: 'Error descargando JSON' });
  }
});

// Descargar reporte completo ZIP (simulado como JSON)
app.get('/download/reporte-completo.json', async (req, res) => {
  try {
    const reporte = {
      fecha_descarga: new Date().toISOString(),
      fuente: 'Dashboard Genius',
      base_datos: 'Supabase PostgreSQL'
    };

    if (supabase) {
      const [usuariosRes, transaccionesRes, estadisticasRes, disciplinasRes] = await Promise.all([
        supabase.from('usuarios').select('*').limit(100),
        supabase.from('transacciones').select('*').limit(100),
        supabase.from('estadisticas').select('*'),
        supabase.from('disciplinas').select('*')
      ]);

      reporte.usuarios = usuariosRes.data || [];
      reporte.transacciones = transaccionesRes.data || [];
      reporte.estadisticas = estadisticasRes.data || [];
      reporte.disciplinas = disciplinasRes.data || [];
    }

    crearArchivo(JSON.stringify(reporte, null, 2), 'reporte-completo.json', res);
  } catch (err) {
    res.status(500).json({ error: 'Error generando reporte' });
  }
});

// Nuevas APIs de Supabase
app.get('/api/usuarios', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });

    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error cargando usuarios' });
  }
});

app.get('/api/transacciones', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });

    const { data, error } = await supabase
      .from('transacciones')
      .select('*, usuarios(username)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error cargando transacciones' });
  }
});

// WebSocket para actualizaciones en tiempo real
wss.on('connection', (ws) => {
  console.log('Cliente conectado');

  // Enviar datos iniciales
  try {
    const resumen = JSON.parse(fs.readFileSync(path.join(REPORTES_DIR, 'clientes-resumen.json'), 'utf8'));
    const campos = JSON.parse(fs.readFileSync(path.join(REPORTES_DIR, 'resumen-campos.json'), 'utf8'));
    ws.send(JSON.stringify({ type: 'init', resumen, campos }));
  } catch (err) {
    console.error('Error leyendo archivos:', err);
  }

  ws.on('close', () => {
    console.log('Cliente desconectado');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Monitorear cambios en archivos de datos
fs.watch(REPORTES_DIR, (eventType, filename) => {
  if (filename === 'clientes-resumen.json' || filename === 'resumen-campos.json') {
    setTimeout(() => {
      try {
        const resumen = JSON.parse(fs.readFileSync(path.join(REPORTES_DIR, 'clientes-resumen.json'), 'utf8'));
        const campos = JSON.parse(fs.readFileSync(path.join(REPORTES_DIR, 'resumen-campos.json'), 'utf8'));

        // Broadcast a todos los clientes conectados
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'update', resumen, campos }));
          }
        });
        console.log(`Datos actualizados: ${filename}`);
      } catch (err) {
        console.error('Error procesando cambios:', err);
      }
    }, 100); // Pequeño delay para asegurar que el archivo se escribió completamente
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Dashboard en línea: http://localhost:${PORT}`);
  console.log(`📡 WebSocket activo para actualizaciones en tiempo real`);
});
