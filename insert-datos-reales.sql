-- ELIMINAR USUARIOS DE PRUEBA (excepto admin)
DELETE FROM usuarios WHERE username NOT IN ('admin_user', 'editor_user');

-- INSERTAR 35 USUARIOS REALES
INSERT INTO usuarios (username, email, nombre_completo, tipo_usuario_id, estado_id, saldo_cuenta, ganancias_totales, perdidas_totales, ultima_actividad, activo) VALUES
('user_juan_garcía', 'juan.garcía@gmail.com', 'Juan García', 4, 1, 8500.00, 2500.00, 1200.00, NOW() - INTERVAL '2 hours', true),
('user_maría_lópez', 'maría.lópez@gmail.com', 'María López', 4, 1, 12000.00, 3500.00, 1800.00, NOW() - INTERVAL '1 hour', true),
('user_carlos_rodríguez', 'carlos.rodríguez@gmail.com', 'Carlos Rodríguez', 4, 2, 3500.00, 800.00, 600.00, NOW() - INTERVAL '5 days', true),
('user_ana_martínez', 'ana.martínez@gmail.com', 'Ana Martínez', 4, 1, 6200.00, 1900.00, 1100.00, NOW() - INTERVAL '30 minutes', true),
('user_pedro_pérez', 'pedro.pérez@gmail.com', 'Pedro Pérez', 4, 1, 9800.00, 2800.00, 1400.00, NOW() - INTERVAL '45 minutes', true),
('user_isabel_fernández', 'isabel.fernández@gmail.com', 'Isabel Fernández', 4, 3, 2100.00, 500.00, 400.00, NOW() - INTERVAL '3 days', true),
('user_diego_gonzález', 'diego.gonzález@gmail.com', 'Diego González', 4, 1, 11500.00, 3200.00, 1600.00, NOW() - INTERVAL '20 minutes', true),
('user_laura_sánchez', 'laura.sánchez@gmail.com', 'Laura Sánchez', 4, 1, 7600.00, 2200.00, 1300.00, NOW() - INTERVAL '15 minutes', true),
('user_miguel_ramírez', 'miguel.ramírez@gmail.com', 'Miguel Ramírez', 4, 1, 13200.00, 4000.00, 2000.00, NOW() - INTERVAL '10 minutes', true),
('user_sofía_torres', 'sofía.torres@gmail.com', 'Sofía Torres', 4, 1, 5800.00, 1500.00, 900.00, NOW() - INTERVAL '1 minute', true),
('user_roberto_díaz', 'roberto.díaz@gmail.com', 'Roberto Díaz', 4, 1, 9200.00, 2600.00, 1500.00, NOW(), true),
('user_elena_ruiz', 'elena.ruiz@gmail.com', 'Elena Ruiz', 4, 2, 4300.00, 1000.00, 700.00, NOW() - INTERVAL '2 days', true),
('user_fernando_morales', 'fernando.morales@gmail.com', 'Fernando Morales', 4, 1, 10500.00, 3000.00, 1700.00, NOW() - INTERVAL '5 minutes', true),
('user_victoria_castillo', 'victoria.castillo@gmail.com', 'Victoria Castillo', 4, 1, 7200.00, 2100.00, 1200.00, NOW() - INTERVAL '25 minutes', true),
('user_andrés_herrera', 'andrés.herrera@gmail.com', 'Andrés Herrera', 4, 1, 14500.00, 4500.00, 2200.00, NOW() - INTERVAL '8 minutes', true),
('user_patricia_jiménez', 'patricia.jiménez@gmail.com', 'Patricia Jiménez', 2, 1, 6500.00, 1800.00, 1000.00, NOW() - INTERVAL '35 minutes', true),
('user_manuel_navarro', 'manuel.navarro@gmail.com', 'Manuel Navarro', 4, 1, 11800.00, 3400.00, 1900.00, NOW() - INTERVAL '12 minutes', true),
('user_rosa_campos', 'rosa.campos@gmail.com', 'Rosa Campos', 4, 3, 1800.00, 400.00, 300.00, NOW() - INTERVAL '4 days', true),
('user_javier_medina', 'javier.medina@gmail.com', 'Javier Medina', 4, 1, 8900.00, 2400.00, 1100.00, NOW() - INTERVAL '22 minutes', true),
('user_francisca_rojas', 'francisca.rojas@gmail.com', 'Francisca Rojas', 4, 1, 9600.00, 2700.00, 1300.00, NOW() - INTERVAL '3 minutes', true),
('user_ricardo_vargas', 'ricardo.vargas@gmail.com', 'Ricardo Vargas', 4, 1, 12800.00, 3600.00, 1800.00, NOW() - INTERVAL '6 minutes', true),
('user_magdalena_silva', 'magdalena.silva@gmail.com', 'Magdalena Silva', 4, 2, 3200.00, 700.00, 500.00, NOW() - INTERVAL '8 days', true),
('user_aurelio_flores', 'aurelio.flores@gmail.com', 'Aurelio Flores', 4, 1, 10200.00, 2900.00, 1600.00, NOW() - INTERVAL '18 minutes', true),
('user_emilia_domínguez', 'emilia.domínguez@gmail.com', 'Emilia Domínguez', 4, 1, 6800.00, 1700.00, 900.00, NOW() - INTERVAL '40 minutes', true),
('user_gustavo_castro', 'gustavo.castro@gmail.com', 'Gustavo Castro', 4, 1, 13500.00, 4100.00, 2100.00, NOW() - INTERVAL '2 minutes', true),
('user_mercedes_cortés', 'mercedes.cortés@gmail.com', 'Mercedes Cortés', 4, 1, 7500.00, 2200.00, 1200.00, NOW() - INTERVAL '11 minutes', true),
('user_armando_reyes', 'armando.reyes@gmail.com', 'Armando Reyes', 4, 1, 9900.00, 2800.00, 1400.00, NOW() - INTERVAL '19 minutes', true),
('user_soledad_ortiz', 'soledad.ortiz@gmail.com', 'Soledad Ortiz', 4, 3, 2500.00, 600.00, 450.00, NOW() - INTERVAL '6 days', true),
('user_fortunato_valenzuela', 'fortunato.valenzuela@gmail.com', 'Fortunato Valenzuela', 4, 1, 11200.00, 3200.00, 1700.00, NOW() - INTERVAL '9 minutes', true),
('user_eulalia_ibáñez', 'eulalia.ibáñez@gmail.com', 'Eulalia Ibáñez', 4, 1, 5500.00, 1300.00, 800.00, NOW() - INTERVAL '32 minutes', true),
('user_benito_núñez', 'benito.núñez@gmail.com', 'Benito Núñez', 4, 1, 14200.00, 4200.00, 2000.00, NOW() - INTERVAL '7 minutes', true),
('user_margarita_acosta', 'margarita.acosta@gmail.com', 'Margarita Acosta', 4, 2, 3800.00, 900.00, 600.00, NOW() - INTERVAL '3 days', true),
('user_cristóbal_molina', 'cristóbal.molina@gmail.com', 'Cristóbal Molina', 4, 1, 10800.00, 3100.00, 1800.00, NOW() - INTERVAL '14 minutes', true),
('user_antonia_meneses', 'antonia.meneses@gmail.com', 'Antonia Meneses', 4, 1, 6900.00, 1800.00, 1000.00, NOW() - INTERVAL '28 minutes', true),
('user_severino_vega', 'severino.vega@gmail.com', 'Severino Vega', 2, 1, 12500.00, 3700.00, 1900.00, NOW() - INTERVAL '4 minutes', true);

-- VERIFICAR
SELECT COUNT(*) as total_usuarios, 
       SUM(saldo_cuenta) as saldo_total,
       SUM(ganancias_totales) as ganancias_total
FROM usuarios;
