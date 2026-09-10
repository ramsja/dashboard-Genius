/**
 * API de solo lectura del dashboard de Geniusbet, sobre Cloudflare D1.
 *
 * Por que un Worker y no la base directa: la pagina es estatica y publica. Si
 * lleva la credencial de la base en el HTML, cualquiera puede consultar la base
 * entera. Aqui la pagina no lleva credencial: llama a estas rutas, que ejecutan
 * consultas FIJAS. El cliente nunca manda SQL.
 *
 * /api/snapshot y /api/historico devuelven la MISMA forma que
 * dashboard/data/snapshot.json y historico.json, para que el dashboard pueda
 * caer al JSON estatico sin ramas distintas de render.
 *
 * Ninguna ruta devuelve telefono, ID de usuario ni IP: esos campos no existen
 * en la base (cloudflare/schema.sql). Los rankings usan el alias con sal.
 *
 * Variables (wrangler.toml / secretos):
 *   DB                   binding de la base D1
 *   ORIGENES_PERMITIDOS  origenes separados por coma para CORS
 *   TOKEN_INGESTA        secreto que autoriza POST /ingesta
 */

const LIMITE_FILAS_POR_LOTE = 500;
const DISCIPLINAS = ['casino', 'deportes', 'otros'];
const CONEXIONES = ['online', 'retail', 'desconocido'];
const ESTADOS = ['activo', 'inactivo', 'desconectado', 'suspendido', 'otros'];

// ---------------------------------------------------------------- CORS

function origenPermitido(request, env) {
  const origen = request.headers.get('Origin') || '';
  const permitidos = (env.ORIGENES_PERMITIDOS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!permitidos.length) return '*';
  return permitidos.includes(origen) ? origen : '';
}

function json(datos, origen, estado = 200, segundos = 60) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origen || 'null',
      'Cache-Control': `public, max-age=${segundos}`,
      Vary: 'Origin',
    },
  });
}

const error = (mensaje, origen, estado) => json({ error: mensaje }, origen, estado, 0);

const ceros = (claves) => Object.fromEntries(claves.map((k) => [k, 0]));

// ---------------------------------------------------------------- lectura

/** Reconstruye la forma de snapshot.json desde las tablas de ventana. */
async function snapshot(env, origen) {
  const [meta, dimensiones, cruces, dinero] = await Promise.all([
    env.DB.prepare('select generado_en, fuente, total from ventana_meta where clave = ?')
      .bind('actual').first(),
    env.DB.prepare('select eje, valor, registros from ventana_dimension').all(),
    env.DB.prepare('select disciplina, eje, valor, registros from ventana_cruce').all(),
    env.DB.prepare('select disciplina, ingresos, total, comision from ventana_money').all(),
  ]);

  if (!meta) return error('la base no tiene ninguna ventana cargada', origen, 503);

  const datos = {
    version: 2,
    generated_at: meta.generado_en,
    source: meta.fuente || 'Cloudflare D1',
    total: meta.total || 0,
    discipline: ceros(DISCIPLINAS),
    connection: ceros(CONEXIONES),
    status: ceros(ESTADOS),
    matrix: {},
    money: {},
    top_products: [],
  };

  for (const fila of dimensiones.results || []) {
    const destino = { disciplina: 'discipline', conexion: 'connection', estado: 'status' }[fila.eje];
    if (destino) datos[destino][fila.valor] = fila.registros;
  }

  for (const disciplina of DISCIPLINAS) {
    datos.matrix[disciplina] = { ...ceros(CONEXIONES), total: 0, status: {} };
  }
  for (const fila of cruces.results || []) {
    const m = datos.matrix[fila.disciplina] ||
      (datos.matrix[fila.disciplina] = { ...ceros(CONEXIONES), total: 0, status: {} });
    if (fila.eje === 'conexion') {
      m[fila.valor] = fila.registros;
      m.total += fila.registros;
    } else if (fila.eje === 'estado') {
      m.status[fila.valor] = fila.registros;
    }
  }

  for (const fila of dinero.results || []) {
    datos.money[fila.disciplina] = {
      income: fila.ingresos,
      total: fila.total,
      commission: fila.comision,
    };
  }

  return json(datos, origen);
}

/** Reconstruye la forma de historico.json desde las tablas por dia. */
async function historico(env, origen) {
  const [totales, dimensiones, dinero] = await Promise.all([
    env.DB.prepare(
      `select dia, transacciones, clientes_total, clientes_online, clientes_retail
         from dia_total order by dia`
    ).all(),
    env.DB.prepare('select dia, eje, valor, registros from dia_dimension').all(),
    env.DB.prepare('select dia, disciplina, ingresos, total, comision from dia_money').all(),
  ]);

  const dias = {};
  for (const fila of totales.results || []) {
    dias[fila.dia] = {
      transacciones: fila.transacciones,
      disciplina: ceros(DISCIPLINAS),
      conexion: ceros(CONEXIONES),
      clientes: {
        total: fila.clientes_total,
        online: fila.clientes_online,
        retail: fila.clientes_retail,
      },
      estados_cliente: ceros(ESTADOS),
      money: {},
    };
  }

  for (const fila of dimensiones.results || []) {
    const dia = dias[fila.dia];
    if (!dia) continue;
    const destino = { disciplina: 'disciplina', conexion: 'conexion', estado: 'estados_cliente' }[fila.eje];
    if (destino) dia[destino][fila.valor] = fila.registros;
  }

  for (const fila of dinero.results || []) {
    const dia = dias[fila.dia];
    if (!dia) continue;
    dia.money[fila.disciplina] = {
      income: fila.ingresos,
      total: fila.total,
      commission: fila.comision,
    };
  }

  return json({ version: 1, actualizado: new Date().toISOString(), dias }, origen);
}

const LISTAS = {
  juegos: `select titulo, proveedor, categoria,
                  sum(jugadas) as jugadas, sum(apuesta) as apuesta
             from juego_dia
            group by titulo, proveedor, categoria
            order by jugadas desc
            limit 100`,
  jugadores: `select alias, canal, desde, hasta, dias_activos, transacciones,
                     apuesta_total, perdida_neta
                from jugador_periodo
               order by apuesta_total desc
               limit 50`,
  ingestas: `select subido_en, generado_en, fuente, dias, transacciones
               from ingesta order by id desc limit 20`,
};

// ---------------------------------------------------------------- escritura

/** Tablas que POST /ingesta puede escribir, con su upsert. */
const DESTINOS = {
  ventana_meta: {
    columnas: ['clave', 'generado_en', 'fuente', 'total'],
    reemplazable: true,
    sql: `insert into ventana_meta (clave, generado_en, fuente, total) values (?, ?, ?, ?)
          on conflict(clave) do update set
            generado_en = excluded.generado_en,
            fuente = excluded.fuente,
            total = excluded.total`,
  },
  ventana_dimension: {
    columnas: ['eje', 'valor', 'registros'],
    reemplazable: true,
    sql: `insert into ventana_dimension (eje, valor, registros) values (?, ?, ?)
          on conflict(eje, valor) do update set registros = excluded.registros`,
  },
  ventana_cruce: {
    columnas: ['disciplina', 'eje', 'valor', 'registros'],
    reemplazable: true,
    sql: `insert into ventana_cruce (disciplina, eje, valor, registros) values (?, ?, ?, ?)
          on conflict(disciplina, eje, valor) do update set registros = excluded.registros`,
  },
  ventana_money: {
    columnas: ['disciplina', 'ingresos', 'total', 'comision'],
    reemplazable: true,
    sql: `insert into ventana_money (disciplina, ingresos, total, comision) values (?, ?, ?, ?)
          on conflict(disciplina) do update set
            ingresos = excluded.ingresos, total = excluded.total, comision = excluded.comision`,
  },
  dia_total: {
    columnas: ['dia', 'transacciones', 'clientes_total', 'clientes_online', 'clientes_retail'],
    sql: `insert into dia_total
            (dia, transacciones, clientes_total, clientes_online, clientes_retail)
          values (?, ?, ?, ?, ?)
          on conflict(dia) do update set
            transacciones = excluded.transacciones,
            clientes_total = excluded.clientes_total,
            clientes_online = excluded.clientes_online,
            clientes_retail = excluded.clientes_retail`,
  },
  dia_dimension: {
    columnas: ['dia', 'eje', 'valor', 'registros'],
    sql: `insert into dia_dimension (dia, eje, valor, registros) values (?, ?, ?, ?)
          on conflict(dia, eje, valor) do update set registros = excluded.registros`,
  },
  dia_money: {
    columnas: ['dia', 'disciplina', 'ingresos', 'total', 'comision'],
    sql: `insert into dia_money (dia, disciplina, ingresos, total, comision) values (?, ?, ?, ?, ?)
          on conflict(dia, disciplina) do update set
            ingresos = excluded.ingresos, total = excluded.total, comision = excluded.comision`,
  },
  juego_dia: {
    columnas: ['dia', 'titulo', 'proveedor', 'categoria', 'jugadas', 'apuesta'],
    sql: `insert into juego_dia (dia, titulo, proveedor, categoria, jugadas, apuesta)
          values (?, ?, ?, ?, ?, ?)
          on conflict(dia, titulo, proveedor) do update set
            categoria = excluded.categoria, jugadas = excluded.jugadas, apuesta = excluded.apuesta`,
  },
  jugador_periodo: {
    columnas: ['alias', 'desde', 'hasta', 'canal', 'dias_activos', 'transacciones',
               'apuesta_total', 'perdida_neta'],
    reemplazable: true,
    sql: `insert into jugador_periodo
            (alias, desde, hasta, canal, dias_activos, transacciones,
             apuesta_total, perdida_neta)
          values (?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(alias, desde, hasta) do update set
            canal = excluded.canal,
            dias_activos = excluded.dias_activos,
            transacciones = excluded.transacciones,
            apuesta_total = excluded.apuesta_total,
            perdida_neta = excluded.perdida_neta`,
  },
  ingesta: {
    columnas: ['subido_en', 'generado_en', 'fuente', 'dias', 'transacciones'],
    sql: `insert into ingesta (subido_en, generado_en, fuente, dias, transacciones)
          values (?, ?, ?, ?, ?)`,
  },
};

/** Columnas que nunca deben entrar, por si alguien cambia el cargador. */
const COLUMNAS_PROHIBIDAS = new Set([
  'usuario', 'id_usuario', 'nombre_usuario_emisor', 'direccion_ip', 'ip',
  'telefono', 'email', 'nota',
]);

async function ingestar(request, env, origen) {
  const esperado = env.TOKEN_INGESTA || '';
  const recibido = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!esperado || recibido.length !== esperado.length || recibido !== esperado) {
    return error('no autorizado', origen, 401);
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch (err) {
    return error('JSON invalido', origen, 400);
  }

  const destino = DESTINOS[cuerpo && cuerpo.tabla];
  if (!destino) return error('tabla no permitida', origen, 400);

  const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas : [];
  if (!filas.length) return error('sin filas', origen, 400);
  if (filas.length > LIMITE_FILAS_POR_LOTE) {
    return error(`maximo ${LIMITE_FILAS_POR_LOTE} filas por lote`, origen, 413);
  }

  for (const fila of filas) {
    for (const clave of Object.keys(fila || {})) {
      if (COLUMNAS_PROHIBIDAS.has(clave.toLowerCase())) {
        return error(`columna no permitida: ${clave}`, origen, 400);
      }
    }
  }

  const sentencias = [];
  // Las tablas de ventana describen una sola ventana: hay que vaciarlas, o
  // quedan combinaciones del export anterior que ya no aplican.
  if (cuerpo.reemplazar) {
    if (!destino.reemplazable) return error('esa tabla no admite reemplazo', origen, 400);
    sentencias.push(env.DB.prepare(`delete from ${cuerpo.tabla}`));
  }

  const preparada = env.DB.prepare(destino.sql);
  for (const fila of filas) {
    sentencias.push(
      preparada.bind(...destino.columnas.map((col) => (fila[col] === undefined ? null : fila[col])))
    );
  }
  await env.DB.batch(sentencias);

  return json({ tabla: cuerpo.tabla, escritas: filas.length, reemplazo: !!cuerpo.reemplazar }, origen, 200, 0);
}

// ---------------------------------------------------------------- router

export default {
  async fetch(request, env) {
    const origen = origenPermitido(request, env);
    const ruta = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origen || 'null',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }

    if (ruta === '/ingesta' || ruta === '/api/ingesta') {
      if (request.method !== 'POST') return error('usa POST', origen, 405);
      try {
        return await ingestar(request, env, origen);
      } catch (err) {
        return error('fallo la ingesta: ' + err.message, origen, 500);
      }
    }

    if (request.method !== 'GET') return error('solo GET', origen, 405);

    try {
      if (ruta === '/' || ruta === '/api/salud') {
        const fila = await env.DB.prepare(
          'select count(*) as dias, max(dia) as ultimo from dia_total'
        ).first();
        const ventana = await env.DB.prepare(
          'select generado_en, total from ventana_meta where clave = ?'
        ).bind('actual').first();
        return json({
          ok: true,
          dias: fila ? fila.dias : 0,
          ultimo_dia: fila ? fila.ultimo : null,
          ventana_generada: ventana ? ventana.generado_en : null,
          ventana_total: ventana ? ventana.total : 0,
        }, origen, 200, 30);
      }

      if (ruta === '/api/snapshot') return await snapshot(env, origen);
      if (ruta === '/api/historico') return await historico(env, origen);

      const nombre = ruta.startsWith('/api/') ? ruta.slice(5) : '';
      if (LISTAS[nombre]) {
        const { results } = await env.DB.prepare(LISTAS[nombre]).all();
        return json(results || [], origen);
      }

      return error('ruta desconocida', origen, 404);
    } catch (err) {
      return error('consulta fallida: ' + err.message, origen, 500);
    }
  },
};
