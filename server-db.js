/**
 * SERVIDOR CON SUPABASE - DASHBOARD GENIUS
 * Conecta con base de datos PostgreSQL normalizada
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const DASHBOARD_DIR = path.join(__dirname, 'dashboard');

// Configurar Supabase (cliente admin con service key para poder leer/escribir todo)
let supabase = null;
// .trim() y limpieza de comillas: es común pegar la URL/key en Render con
// comillas o espacios de sobra, lo que rompe new URL() dentro del cliente.
function limpiarEnvVar(valor) {
  if (!valor) return '';
  return valor.trim().replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = limpiarEnvVar(process.env.SUPABASE_URL);
const SUPABASE_KEY = limpiarEnvVar(process.env.SUPABASE_SERVICE_KEY) || limpiarEnvVar(process.env.SUPABASE_ANON_KEY);

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Conectado a Supabase');
  } catch (err) {
    console.log('❌ SUPABASE_URL o SUPABASE_SERVICE_KEY inválidas:', err.message);
    console.log('   Revisa que no tengan comillas ni espacios en Render → Environment');
    supabase = null;
  }
} else {
  console.log('⚠️ Variables de Supabase no configuradas, usando datos de prueba');
}

// ============================================================
// AUTENTICACIÓN (usuario administrativo)
// ============================================================

const sesiones = new Map(); // sessionId -> { username, expires }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
let adminTableLista = false; // se activa solo si admin_usuarios existe y responde bien

// Métricas de la sincronización en vivo (para mostrar progreso real en el dashboard)
const syncStatus = {
  estado: 'nunca', // nunca | sincronizando | completado | error
  inicio: null,
  fin: null,
  filas: 0,
  mensaje: '',
};

// Métricas de la sincronización de usuarios reales (estado de cuenta:
// Habilitado/Congelado/Cancelado/etc, viene de /backoffice/users, no del CSV
// de transacciones). Se sincroniza sola, automáticamente — sin subir nada.
const syncStatusUsuarios = {
  estado: 'nunca',
  inicio: null,
  fin: null,
  filas: 0,
  mensaje: '',
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Supabase/PostgREST tiene un tope de filas por respuesta (típicamente
// 1000) sin importar qué .range() se pida explícitamente. Para agregados
// que necesitan ver TODAS las filas (no solo una muestra), hay que paginar
// en lotes hasta que una página vuelva vacía o incompleta.
async function fetchTodasLasFilas(tabla, columnas, limiteMax = 100000) {
  const LOTE = 1000;
  let todas = [];
  let offset = 0;

  while (todas.length < limiteMax) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .range(offset, offset + LOTE - 1);

    if (error || !data || data.length === 0) break;

    todas = todas.concat(data);
    if (data.length < LOTE) break; // última página
    offset += LOTE;
  }

  return todas;
}

function generarSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const sid = cookies['dg_session'];
  if (!sid) return null;
  const sesion = sesiones.get(sid);
  if (!sesion) return null;
  if (sesion.expires < Date.now()) {
    sesiones.delete(sid);
    return null;
  }
  return { sid, ...sesion };
}

async function ensureAdminUser() {
  if (!supabase) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'DashboardGenius2026!';

  try {
    const { data, error } = await supabase
      .from('admin_usuarios')
      .select('id, username')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        console.log('⚠️ La tabla admin_usuarios no existe todavía. Ejecuta el SQL de setup en Supabase. El dashboard queda ABIERTO sin login hasta entonces.');
      } else {
        console.log('⚠️ Error verificando usuario admin:', error.message);
      }
      return;
    }

    adminTableLista = true;

    if (!data) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);

      const { error: insertError } = await supabase.from('admin_usuarios').insert({
        username,
        password_hash: passwordHash,
        salt,
        rol: 'admin',
      });

      if (insertError) {
        console.log('⚠️ Error creando usuario admin:', insertError.message);
      } else {
        console.log(`✅ Usuario administrativo creado → usuario: "${username}" contraseña: "${password}"`);
        console.log('   (Cámbiala luego con la variable de entorno ADMIN_PASSWORD)');
      }
    } else {
      console.log(`✅ Usuario administrativo "${username}" ya existe`);
    }
  } catch (err) {
    console.log('⚠️ Error en ensureAdminUser:', err.message);
  }
}

async function verificarCredenciales(username, password) {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('admin_usuarios')
    .select('username, password_hash, salt')
    .eq('username', username)
    .maybeSingle();

  if (error || !data) return false;

  const hash = hashPassword(password, data.salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(data.password_hash, 'hex');

  if (hashBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, storedBuf);
}

// Rutas que no requieren sesión iniciada
const RUTAS_PUBLICAS = new Set(['/login.html', '/api/login']);

// ============================================================
// CARGA DE DATOS REALES DESDE NOVUSBET
// ============================================================

async function cargarDatosAutomatico() {
  if (!supabase) return;

  if (!process.env.BO_USERNAME || !process.env.BO_PASSWORD) {
    console.log('⚠️ Faltan BO_USERNAME/BO_PASSWORD, no se puede sincronizar con Novusbet');
    return;
  }

  // Siempre trae datos REALES al arrancar (reemplaza cualquier dato de
  // prueba que hubiera quedado). sync-novusbet.js solo borra la tabla
  // justo antes de insertar los nuevos registros, así que si el login o
  // la descarga fallan, los datos existentes quedan intactos.
  syncStatus.estado = 'sincronizando';
  syncStatus.inicio = new Date().toISOString();
  syncStatus.mensaje = 'Conectando a Novusbet...';

  try {
    console.log('📝 Sincronizando datos REALES desde Novusbet...');
    const { main: sincronizarNovusbet, actualizarResumenDiario, podarTransaccionesDelDia, END_DATE } = require('./sync-novusbet');
    const total = await sincronizarNovusbet();
    await actualizarResumenDiario(END_DATE);
    await podarTransaccionesDelDia(END_DATE);
    console.log(`✅ Sincronización real completada: ${total || 0} transacciones`);
    syncStatus.estado = 'completado';
    syncStatus.fin = new Date().toISOString();
    syncStatus.filas = total || 0;
    syncStatus.mensaje = `${total || 0} transacciones cargadas`;
  } catch (syncErr) {
    console.log('⚠️ No se pudo sincronizar con Novusbet ahora mismo:', syncErr.message);
    syncStatus.estado = 'error';
    syncStatus.fin = new Date().toISOString();
    syncStatus.mensaje = syncErr.message;
  }
}

// Trae el estado REAL de cuenta (Habilitado/Congelado/Cancelado/solo lectura/
// para validar) directo del backoffice — sin CSV, sin subir nada a mano.
// Se llama sola al arrancar y en cada re-sincronización periódica.
async function sincronizarUsuariosAutomatico() {
  if (!supabase) return;

  if (!process.env.BO_USERNAME || !process.env.BO_PASSWORD) {
    console.log('⚠️ Faltan BO_USERNAME/BO_PASSWORD, no se puede sincronizar usuarios con Novusbet');
    return;
  }

  if (syncStatusUsuarios.estado === 'sincronizando') return;

  syncStatusUsuarios.estado = 'sincronizando';
  syncStatusUsuarios.inicio = new Date().toISOString();
  syncStatusUsuarios.mensaje = 'Conectando a Novusbet (Usuarios)...';

  try {
    const { sincronizarUsuarios } = require('./sync-novusbet');
    const total = await sincronizarUsuarios((progreso) => {
      syncStatusUsuarios.mensaje = `Página ${progreso.pagina}: ${progreso.totalGuardados}${progreso.totalEsperado ? ` / ${progreso.totalEsperado}` : ''} usuarios`;
    });
    console.log(`✅ Sincronización de usuarios completada: ${total} usuarios`);
    syncStatusUsuarios.estado = 'completado';
    syncStatusUsuarios.fin = new Date().toISOString();
    syncStatusUsuarios.filas = total;
    syncStatusUsuarios.mensaje = `${total} usuarios sincronizados`;
  } catch (syncErr) {
    console.log('⚠️ No se pudo sincronizar usuarios con Novusbet ahora mismo:', syncErr.message);
    syncStatusUsuarios.estado = 'error';
    syncStatusUsuarios.fin = new Date().toISOString();
    syncStatusUsuarios.mensaje = syncErr.message;
  }
}

// Re-sincroniza periódicamente para mantener datos reales frescos.
// Cada sync completa toma ~1 minuto para ~22-35k transacciones del día,
// así que cada 30 min por defecto es razonable para sentirse "en tiempo
// real" sin saturar el backoffice de Novusbet. Ajustable con
// SYNC_INTERVAL_MINUTES en las variables de entorno.
function programarResincronizacion() {
  const minutos = parseInt(process.env.SYNC_INTERVAL_MINUTES || '30', 10);
  const intervaloMs = minutos * 60 * 1000;
  setInterval(() => {
    console.log(`🔄 Re-sincronizando transacciones reales desde Novusbet (cada ${minutos} min)...`);
    cargarDatosAutomatico();
    sincronizarUsuariosAutomatico();
  }, intervaloMs);
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
    // LOGIN
    if (pathname === '/api/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { username, password } = JSON.parse(body || '{}');
          const ok = await verificarCredenciales(username, password);

          if (!ok) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Usuario o contraseña incorrectos' }));
            return;
          }

          const sid = generarSessionId();
          sesiones.set(sid, { username, expires: Date.now() + SESSION_TTL_MS });

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `dg_session=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`
          });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Solicitud inválida' }));
        }
      });
      return;
    }

    // LOGOUT
    if (pathname === '/api/logout') {
      const sesion = getSessionFromRequest(req);
      if (sesion) sesiones.delete(sesion.sid);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'dg_session=; HttpOnly; Path=/; Max-Age=0'
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Verificación de sesión para todo lo demás (si hay usuarios admin configurados)
    if (!RUTAS_PUBLICAS.has(pathname)) {
      const requiereLogin = supabase !== null && adminTableLista;
      if (requiereLogin) {
        const sesion = getSessionFromRequest(req);
        if (!sesion) {
          if (pathname.startsWith('/api/') || pathname.startsWith('/download/')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No autenticado' }));
            return;
          }
          res.writeHead(302, { Location: '/login.html' });
          res.end();
          return;
        }
      }
    }

    // API: ESTADO DE SINCRONIZACIÓN (métricas en vivo)
    if (pathname === '/api/sync-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(syncStatus));
      return;
    }

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

    // API: TRANSACCIONES NOVUSBET (paginable + filtrable por fecha, para
    // poder navegar historial más allá de la primera página)
    if (pathname === '/api/transacciones-novusbet') {
      let transacciones = [];
      let total = 0;

      const limit = Math.min(parseInt(parsedUrl.query.limit, 10) || 1000, 5000);
      const offset = Math.max(parseInt(parsedUrl.query.offset, 10) || 0, 0);
      const desde = parsedUrl.query.desde; // YYYY-MM-DD
      const hasta = parsedUrl.query.hasta; // YYYY-MM-DD

      if (supabase) {
        let query = supabase
          .from('transacciones_novusbet')
          .select('*', { count: 'exact' })
          .order('fecha', { ascending: false });

        if (desde) query = query.gte('fecha', `${desde}T00:00:00`);
        if (hasta) query = query.lte('fecha', `${hasta}T23:59:59`);

        const { data, count } = await query.range(offset, offset + limit - 1);
        transacciones = data || [];
        total = count || 0;

        // Cruza con usuarios_novusbet para mostrar el estado REAL de cuenta
        // (Habilitado/Congelado/etc.) en vez de "sin_dato" — el CSV de
        // transacciones nunca trajo el estado de cuenta, solo el de usuarios.
        try {
          const ids = [...new Set(transacciones.map((t) => t.id_usuario_novusbet).filter(Boolean))];
          if (ids.length > 0) {
            const { data: usuariosReales } = await supabase
              .from('usuarios_novusbet')
              .select('id_usuario, estado')
              .in('id_usuario', ids);
            const porId = {};
            (usuariosReales || []).forEach((u) => { porId[u.id_usuario] = u.estado; });
            transacciones.forEach((t) => {
              const real = porId[t.id_usuario_novusbet];
              if (real) t.estado_real = real;
            });
          }
        } catch (e) {
          // usuarios_novusbet puede no existir todavía, no es crítico
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ datos: transacciones, total, offset, limit }));
      return;
    }

    // API: DISPARAR SINCRONIZACIÓN HISTÓRICA (día por día, hasta N días atrás)
    if (pathname === '/api/admin/sync-historico' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        let dias = 7;
        try {
          const parsed = JSON.parse(body || '{}');
          // Hasta ~200 días (~6.5 meses) para poder traer el histórico
          // completo de 6 meses pedido para el ranking de jugadores.
          dias = Math.min(Math.max(parseInt(parsed.dias, 10) || 7, 1), 200);
        } catch (e) {}

        if (syncStatus.estado === 'sincronizando') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ya hay una sincronización en curso' }));
          return;
        }

        syncStatus.estado = 'sincronizando';
        syncStatus.inicio = new Date().toISOString();
        syncStatus.mensaje = `Sincronizando histórico de ${dias} días...`;

        const { syncHistorico } = require('./sync-novusbet');
        // El resumen diario (para el ranking) y la poda del detalle viejo
        // ya se hacen adentro de syncHistorico, día por día, a medida que
        // avanza — no hace falta un paso aparte al final.
        syncHistorico(dias, (progreso) => {
          syncStatus.mensaje = `Histórico: día ${progreso.diasProcesados}/${progreso.diasTotal} (${progreso.totalGeneral} transacciones)`;
        }).then(async (resultado) => {
          syncStatus.estado = 'completado';
          syncStatus.fin = new Date().toISOString();
          syncStatus.filas = resultado.totalGeneral;
          syncStatus.mensaje = `Histórico completado: ${dias} días, ${resultado.totalGeneral} transacciones`;
        }).catch((err) => {
          syncStatus.estado = 'error';
          syncStatus.fin = new Date().toISOString();
          syncStatus.mensaje = err.message;
        });

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, mensaje: `Sincronización histórica de ${dias} días iniciada en segundo plano` }));
      });
      return;
    }

    // API: SINCRONIZAR USUARIOS (estado real de cuenta: Habilitado, Congelado,
    // solo lectura, etc.) directo desde el backoffice de Novusbet — automático,
    // sin descargar ni subir nada a mano.
    if (pathname === '/api/admin/sync-usuarios' && req.method === 'POST') {
      if (syncStatusUsuarios.estado === 'sincronizando') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ya hay una sincronización de usuarios en curso' }));
        return;
      }
      sincronizarUsuariosAutomatico();
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mensaje: 'Sincronización de usuarios iniciada en segundo plano' }));
      return;
    }

    // API: ESTADO DE LA SINCRONIZACIÓN DE USUARIOS (para mostrar progreso real)
    if (pathname === '/api/sync-status-usuarios') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(syncStatusUsuarios));
      return;
    }

    // API: USUARIOS NOVUSBET (con estado real de cuenta)
    if (pathname === '/api/usuarios-novusbet') {
      let usuarios = [];
      if (supabase) {
        usuarios = await fetchTodasLasFilas('usuarios_novusbet', '*');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usuarios));
      return;
    }

    // API: RESUMEN POR DISCIPLINA NOVUSBET (agregados sobre TODAS las filas,
    // no solo las primeras 1000 que Supabase devuelve por defecto)
    if (pathname === '/api/transacciones-resumen') {
      let resumen = {
        total_transacciones: 0,
        monto_total: 0,
        usuarios_unicos: 0,
        por_disciplina: {},
        por_estado_cliente: {},
      };

      if (supabase) {
        const data = await fetchTodasLasFilas('transacciones_novusbet', 'disciplina, estado_cliente, id_usuario_novusbet, monto, usuario');

        if (data) {
          // Cruza con usuarios_novusbet para usar el estado REAL de cuenta
          // cuando ya está sincronizado, en vez de "sin_dato" del CSV de
          // transacciones (que nunca trajo ese campo).
          let estadoRealPorId = {};
          try {
            const usuariosReales = await fetchTodasLasFilas('usuarios_novusbet', 'id_usuario, estado');
            usuariosReales.forEach((u) => { estadoRealPorId[u.id_usuario] = u.estado; });
          } catch (e) {
            // usuarios_novusbet puede no existir todavía, no es crítico
          }

          const usuariosSet = new Set();
          data.forEach((t) => {
            const disc = (t.disciplina || 'otros').toLowerCase();
            const real = estadoRealPorId[t.id_usuario_novusbet];
            const estado = (real || t.estado_cliente || 'otros').toLowerCase();

            if (!resumen.por_disciplina[disc]) resumen.por_disciplina[disc] = { count: 0, monto: 0 };
            resumen.por_disciplina[disc].count += 1;
            resumen.por_disciplina[disc].monto += t.monto || 0;

            if (!resumen.por_estado_cliente[estado]) resumen.por_estado_cliente[estado] = { count: 0, monto: 0 };
            resumen.por_estado_cliente[estado].count += 1;
            resumen.por_estado_cliente[estado].monto += t.monto || 0;

            resumen.monto_total += t.monto || 0;
            resumen.total_transacciones += 1;
            if (t.usuario) usuariosSet.add(t.usuario);
          });
          resumen.usuarios_unicos = usuariosSet.size;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resumen));
      return;
    }

    // API: MATRIZ DE USUARIOS derivada de las transacciones reales.
    // No es el estado oficial de cuenta de Novusbet (eso vive en una
    // pantalla separada por WebSocket que no pudimos capturar todavía) —
    // es un estimado de actividad basado en la última transacción vista,
    // por eso se marca explícitamente como "aprox." en vez de "real".
    if (pathname === '/api/usuarios-matriz') {
      const usuarios = {};

      if (supabase) {
        const data = await fetchTodasLasFilas('transacciones_novusbet', 'id_usuario_novusbet, usuario, casa_apuestas, monto, disciplina, juego, fecha');

        if (data) {
          const ahora = Date.now();
          const UN_DIA = 24 * 60 * 60 * 1000;

          data.forEach((t) => {
            const id = t.id_usuario_novusbet || t.usuario || 'desconocido';
            if (!usuarios[id]) {
              usuarios[id] = {
                id_usuario_novusbet: id,
                usuario: t.usuario,
                casa_apuestas: t.casa_apuestas,
                transacciones: 0,
                monto_total: 0,
                disciplinas: new Set(),
                juegos: new Set(),
                ultima_actividad: null,
              };
            }
            const u = usuarios[id];
            u.transacciones += 1;
            u.monto_total += t.monto || 0;
            if (t.disciplina) u.disciplinas.add(t.disciplina);
            if (t.juego) u.juegos.add(t.juego);
            if (t.fecha && (!u.ultima_actividad || new Date(t.fecha) > new Date(u.ultima_actividad))) {
              u.ultima_actividad = t.fecha;
            }
          });

          Object.values(usuarios).forEach((u) => {
            u.disciplinas = Array.from(u.disciplinas);
            u.juegos = Array.from(u.juegos);
            const antiguedadMs = u.ultima_actividad ? ahora - new Date(u.ultima_actividad).getTime() : Infinity;
            // Estimado, no el estado real de cuenta de Novusbet
            u.estado_actividad_aprox = antiguedadMs <= UN_DIA ? 'activo_aprox' : antiguedadMs <= 3 * UN_DIA ? 'reciente_aprox' : 'inactivo_aprox';
          });

          // Si ya sincronizamos usuarios_novusbet (automático, ver
          // sincronizarUsuariosAutomatico), usa el estado REAL de cuenta
          // (Habilitado/Congelado/etc.) en vez del estimado por actividad
          try {
            const usuariosReales = await fetchTodasLasFilas('usuarios_novusbet', 'id_usuario, estado, nombre, apellido, correo');
            const porId = {};
            usuariosReales.forEach((u) => { porId[u.id_usuario] = u; });

            Object.values(usuarios).forEach((u) => {
              const real = porId[u.id_usuario_novusbet];
              if (real) {
                u.estado_real = real.estado;
                u.nombre_completo = [real.nombre, real.apellido].filter(Boolean).join(' ');
                u.correo = real.correo;
              }
            });
          } catch (e) {
            // Tabla usuarios_novusbet puede no existir todavía, no es crítico
          }
        }
      }

      const lista = Object.values(usuarios).sort((a, b) => new Date(b.ultima_actividad || 0) - new Date(a.ultima_actividad || 0));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lista));
      return;
    }

    // API: RANKING DE JUGADORES (últimos N meses, default 6). Se arma con
    // obtener_ranking_jugadores(), una función SQL que suma
    // resumen_diario_usuarios (liviana, se llena día a día en cada
    // sincronización) directo en la base — no hace falta traer millones
    // de filas del historial crudo a la app para esto.
    if (pathname === '/api/ranking-jugadores') {
      const meses = Math.min(Math.max(parseInt(parsedUrl.query.meses, 10) || 6, 1), 24);
      let ranking = [];

      if (supabase) {
        try {
          const { data, error } = await supabase.rpc('obtener_ranking_jugadores', { meses });
          if (error) throw error;
          ranking = data || [];
        } catch (e) {
          // resumen_diario_usuarios / obtener_ranking_jugadores puede no existir todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ meses, ranking }));
      return;
    }

    // API: ALERTAS DE APUESTAS GRANDES (monto por encima del umbral
    // configurado, ver UMBRAL_ALERTA_APUESTA en sync-novusbet.js)
    if (pathname === '/api/alertas-apuestas') {
      const limit = Math.min(parseInt(parsedUrl.query.limit, 10) || 100, 1000);
      let alertas = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from('alertas_apuestas')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(limit);
          alertas = data || [];
        } catch (e) {
          // alertas_apuestas puede no existir todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(alertas));
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

server.listen(PORT, async () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║    🎯 Dashboard Genius - Corriendo    ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`🖥️  Servidor: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 APIs: /api/usuarios, /api/resumen, /api/disciplinas`);
  console.log(`📥 Descargas: /download/usuarios.csv, /download/apuestas.csv, /download/transacciones.csv`);
  console.log(`📄 Reporte JSON: /download/reporte-completo.json`);
  console.log(`\n⏸️  Presiona Ctrl+C para detener\n`);

  // Usuario administrativo
  await ensureAdminUser();

  // Cargar datos automáticamente (no bloquea el arranque, corre en paralelo)
  cargarDatosAutomatico();
  sincronizarUsuariosAutomatico();

  // Mantener datos reales frescos periódicamente (transacciones + usuarios)
  programarResincronizacion();
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
  process.exit(1);
});

// Red de seguridad: un error inesperado en cualquier parte (ej. una tarea
// en segundo plano como la re-sincronización) NUNCA debe tumbar el proceso
// completo y dejar el dashboard sin servir.
process.on('uncaughtException', (err) => {
  console.error('❌ Excepción no capturada (el servidor sigue corriendo):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promesa rechazada sin manejar (el servidor sigue corriendo):', reason);
});
