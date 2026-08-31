-- ============================================================
-- Tabla de usuarios con el ESTADO REAL de cuenta (Habilitado,
-- Congelado, Cancelado, solo lectura, para validar, etc.)
--
-- Se llena SOLA, automáticamente, leyendo directo del backoffice
-- de Novusbet (pestaña Usuarios) — no hace falta descargar ni
-- subir ningún CSV a mano. Ver sincronizarUsuarios() en
-- sync-novusbet.js y sincronizarUsuariosAutomatico() en server-db.js.
--
-- Ejecuta esto en Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios_novusbet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario TEXT UNIQUE NOT NULL,
  usuario TEXT,
  apellido TEXT,
  nombre TEXT,
  tipo TEXT,
  padre TEXT,
  correo TEXT,
  moneda TEXT,
  saldo NUMERIC(15,2) DEFAULT 0,
  saldo_retirable NUMERIC(15,2) DEFAULT 0,
  bono NUMERIC(15,2) DEFAULT 0,
  sitio TEXT,
  estado TEXT,
  ultimo_acceso TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ,
  actualizado_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_novusbet_estado ON usuarios_novusbet(estado);

-- Verificación
SELECT count(*) as total FROM usuarios_novusbet;
