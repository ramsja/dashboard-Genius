-- ============================================================
-- Base histórica del ranking de jugadores, importada UNA VEZ desde
-- un reporte agregado que Novusbet ya calculó (customreport.csv) —
-- no hace falta bajar el detalle crudo de meses de transacciones
-- para tener el ranking histórico, esto ya viene sumado por jugador.
--
-- El ranking final combina esta base + lo que se va acumulando día
-- a día en resumen_diario_usuarios desde que arrancó el seguimiento.
-- ============================================================

CREATE TABLE IF NOT EXISTS ranking_historico_base (
  id_usuario_novusbet TEXT PRIMARY KEY,
  usuario TEXT,
  casa_apuestas TEXT,
  apuestas INT DEFAULT 0,
  apostado NUMERIC(15,2) DEFAULT 0,
  ganado NUMERIC(15,2) DEFAULT 0,
  beneficio NUMERIC(15,2) DEFAULT 0,
  moneda TEXT,
  importado_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verificación
SELECT count(*) AS total FROM ranking_historico_base;
