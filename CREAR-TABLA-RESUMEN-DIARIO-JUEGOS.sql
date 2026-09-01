-- ============================================================
-- Resumen diario POR JUEGO (no por usuario): apostado y ganado
-- exactos, separando apuesta (bet) de ganancia (win), calculados en
-- JS a partir de las transacciones reales de cada sincronización —
-- no un estimado repartido. Reemplaza el "apostadoEstimado" que
-- usaban /api/estudio-juegos y /api/juegos-dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS resumen_diario_juegos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  juego TEXT NOT NULL,
  dia DATE NOT NULL,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  apuestas INT DEFAULT 0,
  ganancias INT DEFAULT 0,
  jugadores_distintos INT DEFAULT 0,
  actualizado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (juego, dia)
);

CREATE INDEX IF NOT EXISTS idx_resumen_diario_juegos_dia ON resumen_diario_juegos(dia);

-- Verificación
SELECT count(*) AS total FROM resumen_diario_juegos;
