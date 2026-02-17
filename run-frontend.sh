#!/bin/bash
# Script para iniciar o frontend em modo host (acessível de outros dispositivos na rede)
# Uso: ./run-frontend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🌐 Iniciando frontend React (Vite) em modo host..."
echo ""

# Verificar se as dependências estão instaladas
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Instalando dependências do frontend..."
    (cd frontend && npm install)
    echo ""
fi

# Obter o IP da máquina na rede local
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="0.0.0.0"
fi

echo "✅ Frontend será acessível em:"
echo "   - http://localhost:3000 (máquina local)"
echo "   - http://$LOCAL_IP:3000 (outros dispositivos na rede)"
echo ""
echo "   Para parar: Ctrl+C"
echo ""

# Executar o Vite com --host para permitir acesso de outros dispositivos
cd frontend && npm run dev -- --host
