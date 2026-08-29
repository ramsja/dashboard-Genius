/**
 * ROW LEVEL SECURITY (RLS) POLICIES
 * Controla acceso a datos basado en rol del usuario
 *
 * Roles:
 * - admin: Acceso completo (lectura, escritura, administración)
 * - editor: Acceso lectura y escritura
 * - viewer: Acceso solo lectura
 */

-- Habilitar RLS en todas las tablas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE estadisticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USUARIOS - Lectura
-- ============================================
CREATE POLICY "usuarios_select_viewer"
ON usuarios FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor', 'viewer')
  )
);

-- USUARIOS - Actualización (admin y editor)
CREATE POLICY "usuarios_update_editor"
ON usuarios FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor')
  )
);

-- USUARIOS - Inserción (solo admin)
CREATE POLICY "usuarios_insert_admin"
ON usuarios FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- USUARIOS - Eliminación (solo admin)
CREATE POLICY "usuarios_delete_admin"
ON usuarios FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- ============================================
-- DISCIPLINAS - Lectura (todos)
-- ============================================
CREATE POLICY "disciplinas_select_all"
ON disciplinas FOR SELECT
USING (true);

-- DISCIPLINAS - Modificación (admin)
CREATE POLICY "disciplinas_modify_admin"
ON disciplinas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

CREATE POLICY "disciplinas_insert_admin"
ON disciplinas FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- ============================================
-- PRODUCTOS - Lectura (todos)
-- ============================================
CREATE POLICY "productos_select_all"
ON productos FOR SELECT
USING (true);

-- PRODUCTOS - Modificación (admin)
CREATE POLICY "productos_modify_admin"
ON productos FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- ============================================
-- TRANSACCIONES - Lectura (viewer+)
-- ============================================
CREATE POLICY "transacciones_select_viewer"
ON transacciones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor', 'viewer')
  )
);

-- TRANSACCIONES - Modificación (admin y editor)
CREATE POLICY "transacciones_update_editor"
ON transacciones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor')
  )
);

-- TRANSACCIONES - Inserción
CREATE POLICY "transacciones_insert_editor"
ON transacciones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor')
  )
);

-- ============================================
-- WALLETS - Lectura (viewer+)
-- ============================================
CREATE POLICY "wallets_select_viewer"
ON wallets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor', 'viewer')
  )
);

-- WALLETS - Modificación (admin y editor)
CREATE POLICY "wallets_update_editor"
ON wallets FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol IN ('admin', 'editor')
  )
);

-- ============================================
-- ESTADÍSTICAS - Lectura (todos)
-- ============================================
CREATE POLICY "estadisticas_select_all"
ON estadisticas FOR SELECT
USING (true);

-- ESTADÍSTICAS - Modificación (solo admin)
CREATE POLICY "estadisticas_update_admin"
ON estadisticas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- ============================================
-- USUARIOS_ROLES - Gestión (solo admin)
-- ============================================
CREATE POLICY "usuarios_roles_select_admin"
ON usuarios_roles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

CREATE POLICY "usuarios_roles_insert_admin"
ON usuarios_roles FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

CREATE POLICY "usuarios_roles_delete_admin"
ON usuarios_roles FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM usuarios_roles ur
    WHERE ur.usuario_id = auth.uid()
    AND ur.rol = 'admin'
  )
);

-- ============================================
-- FUNCIONES ÚTILES
-- ============================================

-- Función para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR AS $$
BEGIN
  RETURN (
    SELECT rol FROM usuarios_roles
    WHERE usuario_id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar si el usuario es admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM usuarios_roles
      WHERE usuario_id = auth.uid()
      AND rol = 'admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
