-- ============================================================
-- Tabla para el "Dashboard de Históricos" — corrección de diseño:
-- Novusbet solo deja exportar día por día, así que un "mes" real se
-- arma subiendo varios CSVs de días sueltos. Por eso esta tabla guarda
-- una fila por USUARIO + DÍA (el día sale de la propia transacción,
-- no hay que tipearlo), no por un "período" elegido a mano — así,
-- subir el CSV de otro día del mismo mes SUMA, nunca pisa lo ya
-- guardado. El dashboard arma los "meses" agrupando los días él solo.
--
-- Si ya habías corrido una versión anterior de este script (con
-- columna "periodo"), esto la reemplaza limpio — no hay datos reales
-- todavía cargados con ese diseño.
-- ============================================================

DROP TABLE IF EXISTS historico_csv_mensual;

CREATE TABLE historico_csv_mensual (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia DATE NOT NULL,
  id_usuario_novusbet TEXT NOT NULL,
  usuario TEXT,
  casa_apuestas TEXT,
  apuestas INT DEFAULT 0,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  beneficio NUMERIC(15,2) DEFAULT 0,
  moneda TEXT,
  importado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dia, id_usuario_novusbet)
);

CREATE INDEX IF NOT EXISTS idx_historico_csv_mensual_dia ON historico_csv_mensual(dia);

-- Verificación
SELECT count(*) AS total FROM historico_csv_mensual;
