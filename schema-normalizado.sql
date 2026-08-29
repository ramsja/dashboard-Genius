-- SCHEMA NORMALIZADO PARA DASHBOARD GENIUS
-- Tablas normalizadas con relaciones correctas

-- 1. TABLA: TIPOS DE USUARIO
CREATE TABLE IF NOT EXISTS tipos_usuario (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  permisos JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tipos_usuario (nombre, descripcion, permisos) VALUES
  ('admin', 'Administrador del sistema', '{"ver":true,"editar":true,"eliminar":true,"reportes":true}'),
  ('editor', 'Editor de contenido', '{"ver":true,"editar":true,"eliminar":false,"reportes":true}'),
  ('viewer', 'Solo lectura', '{"ver":true,"editar":false,"eliminar":false,"reportes":false}'),
  ('jugador', 'Usuario jugador', '{"ver":true,"editar":false,"eliminar":false,"reportes":false}')
ON CONFLICT DO NOTHING;

-- 2. TABLA: ESTADOS DEL USUARIO
CREATE TABLE IF NOT EXISTS estados_usuario (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO estados_usuario (nombre, descripcion, activo) VALUES
  ('activo', 'Usuario activo y en línea', true),
  ('inactivo', 'Usuario inactivo pero registrado', true),
  ('desconectado', 'Usuario desconectado recientemente', true),
  ('suspendido', 'Usuario suspendido temporalmente', false),
  ('bloqueado', 'Usuario bloqueado permanentemente', false)
ON CONFLICT DO NOTHING;

-- 3. TABLA: DISCIPLINAS
CREATE TABLE IF NOT EXISTS disciplinas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono VARCHAR(50),
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO disciplinas (nombre, descripcion, icono, activa) VALUES
  ('Deportes', 'Apuestas deportivas (fútbol, baloncesto, etc)', '⚽', true),
  ('Casino', 'Juegos de casino (ruleta, blackjack, etc)', '🎰', true),
  ('E-Sports', 'Apuestas en competencias electrónicas', '🎮', true),
  ('Otros', 'Otras modalidades de juego', '🎯', true)
ON CONFLICT DO NOTHING;

-- 4. TABLA: TIPOS DE APUESTA
CREATE TABLE IF NOT EXISTS tipos_apuesta (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  disciplina_id INTEGER REFERENCES disciplinas(id),
  comision_casa DECIMAL(5,2) DEFAULT 5.00,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tipos_apuesta (nombre, descripcion, disciplina_id, comision_casa) VALUES
  ('Fútbol - Resultado Final', 'Apuesta al resultado final del partido', 1, 5.00),
  ('Fútbol - Goles Totales', 'Apuesta a cantidad de goles en partido', 1, 5.00),
  ('Baloncesto - Puntos Finales', 'Apuesta a puntos totales del partido', 1, 5.00),
  ('Ruleta Europea', 'Ruleta con 37 números', 2, 2.70),
  ('BlackJack', 'Juego de cartas 21', 2, 2.50),
  ('Póker', 'Variantes de póker', 2, 3.00)
ON CONFLICT DO NOTHING;

-- 5. TABLA: USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  nombre_completo VARCHAR(255),
  tipo_usuario_id INTEGER REFERENCES tipos_usuario(id),
  estado_id INTEGER REFERENCES estados_usuario(id),
  saldo_cuenta DECIMAL(15,2) DEFAULT 0.00,
  ganancias_totales DECIMAL(15,2) DEFAULT 0.00,
  perdidas_totales DECIMAL(15,2) DEFAULT 0.00,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tipo ON usuarios(tipo_usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);

-- 6. TABLA: DEPORTES (para categorizar apuestas deportivas)
CREATE TABLE IF NOT EXISTS deportes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  icono VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO deportes (nombre, descripcion, icono) VALUES
  ('Fútbol', 'Asociación Fútbol', '⚽'),
  ('Baloncesto', 'Basketball', '🏀'),
  ('Tenis', 'Tenis Individual', '🎾'),
  ('Beisbol', 'Baseball', '⚾'),
  ('Hockey', 'Hockey sobre Hielo', '🏒'),
  ('Voleibol', 'Voleibol', '🏐')
ON CONFLICT DO NOTHING;

-- 7. TABLA: EVENTOS DEPORTIVOS
CREATE TABLE IF NOT EXISTS eventos_deportivos (
  id SERIAL PRIMARY KEY,
  deporte_id INTEGER REFERENCES deportes(id),
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  equipo_local VARCHAR(100),
  equipo_visitante VARCHAR(100),
  fecha_evento TIMESTAMP,
  resultado_local INTEGER,
  resultado_visitante INTEGER,
  estado VARCHAR(50), -- 'programado', 'en_vivo', 'finalizado', 'cancelado'
  cuota_local DECIMAL(5,2),
  cuota_empate DECIMAL(5,2),
  cuota_visitante DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos_deportivos(fecha_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_estado ON eventos_deportivos(estado);

-- 8. TABLA: APUESTAS (transacciones)
CREATE TABLE IF NOT EXISTS apuestas (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo_apuesta_id INTEGER REFERENCES tipos_apuesta(id),
  evento_deportivo_id INTEGER REFERENCES eventos_deportivos(id),
  monto_apostado DECIMAL(15,2) NOT NULL,
  cuota_aplicada DECIMAL(5,2),
  monto_ganancia DECIMAL(15,2),
  resultado VARCHAR(50), -- 'ganada', 'perdida', 'pendiente', 'anulada'
  descripcion TEXT,
  fecha_apuesta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_resultado TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para apuestas
CREATE INDEX IF NOT EXISTS idx_apuestas_usuario ON apuestas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_apuestas_resultado ON apuestas(resultado);
CREATE INDEX IF NOT EXISTS idx_apuestas_fecha ON apuestas(fecha_apuesta);

-- 9. TABLA: TRANSACCIONES (movimientos de dinero)
CREATE TABLE IF NOT EXISTS transacciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo VARCHAR(50), -- 'deposito', 'retiro', 'ganancia', 'perdida', 'comision'
  monto DECIMAL(15,2) NOT NULL,
  saldo_anterior DECIMAL(15,2),
  saldo_nuevo DECIMAL(15,2),
  descripcion TEXT,
  referencia_apuesta_id BIGINT REFERENCES apuestas(id),
  estado VARCHAR(50) DEFAULT 'completada', -- 'pendiente', 'completada', 'rechazada'
  fecha_transaccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario ON transacciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha_transaccion);
CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON transacciones(tipo);

-- 10. VISTA: RESUMEN POR USUARIO
CREATE OR REPLACE VIEW resumen_usuarios AS
SELECT
  u.id,
  u.username,
  u.nombre_completo,
  u.email,
  tu.nombre as tipo_usuario,
  eu.nombre as estado,
  u.saldo_cuenta,
  u.ganancias_totales,
  u.perdidas_totales,
  (u.ganancias_totales - u.perdidas_totales) as balance_neto,
  COUNT(DISTINCT a.id) as total_apuestas,
  COUNT(DISTINCT CASE WHEN a.resultado = 'ganada' THEN a.id END) as apuestas_ganadas,
  COUNT(DISTINCT CASE WHEN a.resultado = 'perdida' THEN a.id END) as apuestas_perdidas,
  u.fecha_registro,
  u.ultima_actividad
FROM usuarios u
LEFT JOIN tipos_usuario tu ON u.tipo_usuario_id = tu.id
LEFT JOIN estados_usuario eu ON u.estado_id = eu.id
LEFT JOIN apuestas a ON u.id = a.usuario_id
GROUP BY u.id, tu.id, eu.id;

-- 11. VISTA: ESTADÍSTICAS POR DISCIPLINA
CREATE OR REPLACE VIEW estadisticas_disciplinas AS
SELECT
  d.id,
  d.nombre as disciplina,
  COUNT(DISTINCT a.usuario_id) as usuarios_activos,
  COUNT(DISTINCT a.id) as total_apuestas,
  SUM(CASE WHEN a.resultado = 'ganada' THEN 1 ELSE 0 END) as apuestas_ganadas,
  SUM(CASE WHEN a.resultado = 'perdida' THEN 1 ELSE 0 END) as apuestas_perdidas,
  SUM(a.monto_apostado) as monto_total_apostado,
  SUM(CASE WHEN a.resultado = 'ganada' THEN a.monto_ganancia ELSE 0 END) as monto_ganado
FROM disciplinas d
LEFT JOIN tipos_apuesta ta ON d.id = ta.disciplina_id
LEFT JOIN apuestas a ON ta.id = a.tipo_apuesta_id
WHERE d.activa = true
GROUP BY d.id, d.nombre;

-- 12. VISTA: TOP USUARIOS POR GANANCIAS
CREATE OR REPLACE VIEW top_usuarios_ganancias AS
SELECT
  u.id,
  u.username,
  u.nombre_completo,
  u.ganancias_totales,
  u.perdidas_totales,
  (u.ganancias_totales - u.perdidas_totales) as balance_neto,
  COUNT(DISTINCT a.id) as total_apuestas,
  ROUND(SUM(CASE WHEN a.resultado = 'ganada' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(DISTINCT a.id), 0) * 100, 2) as porcentaje_ganancia
FROM usuarios u
LEFT JOIN apuestas a ON u.id = a.usuario_id
WHERE u.activo = true
GROUP BY u.id
ORDER BY balance_neto DESC
LIMIT 100;

-- INSERTS DE DATOS INICIALES DE PRUEBA
INSERT INTO usuarios (username, nombre_completo, tipo_usuario_id, estado_id, saldo_cuenta, ganancias_totales, perdidas_totales, ultima_actividad) VALUES
  ('user1', 'Juan García', 4, 1, 5000.00, 2500.00, 1000.00, CURRENT_TIMESTAMP),
  ('user2', 'María López', 4, 1, 3500.00, 1800.00, 1200.00, CURRENT_TIMESTAMP),
  ('user3', 'Carlos Rodríguez', 4, 2, 2000.00, 500.00, 300.00, CURRENT_TIMESTAMP - INTERVAL '2 days'),
  ('admin_user', 'Admin Dashboard', 1, 1, 0.00, 0.00, 0.00, CURRENT_TIMESTAMP),
  ('editor_user', 'Editor Dashboard', 2, 1, 0.00, 0.00, 0.00, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING;

-- Insertar eventos de prueba
INSERT INTO eventos_deportivos (deporte_id, titulo, equipo_local, equipo_visitante, fecha_evento, estado, cuota_local, cuota_empate, cuota_visitante) VALUES
  (1, 'Partido Final Local', 'Equipo A', 'Equipo B', CURRENT_TIMESTAMP + INTERVAL '1 day', 'programado', 1.95, 3.20, 2.10),
  (1, 'Partido Clásico', 'Real vs Barcelona', 'Barcelona', CURRENT_TIMESTAMP + INTERVAL '3 days', 'programado', 2.05, 3.10, 1.90),
  (2, 'Final de Temporada', 'Lakers', 'Celtics', CURRENT_TIMESTAMP + INTERVAL '5 days', 'programado', 1.85, 4.50, 2.20)
ON CONFLICT DO NOTHING;

-- Insertar apuestas de prueba
INSERT INTO apuestas (usuario_id, tipo_apuesta_id, evento_deportivo_id, monto_apostado, cuota_aplicada, resultado, descripcion, fecha_apuesta) VALUES
  (1, 1, 1, 500.00, 1.95, 'ganada', 'Apuesta a equipo local', CURRENT_TIMESTAMP - INTERVAL '1 day'),
  (2, 1, 1, 250.00, 2.10, 'perdida', 'Apuesta a equipo visitante', CURRENT_TIMESTAMP - INTERVAL '1 day'),
  (3, 2, 2, 1000.00, 3.20, 'pendiente', 'Esperando resultado', CURRENT_TIMESTAMP - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- Insertar transacciones de prueba
INSERT INTO transacciones (usuario_id, tipo, monto, saldo_anterior, saldo_nuevo, descripcion, estado) VALUES
  (1, 'deposito', 5000.00, 0.00, 5000.00, 'Depósito inicial', 'completada'),
  (2, 'deposito', 3500.00, 0.00, 3500.00, 'Depósito inicial', 'completada'),
  (3, 'deposito', 2000.00, 0.00, 2000.00, 'Depósito inicial', 'completada')
ON CONFLICT DO NOTHING;

-- TABLAS DE AUDITORÍA
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  tabla VARCHAR(100),
  accion VARCHAR(50), -- 'INSERT', 'UPDATE', 'DELETE'
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_fecha ON audit_log(fecha_cambio);
