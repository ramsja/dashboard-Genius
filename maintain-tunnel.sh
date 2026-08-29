#!/bin/bash

# Script para mantener el túnel activo
# Uso: bash maintain-tunnel.sh

PORT=3000
MAX_RETRIES=5
RETRY_DELAY=5

function start_tunnel() {
  echo "🌐 Iniciando túnel en puerto $PORT..."
  lt --port $PORT 2>&1
}

function check_tunnel() {
  # Verificar si el túnel está activo
  curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q "public_url" && return 0 || return 1
}

function restart_tunnel() {
  RETRY=0
  while [ $RETRY -lt $MAX_RETRIES ]; do
    if start_tunnel; then
      echo "✅ Túnel iniciado exitosamente"
      return 0
    fi
    RETRY=$((RETRY + 1))
    echo "⏳ Reintentando en ${RETRY_DELAY}s... (intento $RETRY/$MAX_RETRIES)"
    sleep $RETRY_DELAY
  done
  echo "❌ No se pudo iniciar el túnel después de $MAX_RETRIES intentos"
  return 1
}

echo "╔════════════════════════════════════════╗"
echo "║   Dashboard Genius - Túnel Activo     ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "🖥️  Servidor local: http://localhost:$PORT"
echo "🌐 Túnel remoto: https://dashboard-genius-kz8.loca.lt"
echo ""

# Monitorear y reiniciar si es necesario
while true; do
  if ! check_tunnel; then
    echo "⚠️  Túnel desconectado, reiniciando..."
    pkill -f "lt --port $PORT" 2>/dev/null || true
    sleep 2
    restart_tunnel
  fi
  sleep 30
done
