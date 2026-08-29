# 🗄️ Supabase Setup - Base de Datos Normalizada

## 📋 Descripción

Base de datos PostgreSQL normalizada para Dashboard Genius con:
- **Tablas normalizadas** (usuarios, disciplinas, productos, transacciones, wallets, estadísticas)
- **Row Level Security (RLS)** para control de acceso por rol
- **3 niveles de permisos** (admin, editor, viewer)
- **Datos reales** importados del CSV

---

## 🚀 SETUP RÁPIDO (5 minutos)

### 1. Crear cuenta en Supabase
```
https://supabase.com → Sign Up → Create New Project
```

### 2. Obtener credenciales
En tu proyecto Supabase:
- Click en **Settings** (engranaje)
- Click en **API**
- Copiar:
  - **Project URL** → `SUPABASE_URL`
  - **anon public** → `SUPABASE_ANON_KEY`
  - **service_role** → `SUPABASE_SERVICE_KEY`

### 3. Crear archivo `.env.local`
```bash
cp .env.example .env.local
```

Editar y pegar credenciales:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

### 4. Crear schema SQL
En Supabase SQL Editor, copiar y ejecutar `schema.sql`:
```
Settings → SQL Editor → Crear nueva query
Copiar contenido de schema.sql
Click en Run
```

### 5. Crear RLS policies
En Supabase SQL Editor, ejecutar `rls-policies.sql`:
```
Settings → SQL Editor → Nueva query
Copiar contenido de rls-policies.sql
Click en Run
```

### 6. Instalar dependencias
```bash
npm install @supabase/supabase-js dotenv
```

### 7. Importar datos
```bash
node import-data-supabase.js
```

### 8. Crear usuarios con roles
```sql
-- Ejecutar en Supabase SQL Editor

-- 1. Crear usuarios en Auth
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES
  ('admin@dashboard.test', crypt('admin123', gen_salt('bf')), NOW()),
  ('editor@dashboard.test', crypt('editor123', gen_salt('bf')), NOW()),
  ('viewer@dashboard.test', crypt('viewer123', gen_salt('bf')), NOW());

-- 2. Obtener IDs de usuarios
SELECT id, email FROM auth.users;

-- 3. Asignar roles (reemplazar UIDs)
INSERT INTO usuarios_roles (usuario_id, rol) VALUES
  ('UID-ADMIN-HERE', 'admin'),
  ('UID-EDITOR-HERE', 'editor'),
  ('UID-VIEWER-HERE', 'viewer');
```

### 9. Iniciar servidor
```bash
npm start
```

✅ Dashboard en: http://localhost:3000

---

## 📊 Estructura de Base de Datos

### 1. **usuarios**
Clientes/Jugadores del sistema
```sql
id (BIGINT) - ID único
username (VARCHAR) - Nombre de usuario
email (VARCHAR)
estado (VARCHAR) - activo, inactivo, desconectado, suspendido
casa_apuestas (VARCHAR)
created_at, updated_at, last_activity
```

### 2. **disciplinas**
Categorías: Deportes, Casino, Otros
```sql
id (SERIAL)
nombre (VARCHAR) - deportes, casino, otros
descripcion (TEXT)
activa (BOOLEAN)
```

### 3. **productos**
Juegos específicos (Joker Power, Cupón, etc)
```sql
id (SERIAL)
disciplina_id (FK)
nombre (VARCHAR)
descripcion (TEXT)
activo (BOOLEAN)
```

### 4. **transacciones**
Depósitos, retiros, apuestas, ganancias
```sql
id (BIGINT)
usuario_id (FK)
producto_id (FK)
tipo - Deposit, Withdraw, Bet, Win
monto (DECIMAL)
moneda (VARCHAR) - USD, etc
saldo_anterior, saldo_posterior (DECIMAL)
comision (DECIMAL)
estado
descripcion (TEXT)
ip_address (INET)
created_at
```

### 5. **wallets**
Cuentas/Billeteras por usuario
```sql
id (SERIAL)
usuario_id (FK) - UNIQUE
saldo_actual (DECIMAL)
moneda (VARCHAR)
tipo (VARCHAR)
```

### 6. **estadisticas**
Métricas agregadas diarias
```sql
fecha (DATE) - UNIQUE
total_usuarios, usuarios_activos, etc
total_depositos, total_retiros
comisiones_totales (DECIMAL)
```

### 7. **usuarios_roles**
Asignación de roles a usuarios
```sql
usuario_id (FK) - auth.users
rol (VARCHAR) - admin, editor, viewer
```

---

## 🔐 Control de Acceso (RLS)

### Niveles de Rol

| Acción | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| **Ver usuarios** | ✅ | ✅ | ✅ |
| **Crear usuario** | ✅ | ❌ | ❌ |
| **Editar usuario** | ✅ | ✅ | ❌ |
| **Eliminar usuario** | ✅ | ❌ | ❌ |
| **Ver transacciones** | ✅ | ✅ | ✅ |
| **Crear transacción** | ✅ | ✅ | ❌ |
| **Editar transacción** | ✅ | ✅ | ❌ |
| **Ver estadísticas** | ✅ | ✅ | ✅ |
| **Gestionar roles** | ✅ | ❌ | ❌ |

### Cómo Funciona RLS

1. Cada usuario tiene un **rol** en `usuarios_roles`
2. Cada tabla tiene **políticas** que verifican el rol
3. Supabase filtra automáticamente datos según el rol
4. Imposible obtener datos no autorizados (nivel BD)

---

## 🔗 APIs REST

### Usuarios
```bash
GET /api/usuarios
# Obtiene lista de usuarios
```

### Transacciones
```bash
GET /api/transacciones
# Obtiene transacciones con datos del usuario
```

### Resumen
```bash
GET /api/resumen
# Estadísticas del día actual
```

### Campos/Disciplinas
```bash
GET /api/campos
# Breakdown por disciplina
```

---

## 📈 Vistas SQL Útiles

### Resumen por Estado
```sql
SELECT * FROM resumen_usuarios;
```

### Transacciones Diarias
```sql
SELECT * FROM resumen_transacciones_diarias;
```

---

## 🛠️ Comandos Útiles

### Importar datos
```bash
node import-data-supabase.js
```

### Ver logs del servidor
```bash
npm start
```

### Acceder a SQL Editor en Supabase
```
Dashboard → SQL Editor → Nueva query
```

### Crear usuario con rol (SQL)
```sql
-- 1. En Auth (Supabase Dashboard)
-- Create New User → email y password

-- 2. En usuarios_roles table
INSERT INTO usuarios_roles (usuario_id, rol)
VALUES ('copied-uid-from-auth', 'admin');
```

---

## 🆘 Solución de Problemas

### No se conecta a Supabase
```
❌ Error: Variables de entorno no configuradas
✅ Solución: Crear .env.local con credenciales correctas
```

### RLS bloquea mis queries
```
❌ Error: "new row violates row-level security policy"
✅ Solución: Usar usuario con rol apropiado
```

### Datos no se importan
```bash
❌ Error en import-data-supabase.js
✅ Solución: 
1. Verificar schema.sql fue ejecutado
2. Verificar RLS policies están habilitadas
3. Ejecutar: npm run load-data (fallback)
```

### No puedo crear usuarios
```
❌ Error: Permiso denegado
✅ Solución: 
1. Acceder a Supabase Dashboard como admin
2. Ir a Auth → Users
3. Create New User manualmente
```

---

## 📋 Checklist de Configuración

- [ ] Cuenta Supabase creada
- [ ] Proyecto PostgreSQL creado
- [ ] Credenciales copiadas
- [ ] `.env.local` creado con credenciales
- [ ] `schema.sql` ejecutado
- [ ] `rls-policies.sql` ejecutado
- [ ] `npm install @supabase/supabase-js dotenv`
- [ ] `node import-data-supabase.js` ejecutado
- [ ] Usuarios creados con roles
- [ ] `npm start` funcionando

---

## 🔗 Recursos

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Row Level Security](https://supabase.com/docs/learn/auth-deep-dive/row-level-security)
- [REST API](https://supabase.com/docs/reference/javascript/introduction)

---

## 📱 Acceso Remoto con BD

Con Supabase + ngrok:

```bash
Terminal 1:
npm start

Terminal 2:
npm run tunnel

Terminal 3 (Opcional):
npm run watch-data
```

URL pública: `https://xxxx-xxxx-xxxx.ngrok.io`

**Todos los datos están en Supabase Cloud** ☁️
Accesible desde cualquier dispositivo con internete.

---

**Rama**: `claude/estructura-estudio-kozee8`
**Estado**: ✅ Production Ready
**BD**: ✅ PostgreSQL en Supabase
**Seguridad**: ✅ RLS habilitado
