# ⚙️ Configuración de Supabase para Dashboard Genius

## Paso 1: Crear Proyecto en Supabase

1. Ve a https://supabase.com
2. Haz login o crea una cuenta
3. Click en "New Project"
4. Nombre: `dashboard-genius`
5. Database Password: Genera una contraseña fuerte
6. Region: Selecciona la más cercana a ti
7. Click "Create new project"

## Paso 2: Obtener Credenciales

1. En tu proyecto, ve a **Settings** → **API**
2. Copia:
   - **Project URL** (SUPABASE_URL)
   - **anon public** key (SUPABASE_ANON_KEY)

## Paso 3: Configurar Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

O en Render, ve a:
- Environment → Add Environment Variable
- Agrega ambas variables

## Paso 4: Ejecutar Schema SQL

1. En Supabase, ve a **SQL Editor**
2. Click en "New Query"
3. Copia todo el contenido de `schema-normalizado.sql`
4. Pégalo en el editor
5. Click "Run"

Esto creará:
- ✅ Tablas normalizadas (usuarios, disciplinas, tipos_apuesta, apuestas, transacciones, etc.)
- ✅ Índices para optimizar queries
- ✅ Vistas para reportes
- ✅ Datos iniciales de prueba

## Paso 5: Verificar en Supabase

1. Ve a **Table Editor**
2. Deberías ver todas las tablas:
   - usuarios
   - disciplinas
   - tipos_apuesta
   - apuestas
   - transacciones
   - eventos_deportivos
   - deportes
   - tipos_usuario
   - estados_usuario
   - audit_log

## Paso 6: Verificar Conexión

Abre: `https://tu-url.onrender.com/api/usuarios`

Deberías ver JSON con los usuarios de la base de datos.

## Tablas Normalizadas

### usuarios
- id, username, nombre_completo, email
- tipo_usuario_id, estado_id
- saldo_cuenta, ganancias_totales, perdidas_totales
- fecha_registro, ultima_actividad

### disciplinas
- id, nombre (Deportes, Casino, E-Sports, Otros)
- descripcion, icono, activa

### tipos_apuesta
- id, nombre (Fútbol, Ruleta, BlackJack, etc)
- disciplina_id, comision_casa
- descripcion, activo

### apuestas (transacciones de jugadores)
- id, usuario_id, tipo_apuesta_id
- evento_deportivo_id
- monto_apostado, cuota_aplicada, monto_ganancia
- resultado (ganada, perdida, pendiente, anulada)
- fecha_apuesta, fecha_resultado

### transacciones (movimientos de dinero)
- id, usuario_id, tipo (deposito, retiro, ganancia, perdida)
- monto, saldo_anterior, saldo_nuevo
- descripcion, referencia_apuesta_id, estado
- fecha_transaccion

### eventos_deportivos
- id, deporte_id, titulo, descripcion
- equipo_local, equipo_visitante
- fecha_evento, resultado_local, resultado_visitante
- estado, cuotas

### tipos_usuario
- id, nombre (admin, editor, viewer, jugador)
- descripcion, permisos

### estados_usuario
- id, nombre (activo, inactivo, desconectado, suspendido, bloqueado)
- descripcion, activo

## APIs Disponibles

```
GET /api/usuarios           → Lista de usuarios
GET /api/resumen            → Resumen de estadísticas
GET /api/disciplinas        → Lista de disciplinas
```

## Descargas Disponibles

```
GET /download/usuarios.csv           → Exportar usuarios
GET /download/apuestas.csv           → Exportar apuestas
GET /download/transacciones.csv      → Exportar transacciones
GET /download/reporte-completo.json  → Reporte JSON completo
```

## Vistas SQL Útiles

```sql
-- Resumen de usuarios con estadísticas
SELECT * FROM resumen_usuarios;

-- Estadísticas por disciplina
SELECT * FROM estadisticas_disciplinas;

-- Top usuarios por ganancias
SELECT * FROM top_usuarios_ganancias;
```

## Troubleshooting

**Error: "Relation does not exist"**
- Verifica que hayas ejecutado el schema-normalizado.sql completamente
- Ve a SQL Editor y corre nuevamente

**Error: "Permission denied"**
- Verifica que estés usando la anon_key correcta
- Comprueba que las tablas tengan RLS (Row Level Security) deshabilitado o configurado correctamente

**No se ven datos**
- Verifica que las variables de entorno estén configuradas
- En Render: Environment → verifica SUPABASE_URL y SUPABASE_ANON_KEY

## Siguiente Paso

Una vez configurado, tu dashboard:
- ✅ Obtiene datos reales de Supabase
- ✅ Muestra usuarios ordenados por nombre
- ✅ Permite descargar CSV/JSON
- ✅ Se actualiza cada 10 segundos
- ✅ Funciona en https://tu-url.onrender.com
