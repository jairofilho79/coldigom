#!/bin/bash

# Script para iniciar ambiente de produção do coldigom

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🚀 Iniciando ambiente de PRODUÇÃO do coldigom..."

# Verificar se o arquivo .env.prod existe
if [ ! -f ".env.prod" ]; then
    echo "❌ Erro: Arquivo .env.prod não encontrado!"
    echo "   Crie o arquivo .env.prod baseado em .env.example"
    exit 1
fi

# Verificar configurações críticas de produção
echo "🔍 Verificando configurações de produção..."

# Verificar se CORS não está usando wildcard
if grep -q "CORS_ORIGINS=\*" .env.prod 2>/dev/null; then
    echo "⚠️  AVISO: CORS_ORIGINS está usando '*' em produção!"
    echo "   Isso é um risco de segurança. Configure domínios específicos."
    read -p "   Continuar mesmo assim? (s/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 1
    fi
fi

# Verificar se JWT_SECRET_KEY foi alterado
if grep -q "JWT_SECRET_KEY=your-secret-key\|JWT_SECRET_KEY=CHANGE_THIS" .env.prod 2>/dev/null; then
    echo "⚠️  AVISO: JWT_SECRET_KEY não foi configurado!"
    echo "   Configure um secret forte em .env.prod antes de continuar."
    exit 1
fi

# Copiar .env.prod para .env (Docker Compose usa .env por padrão)
cp .env.prod .env

# Carregar variáveis do .env.prod para o ambiente atual
if [ -f ".env.prod" ]; then
    set -a
    source .env.prod
    set +a
fi

# Iniciar serviços com profile prod
echo "📦 Iniciando serviços Docker Compose (profile: prod)..."
docker-compose --profile prod up -d

echo ""
echo "✅ Ambiente de produção iniciado!"
echo ""
echo "📋 Serviços disponíveis:"
echo "   - Backend API: http://localhost:8000"
echo "   - Frontend: http://localhost:3000"
echo ""
echo "⚠️  Lembre-se de configurar:"
echo "   - CORS_ORIGINS com domínios específicos"
echo "   - JWT_SECRET_KEY forte e único"
echo "   - Senhas de banco de dados fortes"
echo ""
echo "Para ver os logs: docker-compose --profile prod logs -f"
echo "Para parar: docker-compose --profile prod down"
