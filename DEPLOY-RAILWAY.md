# 🚀 Deployment a Railway (Gratuito - 5 minutos)

## Paso 1: Crear Cuenta en Railway

1. Ve a: **https://railway.app**
2. Click en **Sign Up**
3. Usa GitHub para sign up (es más fácil)
4. Autoriza Railway en tu cuenta GitHub

## Paso 2: Crear Nuevo Proyecto

1. Click en **New Project**
2. Click en **Deploy from GitHub**
3. Busca: **dashboard-Genius**
4. Selecciona el repositorio

## Paso 3: Configurar Deploy

1. Railway detectará automáticamente `Procfile`
2. La rama debería ser: **claude/estructura-estudio-kozee8**
3. Railway iniciará el build automáticamente

## Paso 4: Esperar Deploy

- ✅ Build en progreso (1-2 minutos)
- ✅ Si todo está bien, verás status: "Success"
- ✅ Se generará automáticamente una URL como:
  ```
  https://dashboard-genius-xxxx.railway.app
  ```

## Paso 5: Acceder

Una vez listo, tu URL será visible en Railway:
```
https://dashboard-genius-xxxx.railway.app
```

Acceso desde cualquier dispositivo ✅

---

## 📋 Checklist Railroad

- [x] Código en GitHub
- [x] server-simple.js listo
- [x] Procfile creado
- [x] railway.json configurado
- [x] Todo pusheado a rama: `claude/estructura-estudio-kozee8`

## ⚠️ Si Hay Error

**Error: "Cannot find module"**
→ Es normal, Railway instala dependencias automáticamente

**Error: "Port not specified"**
→ Ya está en server-simple.js (puerto 3000)

**Error: "Build failed"**
→ Revisar logs en Railway dashboard

---

## 🎯 Resultado Final

Tu dashboard estará disponible 24/7 en:
```
https://dashboard-genius-[tu-hash].railway.app
```

✅ Sin límites de tiempo
✅ Auto-restart en fallos
✅ Acceso remoto seguro
✅ Gratis

---

## 📱 Una vez deployado:

- Centro Control: `https://dashboard-genius-xxxx.railway.app`
- Dashboard: `https://dashboard-genius-xxxx.railway.app/index-realtime.html`
- Descargas: `https://dashboard-genius-xxxx.railway.app/descargas.html`
- API: `https://dashboard-genius-xxxx.railway.app/api/resumen`

---

## 🆘 Soporte

Si tienes problema:
1. Revisa logs en Railway dashboard
2. Verifica que la rama sea `claude/estructura-estudio-kozee8`
3. Asegúrate que `server-simple.js` esté en raíz del repo

¡Listo! Railway hará el resto automáticamente.
