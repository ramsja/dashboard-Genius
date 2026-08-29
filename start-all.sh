#!/bin/bash

# START ALL - Inicia Dashboard Genius completamente

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        🎯 Dashboard Genius - Startup Completo            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Verificar Node.js
echo -e "${BLUE}1️⃣  Verificando dependencias...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no instalado${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js OK${NC}"

# 2. Instalar dependencias
echo ""
echo -e "${BLUE}2️⃣  Instalando dependencias...${NC}"
npm install --silent > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
else
    echo -e "${YELLOW}⚠️  Error en npm install${NC}"
fi

# 3. Iniciar servidor
echo ""
echo -e "${BLUE}3️⃣  Iniciando servidor Express...${NC}"
node server.js &
SERVER_PID=$!
sleep 3

# Verificar si el servidor está corriendo
if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✅ Servidor corriendo (PID: $SERVER_PID)${NC}"
else
    echo -e "${RED}❌ Error iniciando servidor${NC}"
    exit 1
fi

# 4. Verificar servidor
echo ""
echo -e "${BLUE}4️⃣  Verificando servidor...${NC}"
if curl -s http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✅ Servidor respondiendo${NC}"
else
    echo -e "${RED}❌ Servidor no responde${NC}"
    exit 1
fi

# 5. Iniciar túnel
echo ""
echo -e "${BLUE}5️⃣  Iniciando túnel remoto...${NC}"
timeout 10 lt --port 3000 2>&1 &
TUNNEL_PID=$!
sleep 5

# 6. Resumen final
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo -e "${GREEN}         ✅ DASHBOARD GENIUS - LISTO PARA USAR${NC}"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}📊 ACCESO LOCAL:${NC}"
echo "   🔗 http://localhost:3000"
echo "   🔗 http://localhost:3000/index-realtime.html"
echo "   🔗 http://localhost:3000/descargas.html"
echo ""
echo -e "${YELLOW}🌐 ACCESO REMOTO:${NC}"
echo "   🔗 https://dashboard-genius-kz8.loca.lt"
echo ""
echo -e "${YELLOW}📡 APIs:${NC}"
echo "   🔗 GET http://localhost:3000/api/resumen"
echo "   🔗 GET http://localhost:3000/api/usuarios"
echo "   🔗 GET http://localhost:3000/api/transacciones"
echo "   🔗 GET http://localhost:3000/download/usuarios.csv"
echo ""
echo -e "${YELLOW}📊 DATOS:${NC}"
echo "   • 231 usuarios"
echo "   • 500+ transacciones"
echo "   • Deportes + Casino"
echo ""
echo -e "${YELLOW}🎯 RAMA:${NC}"
echo "   🔗 claude/estructura-estudio-kozee8"
echo ""
echo -e "${YELLOW}⏸️  Presiona Ctrl+C para detener${NC}"
echo ""

# Mantener script activo
wait
