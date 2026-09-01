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

// Le agrega nombre_completo a cada fila (nombre + apellido reales de
// usuarios_novusbet) buscando solo los IDs que aparecen en `filas`, para
// mostrar el nombre real en vez del código numérico donde ya lo tenemos
// sincronizado. Si el usuario no está sincronizado todavía, queda sin
// nombre_completo y el dashboard sigue mostrando el código.
async function agregarNombresReales(filas, idField = 'id_usuario_novusbet') {
  if (!supabase || filas.length === 0) return filas;
  try {
    const ids = [...new Set(filas.map((f) => f[idField]).filter(Boolean))];
    if (ids.length === 0) return filas;
    const { data } = await supabase
      .from('usuarios_novusbet')
      .select('id_usuario, nombre, apellido')
      .in('id_usuario', ids);
    const porId = {};
    (data || []).forEach((u) => {
      const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
      if (nombre) porId[u.id_usuario] = nombre;
    });
    filas.forEach((f) => {
      const nombre = porId[f[idField]];
      if (nombre) f.nombre_completo = nombre;
    });
  } catch (e) {
    // usuarios_novusbet puede no existir todavía, no es crítico
  }
  return filas;
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
    // El resumen diario y las alertas ya se calculan solos (en memoria,
    // sin volver a consultar la base) dentro de la sincronización.
    const { main: sincronizarNovusbet } = require('./sync-novusbet');
    const total = await sincronizarNovusbet();
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
// Con el plan gratuito de Supabase ya viendo el proyecto "exhausting
// multiple resources" a este volumen (80k-100k+ transacciones/día),
// 60 min por defecto (antes 30) le da más margen a la base entre
// sincronizaciones. Ajustable con SYNC_INTERVAL_MINUTES.
function programarResincronizacion() {
  const minutos = parseInt(process.env.SYNC_INTERVAL_MINUTES || '60', 10);
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
        // OJO: nunca select('*') acá. Esta lista se pide en cada carga del
        // dashboard (y en cada auto-refresh) — select('*') arrastra
        // datos_raw (el JSON crudo completo por fila) de cientos de filas
        // sin necesitarlo, y count:'exact' fuerza un COUNT sobre toda la
        // tabla (300k+ filas) en cada pedido. Las dos cosas juntas fueron
        // la causa real de los "statement timeout" repetidos. datos_raw
        // se trae aparte, por fila, solo cuando se abre el detalle
        // (ver /api/transacciones-novusbet/detalle).
        let query = supabase
          .from('transacciones_novusbet')
          .select(
            'id, id_transaccion_novusbet, usuario, tipo_transaccion, monto, disciplina, descripcion, fecha, estado_cliente, casa_apuestas, id_usuario_novusbet, moneda, ingresos, comision, saldo, saldo_actual, billeteras, grupo_causal, juego',
            { count: 'estimated' }
          )
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
          transacciones = await agregarNombresReales(transacciones);
        } catch (e) {
          // usuarios_novusbet puede no existir todavía, no es crítico
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ datos: transacciones, total, offset, limit }));
      return;
    }

    // API: DETALLE CRUDO de una transacción puntual (datos_raw). Separado
    // de la lista a propósito — ver el comentario en
    // /api/transacciones-novusbet sobre por qué esa columna no va en la
    // lista. Se pide solo cuando el usuario abre el modal de detalle.
    if (pathname === '/api/transacciones-novusbet/detalle') {
      const id = parsedUrl.query.id;
      let datosRaw = null;
      if (supabase && id) {
        const { data } = await supabase
          .from('transacciones_novusbet')
          .select('datos_raw')
          .eq('id', id)
          .maybeSingle();
        datosRaw = data ? data.datos_raw : null;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ datos_raw: datosRaw }));
      return;
    }

    // API: DISPARAR SINCRONIZACIÓN HISTÓRICA (día por día). Acepta {dias} o,
    // para pedir un rango exacto de calendario (ej. marzo a agosto),
    // {desde, hasta} en formato YYYY-MM-DD.
    if (pathname === '/api/admin/sync-historico' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
        let desde, hasta, etiqueta;
        try {
          const parsed = JSON.parse(body || '{}');
          if (FECHA_REGEX.test(parsed.desde) && FECHA_REGEX.test(parsed.hasta) && parsed.desde <= parsed.hasta) {
            desde = parsed.desde;
            hasta = parsed.hasta;
          } else {
            // Tope bajado a 30 días: con el plan gratuito de Supabase ya
            // saturado ("exhausting multiple resources") a este volumen,
            // un backfill largo puede volver a tumbarlo. Para historial
            // más largo hace falta subir de plan primero.
            const dias = Math.min(Math.max(parseInt(parsed.dias, 10) || 7, 1), 30);
            hasta = new Date().toISOString().split('T')[0];
            desde = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          }
          // Tope de seguridad: no más de 30 días en una sola corrida, aunque
          // hayan pedido un rango de fechas explícito más amplio.
          const totalDias = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;
          if (totalDias > 30) {
            desde = new Date(new Date(hasta).getTime() - 29 * 86400000).toISOString().split('T')[0];
          }
          etiqueta = `${desde} a ${hasta}`;
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Solicitud inválida' }));
          return;
        }

        if (syncStatus.estado === 'sincronizando') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ya hay una sincronización en curso' }));
          return;
        }

        syncStatus.estado = 'sincronizando';
        syncStatus.inicio = new Date().toISOString();
        syncStatus.mensaje = `Sincronizando histórico ${etiqueta}...`;

        const { syncRangoHistorico } = require('./sync-novusbet');
        // El resumen diario (para el ranking) y la poda del detalle viejo
        // ya se hacen adentro, día por día, a medida que avanza — no hace
        // falta un paso aparte al final.
        syncRangoHistorico(desde, hasta, (progreso) => {
          syncStatus.mensaje = `Histórico ${etiqueta}: día ${progreso.diasProcesados}/${progreso.diasTotal} (${progreso.totalGeneral} transacciones)`;
        }).then(async (resultado) => {
          syncStatus.estado = 'completado';
          syncStatus.fin = new Date().toISOString();
          syncStatus.filas = resultado.totalGeneral;
          syncStatus.mensaje = `Histórico completado (${etiqueta}): ${resultado.totalGeneral} transacciones`;
        }).catch((err) => {
          syncStatus.estado = 'error';
          syncStatus.fin = new Date().toISOString();
          syncStatus.mensaje = err.message;
        });

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, mensaje: `Sincronización histórica (${etiqueta}) iniciada en segundo plano` }));
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
        // Antes esto traía TODA transacciones_novusbet (hasta 100,000 filas
        // crudas) en cada refresh de 30 segundos, para cada pestaña abierta
        // del dashboard — el mismo tipo de sobrecarga que ya venía tumbando
        // el plan gratuito. resumen_diario_usuarios ya trae esto agregado
        // por usuario/día (unas pocas cientos de filas), igual que hace
        // /api/ranking-jugadores.
        const data = await fetchTodasLasFilas(
          'resumen_diario_usuarios',
          'id_usuario_novusbet, usuario, casa_apuestas, transacciones, monto_total, disciplinas, juegos, ultima_actividad'
        );

        if (data) {
          const ahora = Date.now();
          const UN_DIA = 24 * 60 * 60 * 1000;

          data.forEach((d) => {
            const id = d.id_usuario_novusbet || d.usuario || 'desconocido';
            if (!usuarios[id]) {
              usuarios[id] = {
                id_usuario_novusbet: id,
                usuario: d.usuario,
                casa_apuestas: d.casa_apuestas,
                transacciones: 0,
                monto_total: 0,
                disciplinas: new Set(),
                juegos: new Set(),
                ultima_actividad: null,
              };
            }
            const u = usuarios[id];
            u.transacciones += d.transacciones || 0;
            u.monto_total += Number(d.monto_total) || 0;
            (d.disciplinas || []).forEach((disc) => u.disciplinas.add(disc));
            (d.juegos || []).forEach((j) => u.juegos.add(j));
            if (d.ultima_actividad && (!u.ultima_actividad || new Date(d.ultima_actividad) > new Date(u.ultima_actividad))) {
              u.ultima_actividad = d.ultima_actividad;
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
          // (Habilitado/Congelado/etc.) en vez del estimado por actividad.
          // Acotado a los IDs que aparecen acá (igual que
          // agregarNombresReales) en vez de traer las ~39,000 filas enteras.
          try {
            const ids = [...new Set(Object.keys(usuarios))];
            const { data: usuariosReales } = await supabase
              .from('usuarios_novusbet')
              .select('id_usuario, estado, nombre, apellido, correo')
              .in('id_usuario', ids);
            const porId = {};
            (usuariosReales || []).forEach((u) => { porId[u.id_usuario] = u; });

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

    // API: RANKING DE JUGADORES. Combina ranking_historico_base (importado
    // una sola vez desde un reporte que Novusbet ya trae agregado por
    // jugador — liviano, ~4-5k filas) con lo que se va acumulando día a
    // día en resumen_diario_usuarios desde que arrancó este seguimiento.
    // Ninguna de las dos consulta el detalle crudo de transacciones.
    if (pathname === '/api/ranking-jugadores') {
      const limit = Math.min(Math.max(parseInt(parsedUrl.query.limit, 10) || 25, 1), 200);
      const porUsuario = {};

      if (supabase) {
        try {
          const base = await fetchTodasLasFilas(
            'ranking_historico_base',
            'id_usuario_novusbet, usuario, casa_apuestas, apuestas, apostado, ganado'
          );
          base.forEach((b) => {
            porUsuario[b.id_usuario_novusbet] = {
              id_usuario_novusbet: b.id_usuario_novusbet,
              usuario: b.usuario,
              casa_apuestas: b.casa_apuestas,
              transacciones: 0,
              apuestas: b.apuestas || 0,
              monto_total: 0,
              apostado: Number(b.apostado) || 0,
              ganado: Number(b.ganado) || 0,
              juegos: new Set(),
              meses: new Set(),
              ultima_actividad: null,
              // De dónde sale el número: CSV real importado del reporte de
              // Novusbet, acumulado diario real de la sincronización automática,
              // o ambos combinados (el caso más común con el tiempo).
              fuentes: new Set(['csv_historico']),
            };
          });
        } catch (e) {
          // ranking_historico_base puede no existir todavía (no se importó el CSV)
        }

        try {
          const diario = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'id_usuario_novusbet, usuario, casa_apuestas, dia, transacciones, apuestas, monto_total, apostado, ganado, juegos, ultima_actividad'
          );
          diario.forEach((d) => {
            const id = d.id_usuario_novusbet;
            if (!porUsuario[id]) {
              porUsuario[id] = {
                id_usuario_novusbet: id,
                usuario: d.usuario,
                casa_apuestas: d.casa_apuestas,
                transacciones: 0,
                apuestas: 0,
                monto_total: 0,
                apostado: 0,
                ganado: 0,
                juegos: new Set(),
                meses: new Set(),
                ultima_actividad: null,
                fuentes: new Set(),
              };
            }
            const u = porUsuario[id];
            u.fuentes.add('sync_diario');
            u.transacciones += d.transacciones || 0;
            u.apuestas += d.apuestas || 0;
            u.monto_total += Number(d.monto_total) || 0;
            u.apostado += Number(d.apostado) || 0;
            u.ganado += Number(d.ganado) || 0;
            (d.juegos || []).forEach((j) => u.juegos.add(j));
            if (d.dia) u.meses.add(String(d.dia).slice(0, 7));
            if (!u.usuario) u.usuario = d.usuario;
            if (!u.casa_apuestas) u.casa_apuestas = d.casa_apuestas;
            if (d.ultima_actividad && (!u.ultima_actividad || new Date(d.ultima_actividad) > new Date(u.ultima_actividad))) {
              u.ultima_actividad = d.ultima_actividad;
            }
          });
        } catch (e) {
          // resumen_diario_usuarios puede no existir todavía
        }
      }

      const ranking = await agregarNombresReales(
        Object.values(porUsuario)
          .map((u) => ({
            ...u,
            juegos: Array.from(u.juegos),
            meses_activo: u.meses.size,
            meses: undefined,
            beneficio: u.apostado - u.ganado,
            fuentes: Array.from(u.fuentes),
          }))
          .sort((a, b) => b.apostado - a.apostado)
          .slice(0, limit)
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ real: true, ranking }));
      return;
    }

    // API: PROYECCIÓN DE GANANCIAS. Para usuarios que TODAVÍA no dispararon
    // una alerta, estima qué tan probable es que su ganancia llegue a
    // UMBRAL_ALERTA_GANANCIA pronto — con el promedio de sus últimos días
    // reales y la dirección de su tendencia (misma lógica que "Patrón" en
    // alertas_ganancias). Es una proyección estadística simple, honesta
    // sobre su propio límite: no es una red neuronal entrenada, es la
    // misma clase de heurística que ya usamos para "alza/baja".
    if (pathname === '/api/proyeccion-ganancias') {
      const UMBRAL_GANANCIA_REF = 15000; // mismo default que UMBRAL_ALERTA_GANANCIA
      let proyeccion = [];

      if (supabase) {
        try {
          const dias = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'id_usuario_novusbet, usuario, casa_apuestas, dia, ganado'
          );
          const porUsuario = {};
          dias.forEach((d) => {
            const id = d.id_usuario_novusbet;
            if (!porUsuario[id]) porUsuario[id] = { usuario: d.usuario, casa_apuestas: d.casa_apuestas, dias: [] };
            porUsuario[id].dias.push({ dia: d.dia, ganado: Number(d.ganado) || 0 });
            if (!porUsuario[id].usuario) porUsuario[id].usuario = d.usuario;
          });

          proyeccion = Object.entries(porUsuario)
            .map(([id, u]) => {
              const ordenados = u.dias.sort((a, b) => (a.dia < b.dia ? -1 : 1));
              if (ordenados.length < 3) return null; // no hay suficiente historial

              const recientes = ordenados.slice(-7);
              const promedioReciente = recientes.reduce((s, d) => s + d.ganado, 0) / recientes.length;
              if (promedioReciente <= 0) return null;

              let tendencia = 'sin_dato';
              let factor = 1;
              if (ordenados.length >= 4) {
                const mitad = Math.floor(ordenados.length / 2);
                const promAnterior = ordenados.slice(0, mitad).reduce((s, d) => s + d.ganado, 0) / mitad;
                const promRecienteCompleto = ordenados.slice(mitad).reduce((s, d) => s + d.ganado, 0) / (ordenados.length - mitad);
                if (promAnterior > 0) {
                  const cambio = (promRecienteCompleto - promAnterior) / promAnterior;
                  if (cambio >= 0.2) { tendencia = 'alza'; factor = 1.25; }
                  else if (cambio <= -0.2) { tendencia = 'baja'; factor = 0.75; }
                  else tendencia = 'estable';
                }
              }

              const probabilidad = Math.max(0, Math.min(100, Math.round((promedioReciente / UMBRAL_GANANCIA_REF) * 100 * factor)));
              if (probabilidad < 20) return null; // descarta ruido, casos muy lejos del umbral

              return {
                id_usuario_novusbet: id,
                usuario: u.usuario,
                casa_apuestas: u.casa_apuestas,
                promedio_reciente: promedioReciente,
                tendencia,
                probabilidad,
                dias_con_historial: ordenados.length,
                // Cuánto historial real respalda la proyección: con pocos
                // días la tendencia es más ruido que patrón.
                confianza: ordenados.length >= 14 ? 'alta' : ordenados.length >= 7 ? 'media' : 'baja',
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.probabilidad - a.probabilidad)
            .slice(0, 25);

          proyeccion = await agregarNombresReales(proyeccion);
        } catch (e) {
          // resumen_diario_usuarios puede no tener suficiente historial todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        umbral: UMBRAL_GANANCIA_REF,
        real: true,
        fuente: 'resumen_diario_usuarios (sincronización automática real)',
        proyeccion,
      }));
      return;
    }

    // API: PROYECCIÓN DE APUESTAS. Misma lógica que la de ganancias, pero
    // sobre "apostado": rango pedido de $5,000 (referencia de probabilidad)
    // a $20,000 (se marca "en rango crítico" si el promedio reciente ya lo
    // supera). No reemplaza las alertas reales — es un radar de quién se
    // viene acercando, antes de que dispare una alerta de verdad.
    if (pathname === '/api/proyeccion-apuestas') {
      const UMBRAL_APUESTA_REF = 5000;
      const UMBRAL_APUESTA_CRITICO = 20000;
      let proyeccion = [];

      if (supabase) {
        try {
          const dias = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'id_usuario_novusbet, usuario, casa_apuestas, dia, apostado'
          );
          const porUsuario = {};
          dias.forEach((d) => {
            const id = d.id_usuario_novusbet;
            if (!porUsuario[id]) porUsuario[id] = { usuario: d.usuario, casa_apuestas: d.casa_apuestas, dias: [] };
            porUsuario[id].dias.push({ dia: d.dia, apostado: Number(d.apostado) || 0 });
            if (!porUsuario[id].usuario) porUsuario[id].usuario = d.usuario;
          });

          proyeccion = Object.entries(porUsuario)
            .map(([id, u]) => {
              const ordenados = u.dias.sort((a, b) => (a.dia < b.dia ? -1 : 1));
              if (ordenados.length < 3) return null;

              const recientes = ordenados.slice(-7);
              const promedioReciente = recientes.reduce((s, d) => s + d.apostado, 0) / recientes.length;
              if (promedioReciente <= 0) return null;

              let tendencia = 'sin_dato';
              let factor = 1;
              if (ordenados.length >= 4) {
                const mitad = Math.floor(ordenados.length / 2);
                const promAnterior = ordenados.slice(0, mitad).reduce((s, d) => s + d.apostado, 0) / mitad;
                const promRecienteCompleto = ordenados.slice(mitad).reduce((s, d) => s + d.apostado, 0) / (ordenados.length - mitad);
                if (promAnterior > 0) {
                  const cambio = (promRecienteCompleto - promAnterior) / promAnterior;
                  if (cambio >= 0.2) { tendencia = 'alza'; factor = 1.25; }
                  else if (cambio <= -0.2) { tendencia = 'baja'; factor = 0.75; }
                  else tendencia = 'estable';
                }
              }

              const probabilidad = Math.max(0, Math.min(100, Math.round((promedioReciente / UMBRAL_APUESTA_REF) * 100 * factor)));
              if (probabilidad < 20) return null;

              return {
                id_usuario_novusbet: id,
                usuario: u.usuario,
                casa_apuestas: u.casa_apuestas,
                promedio_reciente: promedioReciente,
                tendencia,
                probabilidad,
                enRangoCritico: promedioReciente >= UMBRAL_APUESTA_CRITICO,
                confianza: ordenados.length >= 14 ? 'alta' : ordenados.length >= 7 ? 'media' : 'baja',
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.probabilidad - a.probabilidad)
            .slice(0, 25);

          proyeccion = await agregarNombresReales(proyeccion);
        } catch (e) {
          // resumen_diario_usuarios puede no tener suficiente historial todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        umbralRef: UMBRAL_APUESTA_REF,
        umbralCritico: UMBRAL_APUESTA_CRITICO,
        real: true,
        fuente: 'resumen_diario_usuarios (sincronización automática real)',
        proyeccion,
      }));
      return;
    }

    // API: ESTUDIO DE JUEGOS. Analiza, sobre los datos reales acumulados
    // día a día (resumen_diario_usuarios), qué juegos concentran los
    // montos más altos — no cuenta apariciones sueltas, reparte el
    // apostado de cada usuario entre los juegos que jugó ese día
    // (aproximado, porque el resumen diario no guarda el monto por
    // juego individual, solo la lista de juegos jugados esa jornada).
    if (pathname === '/api/estudio-juegos') {
      let juegos = [];

      if (supabase) {
        try {
          const dias = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'apostado, juegos'
          );
          const porJuego = {};
          dias.forEach((d) => {
            const lista = (d.juegos || []).filter(Boolean);
            if (lista.length === 0) return;
            const apostadoPorJuego = (Number(d.apostado) || 0) / lista.length;
            const yaContados = new Set();
            lista.forEach((j) => {
              if (!porJuego[j]) porJuego[j] = { juego: j, apariciones: 0, apostadoEstimado: 0 };
              porJuego[j].apariciones += 1;
              // Reparte el monto una sola vez por juego distinto en ese día,
              // para no inflarlo si el mismo juego aparece repetido.
              if (!yaContados.has(j)) {
                porJuego[j].apostadoEstimado += apostadoPorJuego;
                yaContados.add(j);
              }
            });
          });

          juegos = Object.values(porJuego)
            .map((j) => ({ ...j, promedioEstimado: j.apostadoEstimado / j.apariciones }))
            .sort((a, b) => b.apostadoEstimado - a.apostadoEstimado)
            .slice(0, 20);
        } catch (e) {
          // resumen_diario_usuarios puede no existir todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ real: true, fuente: 'resumen_diario_usuarios (sincronización automática real)', juegos }));
      return;
    }

    // API: ORIGEN DE LOS DATOS. Para que quede explícito en el dashboard de
    // dónde sale cada número (nada es de prueba/inventado): el CSV real que
    // se sube a mano, la sincronización automática día a día, el detalle
    // crudo de transacciones y el estado de cuenta real de usuarios. Usa
    // count 'estimated' (no 'exact') porque un COUNT exacto sobre las
    // tablas grandes ya nos generó "statement timeout" en el plan gratuito.
    if (pathname === '/api/fuente-datos') {
      const { RETENCION_TRANSACCIONES_DIAS } = require('./sync-novusbet');
      const fuente = {
        real: true,
        fuentes: {
          csvHistorico: {
            registros: 0,
            importadoAt: null,
            origen: 'CSV real exportado a mano del backoffice de Novusbet (reporte agregado por jugador)',
          },
          syncDiario: {
            registros: 0,
            primerDia: null,
            ultimoDia: null,
            origen: 'Sincronización automática con Novusbet (cada 60 min), resumida por usuario y día',
          },
          transaccionesCrudo: {
            registros: 0,
            ultimaTransaccion: null,
            retencionDias: RETENCION_TRANSACCIONES_DIAS,
            origen: `Detalle crudo de transacciones tal como lo entrega Novusbet (se conserva ${RETENCION_TRANSACCIONES_DIAS} días, después se poda porque ya quedó resumido)`,
          },
          usuariosReales: {
            registros: 0,
            ultimaSync: syncStatusUsuarios.fin,
            origen: 'Estado de cuenta real de cada jugador (backoffice de Novusbet, /backoffice/users)',
          },
        },
      };

      if (supabase) {
        try {
          const { count } = await supabase
            .from('ranking_historico_base')
            .select('id_usuario_novusbet', { count: 'estimated', head: true });
          fuente.fuentes.csvHistorico.registros = count || 0;
          const { data: ultimoImport } = await supabase
            .from('ranking_historico_base')
            .select('importado_at')
            .order('importado_at', { ascending: false })
            .limit(1);
          if (ultimoImport && ultimoImport[0]) fuente.fuentes.csvHistorico.importadoAt = ultimoImport[0].importado_at;
        } catch (e) { /* todavía no se importó ningún CSV */ }

        try {
          const { count } = await supabase
            .from('resumen_diario_usuarios')
            .select('id_usuario_novusbet', { count: 'estimated', head: true });
          fuente.fuentes.syncDiario.registros = count || 0;
          const { data: primero } = await supabase
            .from('resumen_diario_usuarios').select('dia').order('dia', { ascending: true }).limit(1);
          const { data: ultimo } = await supabase
            .from('resumen_diario_usuarios').select('dia').order('dia', { ascending: false }).limit(1);
          if (primero && primero[0]) fuente.fuentes.syncDiario.primerDia = primero[0].dia;
          if (ultimo && ultimo[0]) fuente.fuentes.syncDiario.ultimoDia = ultimo[0].dia;
        } catch (e) { /* resumen_diario_usuarios puede no existir todavía */ }

        try {
          const { count } = await supabase
            .from('transacciones_novusbet')
            .select('id', { count: 'estimated', head: true });
          fuente.fuentes.transaccionesCrudo.registros = count || 0;
          const { data: ultima } = await supabase
            .from('transacciones_novusbet').select('fecha').order('fecha', { ascending: false }).limit(1);
          if (ultima && ultima[0]) fuente.fuentes.transaccionesCrudo.ultimaTransaccion = ultima[0].fecha;
        } catch (e) { /* no debería pasar, pero por las dudas */ }

        try {
          const { count } = await supabase
            .from('usuarios_novusbet')
            .select('id_usuario', { count: 'estimated', head: true });
          fuente.fuentes.usuariosReales.registros = count || 0;
        } catch (e) { /* usuarios_novusbet puede no existir todavía */ }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fuente));
      return;
    }

    // API: MATRIZ DE PATRÓN. Heatmap real: los usuarios con más apostado
    // acumulado (filas) contra sus últimos días de actividad (columnas),
    // con el monto apostado ese día en cada celda. Mismos datos que
    // alimentan el ranking y las proyecciones (resumen_diario_usuarios),
    // solo reordenados en grilla para que el patrón de cada usuario salte
    // a la vista. Incluye la misma clasificación de tendencia (alza/baja/
    // estable) que ya usamos en alertas de ganancias y en las proyecciones.
    if (pathname === '/api/matriz-patron') {
      const DIAS_VENTANA = Math.min(Math.max(parseInt(parsedUrl.query.dias, 10) || 14, 5), 30);
      const TOP_USUARIOS = Math.min(Math.max(parseInt(parsedUrl.query.top, 10) || 15, 5), 30);
      let matriz = { dias: [], usuarios: [], maximo: 0 };

      if (supabase) {
        try {
          const filas = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'id_usuario_novusbet, usuario, casa_apuestas, dia, apostado'
          );

          const porUsuario = {};
          filas.forEach((f) => {
            const id = f.id_usuario_novusbet;
            if (!porUsuario[id]) porUsuario[id] = { id_usuario_novusbet: id, usuario: f.usuario, casa_apuestas: f.casa_apuestas, porDia: {}, total: 0 };
            const monto = Number(f.apostado) || 0;
            porUsuario[id].porDia[f.dia] = (porUsuario[id].porDia[f.dia] || 0) + monto;
            porUsuario[id].total += monto;
            if (!porUsuario[id].usuario) porUsuario[id].usuario = f.usuario;
          });

          // Ventana de días: los últimos N días con datos reales (no fechas
          // fijas), para que la matriz no quede llena de columnas vacías si
          // todavía no hay tanto historial acumulado.
          const todosLosDias = Array.from(new Set(filas.map((f) => f.dia))).sort();
          const dias = todosLosDias.slice(-DIAS_VENTANA);

          const topUsuarios = Object.values(porUsuario)
            .sort((a, b) => b.total - a.total)
            .slice(0, TOP_USUARIOS);

          let maximo = 0;
          const usuarios = topUsuarios.map((u) => {
            const ordenados = dias.map((d) => u.porDia[d] || 0);
            ordenados.forEach((v) => { if (v > maximo) maximo = v; });

            // Misma heurística de tendencia que alertas_ganancias y las
            // proyecciones: compara el promedio de la primera mitad del
            // historial completo del usuario contra la segunda mitad.
            const historialCompleto = Object.keys(u.porDia).sort().map((d) => u.porDia[d]);
            let tendencia = 'sin_dato';
            if (historialCompleto.length >= 4) {
              const mitad = Math.floor(historialCompleto.length / 2);
              const promAnterior = historialCompleto.slice(0, mitad).reduce((s, v) => s + v, 0) / mitad;
              const promReciente = historialCompleto.slice(mitad).reduce((s, v) => s + v, 0) / (historialCompleto.length - mitad);
              if (promAnterior > 0) {
                const cambio = (promReciente - promAnterior) / promAnterior;
                if (cambio >= 0.2) tendencia = 'alza';
                else if (cambio <= -0.2) tendencia = 'baja';
                else tendencia = 'estable';
              }
            }

            return {
              id_usuario_novusbet: u.id_usuario_novusbet,
              usuario: u.usuario,
              casa_apuestas: u.casa_apuestas,
              total: u.total,
              tendencia,
              valores: ordenados,
            };
          });

          matriz = { dias, usuarios: await agregarNombresReales(usuarios), maximo };
        } catch (e) {
          // resumen_diario_usuarios puede no existir/no tener datos todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ real: true, fuente: 'resumen_diario_usuarios (sincronización automática real)', ...matriz }));
      return;
    }

    // API: ANÁLISIS DE RIESGO. Heurística de riesgo transparente (no una
    // caja negra) sobre datos reales: apostado/ganado acumulado
    // (resumen_diario_usuarios) + historial COMPLETO de alertas ya
    // disparadas (alertas_apuestas/alertas_ganancias, que va más atrás que
    // los pocos días que tiene el resumen todavía). Cada señal suma puntos
    // a un puntaje 0-100, documentados uno por uno — pensado para que un
    // analista pueda auditar por qué un usuario quedó donde quedó, no para
    // confiar en el número ciegamente.
    if (pathname === '/api/analisis-riesgo') {
      const TOP = Math.min(Math.max(parseInt(parsedUrl.query.top, 10) || 25, 5), 100);
      let jugadores = [];

      if (supabase) {
        try {
          const resumen = await fetchTodasLasFilas(
            'resumen_diario_usuarios',
            'id_usuario_novusbet, usuario, casa_apuestas, dia, apostado, ganado, apuestas'
          );

          const porUsuario = {};
          resumen.forEach((r) => {
            const id = r.id_usuario_novusbet;
            if (!id) return;
            if (!porUsuario[id]) {
              porUsuario[id] = {
                id_usuario_novusbet: id,
                usuario: r.usuario,
                casa_apuestas: r.casa_apuestas,
                apostado_total: 0,
                ganado_total: 0,
                apuestas_total: 0,
                maxApuestasDia: 0,
                porDia: {},
              };
            }
            const u = porUsuario[id];
            const apostado = Number(r.apostado) || 0;
            const ganado = Number(r.ganado) || 0;
            u.apostado_total += apostado;
            u.ganado_total += ganado;
            u.apuestas_total += r.apuestas || 0;
            if ((r.apuestas || 0) > u.maxApuestasDia) u.maxApuestasDia = r.apuestas || 0;
            u.porDia[r.dia] = apostado;
            if (!u.usuario) u.usuario = r.usuario;
          });

          const ids = Object.keys(porUsuario);
          if (ids.length > 0) {
            // Historial COMPLETO de alertas (no limitado a los días del
            // resumen) — es la señal de riesgo más confiable porque no se
            // pierde cuando se poda el detalle crudo.
            const [{ data: alertasApuestas }, { data: alertasGanancias }] = await Promise.all([
              supabase.from('alertas_apuestas').select('id_usuario_novusbet, severidad').in('id_usuario_novusbet', ids),
              supabase.from('alertas_ganancias').select('id_usuario_novusbet, severidad').in('id_usuario_novusbet', ids),
            ]);
            const conteoAlertasApuestas = {};
            const conteoAlertasCriticasApuestas = {};
            (alertasApuestas || []).forEach((a) => {
              conteoAlertasApuestas[a.id_usuario_novusbet] = (conteoAlertasApuestas[a.id_usuario_novusbet] || 0) + 1;
              if (a.severidad === 'critica') conteoAlertasCriticasApuestas[a.id_usuario_novusbet] = (conteoAlertasCriticasApuestas[a.id_usuario_novusbet] || 0) + 1;
            });
            const conteoAlertasGanancias = {};
            (alertasGanancias || []).forEach((a) => {
              conteoAlertasGanancias[a.id_usuario_novusbet] = (conteoAlertasGanancias[a.id_usuario_novusbet] || 0) + 1;
            });

            const { data: reales } = await supabase
              .from('usuarios_novusbet')
              .select('id_usuario, nombre, apellido, estado')
              .in('id_usuario', ids);
            const porIdReal = {};
            (reales || []).forEach((u) => { porIdReal[u.id_usuario] = u; });

            jugadores = Object.values(porUsuario).map((u) => {
              const dias = Object.keys(u.porDia).sort();
              const retorno = u.apostado_total > 0 ? u.ganado_total / u.apostado_total : 0;
              const alertasApuestasCount = conteoAlertasApuestas[u.id_usuario_novusbet] || 0;
              const alertasCriticasCount = conteoAlertasCriticasApuestas[u.id_usuario_novusbet] || 0;
              const alertasGananciasCount = conteoAlertasGanancias[u.id_usuario_novusbet] || 0;

              // Caída súbita: tuvo actividad fuerte un día y CERO al día
              // siguiente (fin de sesión abrupto, posible autoexclusión o
              // revisión — no necesariamente malo, pero se marca).
              let caidaSubita = false;
              for (let i = 0; i < dias.length - 1; i++) {
                if (u.porDia[dias[i]] > 1000 && (u.porDia[dias[i + 1]] || 0) === 0) { caidaSubita = true; break; }
              }

              const señales = [];
              let puntaje = 0;
              if (alertasApuestasCount >= 100) { puntaje += 30; señales.push('alertas_historicas_muy_altas'); }
              else if (alertasApuestasCount >= 20) { puntaje += 15; señales.push('alertas_historicas_altas'); }
              if (alertasCriticasCount > 0) { puntaje += 10; señales.push('alertas_criticas'); }
              if (u.maxApuestasDia >= 2000) { puntaje += 25; señales.push('frecuencia_muy_alta'); }
              else if (u.maxApuestasDia >= 500) { puntaje += 10; señales.push('frecuencia_alta'); }
              if (retorno >= 0.9) { puntaje += 15; señales.push('retorno_inusualmente_alto'); }
              else if (retorno > 0 && retorno <= 0.05) { puntaje += 15; señales.push('retorno_inusualmente_bajo'); }
              if (u.ganado_total > u.apostado_total) { puntaje += 15; señales.push('ganancia_neta'); }
              if (caidaSubita) { puntaje += 15; señales.push('caida_subita_actividad'); }
              puntaje = Math.min(100, puntaje);

              const nivel = puntaje >= 60 ? 'alto' : puntaje >= 30 ? 'medio' : 'bajo';
              const real = porIdReal[u.id_usuario_novusbet];

              return {
                id_usuario_novusbet: u.id_usuario_novusbet,
                usuario: u.usuario,
                casa_apuestas: u.casa_apuestas,
                nombre_completo: real ? [real.nombre, real.apellido].filter(Boolean).join(' ') : null,
                estado_real: real ? real.estado : null,
                apostado_total: u.apostado_total,
                ganado_total: u.ganado_total,
                retorno,
                apuestas_total: u.apuestas_total,
                max_apuestas_dia: u.maxApuestasDia,
                dias_con_actividad: dias.length,
                alertas_apuestas: alertasApuestasCount,
                alertas_apuestas_criticas: alertasCriticasCount,
                alertas_ganancias: alertasGananciasCount,
                puntaje_riesgo: puntaje,
                nivel_riesgo: nivel,
                señales,
              };
            })
              .sort((a, b) => b.puntaje_riesgo - a.puntaje_riesgo || b.apostado_total - a.apostado_total)
              .slice(0, TOP);
          }
        } catch (e) {
          // resumen_diario_usuarios/alertas pueden no tener datos todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        real: true,
        fuente: 'resumen_diario_usuarios + historial de alertas_apuestas/alertas_ganancias',
        metodologia: 'Puntaje 0-100 por señales explícitas (no es un modelo entrenado): alertas históricas acumuladas, frecuencia de apuestas por día, retorno inusual, ganancia neta sobre lo apostado, y caída súbita de actividad. Cada señal está documentada, no es una caja negra.',
        jugadores,
      }));
      return;
    }

    // API: SUBIR CSV DEL REPORTE DE NOVUSBET para (re)llenar
    // ranking_historico_base. Mismo formato que customreport.csv:
    // línea 1 = encabezado del resumen, línea 2 = valores del resumen,
    // línea 3 = encabezado real (Id,Usuario,Propietario,Total,PROMEDIO,
    // Importe,Ganancias,Beneficio,Moneda), línea 4+ = un jugador por fila.
    if (pathname === '/api/admin/importar-ranking-csv' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          if (!supabase) throw new Error('Supabase no configurado');

          const parseLineaCSV = (linea) => {
            const campos = [];
            let actual = '';
            let entreComillas = false;
            for (let i = 0; i < linea.length; i++) {
              const c = linea[i];
              if (c === '"') entreComillas = !entreComillas;
              else if (c === ',' && !entreComillas) { campos.push(actual); actual = ''; }
              else actual += c;
            }
            campos.push(actual);
            return campos;
          };
          const numero = (v) => parseFloat((v || '').toString().replace(/[^0-9.-]/g, '')) || 0;

          const lineas = body.split(/\r?\n/).filter((l) => l.trim());
          if (lineas.length < 4) throw new Error('El CSV no tiene el formato esperado (muy pocas líneas)');

          const encabezados = parseLineaCSV(lineas[2]).map((h) => h.trim().toLowerCase());
          const filas = lineas.slice(3).map((linea) => {
            const campos = parseLineaCSV(linea);
            const registro = {};
            encabezados.forEach((h, i) => { registro[h] = (campos[i] || '').trim(); });
            return registro;
          }).filter((r) => r.id);

          const paraGuardar = filas.map((r) => ({
            id_usuario_novusbet: r.id,
            usuario: r.usuario,
            casa_apuestas: r.propietario,
            apuestas: parseInt(r.total, 10) || 0,
            apostado: numero(r.importe),
            ganado: numero(r.ganancias),
            beneficio: numero(r.beneficio),
            moneda: r.moneda,
          })).filter((r) => r.id_usuario_novusbet);

          if (paraGuardar.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No se encontraron jugadores válidos en el CSV' }));
            return;
          }

          const BATCH_SIZE = 500;
          let subidos = 0;
          for (let i = 0; i < paraGuardar.length; i += BATCH_SIZE) {
            const lote = paraGuardar.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
              .from('ranking_historico_base')
              .upsert(lote, { onConflict: 'id_usuario_novusbet' });
            if (error) throw error;
            subidos += lote.length;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, subidos, total: paraGuardar.length }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
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
          alertas = await agregarNombresReales(data || []);
        } catch (e) {
          // alertas_apuestas puede no existir todavía
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(alertas));
      return;
    }

    // API: ALERTAS DE GANANCIAS GRANDES (módulo separado de apuestas,
    // umbral fijo, ver UMBRAL_ALERTA_GANANCIA en sync-novusbet.js)
    if (pathname === '/api/alertas-ganancias') {
      const limit = Math.min(parseInt(parsedUrl.query.limit, 10) || 100, 1000);
      let alertas = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from('alertas_ganancias')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(limit);
          alertas = await agregarNombresReales(data || []);
        } catch (e) {
          // alertas_ganancias puede no existir todavía
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
