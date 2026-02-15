#!/bin/bash
# Script de desenvolvimento macOS: sobe backend (Docker) e frontend React (Vite)
# Uso: ./dev-macos.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Ambiente de desenvolvimento (backend + frontend React)"
echo ""

# Verificar se Docker está rodando
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker não está rodando!"
    echo ""
    echo "💡 Solução:"
    echo "   1. Abra o Docker Desktop"
    echo "   2. Aguarde o Docker iniciar completamente"
    echo "   3. Execute este script novamente"
    echo ""
    echo "   Ou execute o diagnóstico: ./diagnose-connection.sh"
    exit 1
fi

# Subir apenas db e backend (evita serviço Flutter removido)
if ! docker ps | grep -q praise_api_dev; then
    echo "⚠️  Serviços não estão rodando. Iniciando db e backend..."
    docker-compose -f docker-compose.dev.yml up -d db backend
    echo "⏳ Aguardando serviços ficarem prontos..."
    sleep 5
fi

# Verificar se o backend está respondendo
echo "🔍 Verificando backend (http://127.0.0.1:8000)..."
for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null | grep -q 200; then
        echo "✅ Backend está on!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo ""
        echo "❌ Backend não respondeu após 30 segundos"
        echo ""
        echo "💡 Diagnóstico:"
        echo "   docker-compose -f docker-compose.dev.yml ps"
        echo "   docker-compose -f docker-compose.dev.yml logs backend --tail 50"
        echo "   ./diagnose-connection.sh"
        exit 1
    fi
    sleep 1
done

# Frontend: garantir dependências e subir dev server
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Instalando dependências do frontend..."
    (cd frontend && npm install)
fi

echo ""
echo "🌐 Iniciando frontend React (Vite) em http://localhost:3000"
echo "   API: http://127.0.0.1:8000  |  Docs: http://127.0.0.1:8000/docs"
echo ""
echo "   Para parar: Ctrl+C (apenas o frontend). Backend continua no Docker."
echo ""

cd frontend && npm run dev
