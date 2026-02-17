#!/bin/bash

# Script para iniciar ambiente de desenvolvimento do coldigom

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🚀 Iniciando ambiente de DESENVOLVIMENTO do coldigom..."

# Verificar se o arquivo .env.dev existe
if [ ! -f ".env.dev" ]; then
    echo "❌ Erro: Arquivo .env.dev não encontrado!"
    echo "   Crie o arquivo .env.dev baseado em .env.example"
    exit 1
fi

# Copiar .env.dev para .env (Docker Compose usa .env por padrão)
cp .env.dev .env

# Carregar variáveis do .env.dev para o ambiente atual
# O Docker Compose vai ler o .env automaticamente, então não precisamos fazer source
# Apenas garantir que o arquivo existe

# Iniciar serviços com profile dev
echo "📦 Iniciando serviços Docker Compose (profile: dev)..."
docker-compose --profile dev up -d

echo ""
echo "✅ Ambiente de desenvolvimento iniciado!"
echo ""
echo "📋 Serviços disponíveis:"
echo "   - Backend API: http://localhost:8000"
echo "   - Frontend: http://localhost:3000"
echo "   - Docs API: http://localhost:8000/docs"
echo ""
echo "Para ver os logs: docker-compose --profile dev logs -f"
echo "Para parar: docker-compose --profile dev down"
