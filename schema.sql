-- Schema normalizado para Dashboard Genius

-- 1. TABLA: usuarios (Clientes)
CREATE TABLE usuarios (
  id BIGINT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  estado VARCHAR(50) NOT NULL CHECK (estado IN ('activo', 'inactivo', 'desconectado', 'suspendido')),
  casa_apuestas VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP
);

-- 2. TABLA: disciplinas (Deportes, Casino, etc)
CREATE TABLE disciplinas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. TABLA: productos (Juegos, Deportes, etc)
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  disciplina_id INT REFERENCES disciplinas(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. TABLA: transacciones (Depósitos, Retiros, Apuestas)
CREATE TABLE transacciones (
  id BIGINT PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id INT REFERENCES productos(id),
  disciplina_id INT REFERENCES disciplinas(id),
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('Deposit', 'Withdraw', 'Bet', 'Win')),
  monto DECIMAL(12, 2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'USD',
  saldo_anterior DECIMAL(12, 2),
  saldo_posterior DECIMAL(12, 2),
  comision DECIMAL(12, 2),
  estado VARCHAR(50),
  grupo_causal VARCHAR(255),
  causal VARCHAR(255),
  descripcion TEXT,
  ip_address INET,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. TABLA: wallets (Billeteras/Cuentas)
CREATE TABLE wallets (
  id SERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(50),
  saldo_actual DECIMAL(12, 2) DEFAULT 0.00,
  moneda VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. TABLA: estadisticas (Métricas agregadas)
CREATE TABLE estadisticas (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  total_usuarios INT DEFAULT 0,
  usuarios_activos INT DEFAULT 0,
  usuarios_inactivos INT DEFAULT 0,
  usuarios_desconectados INT DEFAULT 0,
  usuarios_suspendidos INT DEFAULT 0,
  total_depositos DECIMAL(15, 2) DEFAULT 0,
  total_retiros DECIMAL(15, 2) DEFAULT 0,
  total_apuestas DECIMAL(15, 2) DEFAULT 0,
  comisiones_totales DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. TABLA: usuarios_roles (Control de acceso)
CREATE TABLE usuarios_roles (
  id SERIAL PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rol VARCHAR(50) NOT NULL CHECK (rol IN ('admin', 'moderador', 'editor', 'viewer')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ÍNDICES para optimización
CREATE INDEX idx_transacciones_usuario ON transacciones(usuario_id);
CREATE INDEX idx_transacciones_fecha ON transacciones(created_at);
CREATE INDEX idx_transacciones_tipo ON transacciones(tipo);
CREATE INDEX idx_usuarios_estado ON usuarios(estado);
CREATE INDEX idx_wallets_usuario ON wallets(usuario_id);
CREATE INDEX idx_estadisticas_fecha ON estadisticas(fecha);

-- VISTAS útiles
CREATE VIEW resumen_usuarios AS
SELECT
  estado,
  COUNT(*) as cantidad,
  COUNT(CASE WHEN last_activity > NOW() - INTERVAL '1 day' THEN 1 END) as activos_hoy
FROM usuarios
GROUP BY estado;

CREATE VIEW resumen_transacciones_diarias AS
SELECT
  DATE(created_at) as fecha,
  COUNT(*) as total_transacciones,
  SUM(monto) as monto_total,
  COUNT(CASE WHEN tipo = 'Deposit' THEN 1 END) as depositos,
  COUNT(CASE WHEN tipo = 'Withdraw' THEN 1 END) as retiros,
  COUNT(CASE WHEN tipo = 'Bet' THEN 1 END) as apuestas
FROM transacciones
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

-- FUNCIONES para triggers
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS para actualizar updated_at
CREATE TRIGGER actualizar_usuarios_timestamp
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER actualizar_transacciones_timestamp
BEFORE UPDATE ON transacciones
FOR EACH ROW
EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER actualizar_wallets_timestamp
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION actualizar_timestamp();
