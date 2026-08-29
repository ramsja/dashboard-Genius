#!/bin/bash

echo "🚀 Iniciando Dashboard en Tiempo Real"
echo "======================================"
echo ""

# Verificar si existen node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    echo ""
fi

# Información de acceso
echo "✅ Servidor iniciado"
echo ""
echo "📊 Acceso al dashboard:"
echo "   🌐 http://localhost:3000"
echo ""
echo "📡 WebSocket activo para actualizaciones en tiempo real"
echo ""
echo "Para simular cambios de datos, en otra terminal ejecuta:"
echo "   npm run simulate"
echo ""

# Iniciar servidor
npm start
