#!/bin/bash
# Script de diagnóstico para problemas de conexão Flutter + Backend
# Uso: ./diagnose-connection.sh

set -e

echo "🔍 Diagnóstico de Conexão Flutter + Backend"
echo "=========================================="
echo ""

# 1. Verificar Docker
echo "1️⃣ Verificando Docker..."
if ! docker ps > /dev/null 2>&1; then
    echo "   ❌ Docker não está rodando!"
    echo "   💡 Solução: Inicie o Docker Desktop"
    exit 1
else
    echo "   ✅ Docker está rodando"
fi

# 2. Verificar containers
echo ""
echo "2️⃣ Verificando containers..."
if ! docker ps | grep -q praise_api_dev; then
    echo "   ⚠️  Backend não está rodando"
    echo "   💡 Tentando iniciar..."
    cd "$(dirname "$0")"
    docker-compose -f docker-compose.dev.yml up -d db backend
    echo "   ⏳ Aguardando backend ficar pronto..."
    sleep 10
else
    echo "   ✅ Backend container está rodando"
fi

# 3. Verificar status dos serviços
echo ""
echo "3️⃣ Status dos serviços:"
cd "$(dirname "$0")"
docker-compose -f docker-compose.dev.yml ps

# 4. Verificar porta 8000
echo ""
echo "4️⃣ Verificando porta 8000..."
if lsof -i :8000 > /dev/null 2>&1; then
    echo "   ✅ Porta 8000 está em uso"
    lsof -i :8000
else
    echo "   ❌ Porta 8000 não está em uso"
    echo "   💡 Backend pode não estar rodando corretamente"
fi

# 5. Testar conexão HTTP
echo ""
echo "5️⃣ Testando conexão HTTP..."
if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    echo "   ✅ Backend está respondendo em http://127.0.0.1:8000"
else
    echo "   ❌ Backend não está respondendo"
    echo "   💡 Verificando logs do backend..."
    docker-compose -f docker-compose.dev.yml logs backend --tail 20
fi

# 6. Verificar logs do backend
echo ""
echo "6️⃣ Últimas linhas dos logs do backend:"
docker-compose -f docker-compose.dev.yml logs backend --tail 10

# 7. Verificar variável de ambiente
echo ""
echo "7️⃣ Variável de ambiente FLUTTER_API_BASE_URL:"
if [ -z "$FLUTTER_API_BASE_URL" ]; then
    echo "   ⚠️  Não está definida (usará padrão: http://127.0.0.1:8000)"
else
    echo "   ✅ Definida como: $FLUTTER_API_BASE_URL"
fi

# 8. Resumo
echo ""
echo "=========================================="
echo "📋 Resumo:"
echo ""
if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    echo "✅ Backend está funcionando!"
    echo ""
    echo "Próximos passos:"
    echo "1. Execute: export FLUTTER_API_BASE_URL=http://127.0.0.1:8000"
    echo "2. Execute: cd frontend-flutter && flutter run -d macos"
else
    echo "❌ Backend não está acessível"
    echo ""
    echo "Tente:"
    echo "1. docker-compose -f docker-compose.dev.yml restart backend"
    echo "2. Aguarde alguns segundos"
    echo "3. Execute este script novamente"
fi
