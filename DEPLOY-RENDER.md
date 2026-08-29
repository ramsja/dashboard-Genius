# 🚀 Deployment a Render (100% GRATUITO)

## Paso 1: Crear Cuenta en Render

1. Ve a: **https://render.com**
2. Click en **Sign Up**
3. Usa GitHub para sign up
4. Autoriza Render en GitHub

## Paso 2: Crear Nuevo Servicio

1. En Render, click en **New +** (esquina superior derecha)
2. Selecciona **Web Service**
3. Conecta tu repositorio GitHub
4. Busca: **dashboard-Genius**
5. Selecciona el repositorio

## Paso 3: Configurar Deployment

1. **Name:** `dashboard-genius` (o lo que prefieras)
2. **Region:** Selecciona el más cercano a ti
3. **Branch:** `claude/estructura-estudio-kozee8`
4. **Runtime:** `Node`
5. **Build Command:** `npm install`
6. **Start Command:** `node server-simple.js`
7. **Plan:** Selecciona **Free**

## Paso 4: Variables de Entorno (Opcional)

Si necesitas variables, las puedes agregar en la sección **Environment**:
```
PORT=3000
NODE_ENV=production
```

## Paso 5: Deploy

1. Haz click en **Create Web Service**
2. Render comenzará el build automáticamente
3. Verás los logs en tiempo real
4. Cuando esté listo, mostrará: ✅ **Your service is live**

## Paso 6: Obtener URL Pública

Render genera automáticamente tu URL pública:
```
https://dashboard-genius.onrender.com
```

---

## 📋 Ventajas Render Gratuito

✅ Completamente gratuito
✅ URL pública automática  
✅ Sin límite de tamaño de repositorio
✅ Builds automáticos en cada push
✅ Logs en tiempo real
✅ Auto-restart en fallos
✅ Conexión directa desde GitHub
✅ Mejor que Replit para Node.js

---

## 🎯 Pasos Rápidos (5 minutos)

```
1. https://render.com → Sign Up con GitHub
2. New (+) → Web Service
3. Conectar repositorio: dashboard-Genius
4. Branch: claude/estructura-estudio-kozee8
5. Runtime: Node
6. Build: npm install
7. Start: node server-simple.js
8. Plan: Free
9. Create Web Service
10. ¡Listo! URL en: https://dashboard-genius.onrender.com
```

---

## 📱 Una vez activo:

```
Acceso Principal:
https://dashboard-genius.onrender.com

Dashboard Tiempo Real:
https://dashboard-genius.onrender.com/index-realtime.html

Descargas:
https://dashboard-genius.onrender.com/descargas.html

APIs:
https://dashboard-genius.onrender.com/api/resumen
https://dashboard-genius.onrender.com/api/usuarios
```

---

## ⚙️ Configuración en Render

**Build Command:**
```
npm install
```

**Start Command:**
```
node server-simple.js
```

Eso es todo. Render maneja el resto automáticamente.

---

## 🔄 Auto-Deploy

Cada vez que hagas push a la rama `claude/estructura-estudio-kozee8`, Render:
- Detecta los cambios automáticamente
- Hace build nuevo
- Reinicia el servidor
- Actualiza tu sitio en vivo

---

## 🎉 Listo!

Tu dashboard estará en línea gratuitamente:
```
https://dashboard-genius.onrender.com
```

¡Accesible 24/7, sin límites, 100% gratis! 🎯

---

## 🆘 Si algo no funciona

1. Abre los logs en Render (en la pestaña "Logs")
2. Verifica que el Start Command sea: `node server-simple.js`
3. Asegúrate que la rama sea: `claude/estructura-estudio-kozee8`
4. Si hay error, reinicia haciendo click en "Manual Deploy"

¡Eso es todo! 🚀
