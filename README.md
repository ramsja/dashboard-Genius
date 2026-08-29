# Kali Lab - Extractor + Dashboard

Este proyecto recoge transacciones desde el Back Office y genera un resumen diario para visualizar el estado de clientes por disciplina y por conexión.

## 1) Configuración local

1. Copia `.env.example` a `.env`.
2. Completa tus credenciales reales de Back Office y Supabase.
3. Instala dependencias del proyecto:

```bash
python -m pip install requests beautifulsoup4 python-dotenv
```

4. Ejecuta la extracción:

```bash
python extraccionDatos.py
```

## 2) Dashboard visual

Para ver el dashboard en local:

```bash
cd kali-lab
python -m http.server 8000
```

Luego abre:

- http://localhost:8000/dashboard/

Esto leerá los archivos JSON generados en `reportes/`.

## 3) Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase/schema.sql`.
3. Define la política de roles de la app usando un claim JWT `app_role`.
4. Crea usuarios con roles:
   - `viewer`: solo lectura
   - `editor`: inserción y edición
   - `admin`: gestión completa

Ejemplo de cargos útil:

- `viewer` -> analistas / dirección
- `editor` -> operación / consolidación
- `admin` -> administrador del flujo

## 4) GitHub / otros equipos

- No subas el archivo `.env` a GitHub.
- Usa `.env.example` como plantilla.
- Sube el código y el dashboard, y que cada PC use su propio `.env` con credenciales locales.
- Para llegar desde otras PCs, usa GitHub Pages, Vercel, Netlify o un hosting estático.

## 5) Seguridad

- Nunca guardes secretos en el repositorio.
- Usa permisos por rol en Supabase.
- Mantén `SUPABASE_SERVICE_ROLE_KEY` solo para backend o scripts privilegiados.
- Usa `SUPABASE_ANON_KEY` solo para consultas públicas.

## 6) Estructura

```text
.
├── .env.example
├── .env
├── extraccionDatos.py
├── dashboard/
│   ├── index.html
│   └── app.js
├── reportes/
├── supabase/
│   └── schema.sql
└── README.md
```
