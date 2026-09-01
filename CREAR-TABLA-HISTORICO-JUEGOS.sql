-- ============================================================
-- Complemento de historico_csv_mensual: lo mismo que tenemos para
-- juegos en tiempo real (resumen_diario_juegos → /juegos.html), pero
-- alimentado por los CSV que se suben a mano en /historicos.html en
-- vez de la sincronización automática. Una fila por juego + día
-- (el día sale de cada transacción del CSV, igual que en
-- historico_csv_mensual) — apostado y ganado exactos, separando
-- apuesta (bet) de ganancia (win).
-- ============================================================

CREATE TABLE IF NOT EXISTS historico_csv_juegos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia DATE NOT NULL,
  juego TEXT NOT NULL,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  apuestas INT DEFAULT 0,
  ganancias INT DEFAULT 0,
  jugadores_distintos INT DEFAULT 0,
  importado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dia, juego)
);

CREATE INDEX IF NOT EXISTS idx_historico_csv_juegos_dia ON historico_csv_juegos(dia);

-- Verificación
SELECT count(*) AS total FROM historico_csv_juegos;
