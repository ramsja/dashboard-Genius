-- ============================================================
-- Nuevo módulo: Apuestas Deportivas (bet list / tickets), a partir
-- del CSV real de Novusbet (columnas en inglés: Ticket ID, User,
-- Amount, Outcome, Winning, Total Odds, etc — export de "Bet List",
-- distinto del export de Transacciones que ya usamos).
--
-- Una fila por TICKET (no por usuario/día como en historico_csv_mensual)
-- porque cada ticket ya es único (Ticket ID) y trae información propia
-- que no se puede agregar sin perderla: cuota, cantidad de eventos,
-- resultado (Won/Lost/Running), fecha de pago, etc.
--
-- UNIQUE(ticket_id) permite subir el mismo CSV (o uno que se solape)
-- sin duplicar, y deja la puerta abierta a alimentar esta misma tabla
-- después con sincronización automática en tiempo real (mismo patrón
-- de upsert que usa transacciones_novusbet), sin tener que rediseñar
-- nada — por eso "fuente" distingue si la fila vino de un CSV subido
-- a mano o de la sincronización automática.
-- ============================================================

CREATE TABLE IF NOT EXISTS apuestas_deportivas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_code TEXT,
  site TEXT,
  owner TEXT,
  id_usuario_externo TEXT,
  coupon_type TEXT,
  bet_type TEXT,
  bono TEXT,
  fecha TIMESTAMPTZ,
  dia DATE,
  moneda TEXT,
  monto NUMERIC(15,2) DEFAULT 0,
  comision NUMERIC(15,2) DEFAULT 0,
  total_odds NUMERIC(12,3) DEFAULT 0,
  no_eventos INT DEFAULT 0,
  pendiente BOOLEAN DEFAULT false,
  bono_pagado NUMERIC(15,2) DEFAULT 0,
  ganancia_base NUMERIC(15,2) DEFAULT 0,
  outcome TEXT,
  fecha_outcome TIMESTAMPTZ,
  fecha_pago TIMESTAMPTZ,
  ganancia NUMERIC(15,2) DEFAULT 0,
  ganancia_impuesto NUMERIC(15,2) DEFAULT 0,
  aplicacion TEXT,
  navegador TEXT,
  fuente TEXT DEFAULT 'csv',
  importado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_apuestas_deportivas_dia ON apuestas_deportivas(dia);
CREATE INDEX IF NOT EXISTS idx_apuestas_deportivas_usuario ON apuestas_deportivas(id_usuario_externo);
CREATE INDEX IF NOT EXISTS idx_apuestas_deportivas_outcome ON apuestas_deportivas(outcome);

-- Verificación
SELECT count(*) AS total FROM apuestas_deportivas;
