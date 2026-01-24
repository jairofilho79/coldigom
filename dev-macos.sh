#!/bin/bash
# Script helper para executar Flutter macOS após Docker estar pronto
# Uso: ./dev-macos.sh

set -e

echo "🚀 Iniciando ambiente de desenvolvimento Flutter macOS..."

# Verificar se Docker está rodando
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker não está rodando!"
    echo ""
    echo "💡 Solução:"
    echo "   1. Abra o Docker Desktop"
    echo "   2. Aguarde até que o Docker esteja completamente iniciado"
    echo "   3. Execute este script novamente"
    echo ""
    echo "   Ou execute o diagnóstico:"
    echo "   ./diagnose-connection.sh"
    exit 1
fi

# Verificar se os serviços estão rodando
if ! docker ps | grep -q praise_api_dev; then
    echo "⚠️  Serviços Docker não estão rodando. Iniciando..."
    docker-compose -f docker-compose.dev.yml up -d
    echo "⏳ Aguardando serviços ficarem prontos..."
    sleep 5
fi

# Verificar se backend está respondendo
echo "🔍 Verificando se backend está acessível..."
if ! curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    echo "⚠️  Backend ainda não está respondendo. Aguardando..."
    for i in {1..30}; do
        if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
            echo "✅ Backend está pronto!"
            break
        fi
        if [ $i -eq 30 ]; then
            echo ""
            echo "❌ Backend não está respondendo após 30 segundos"
            echo ""
            echo "💡 Diagnóstico:"
            echo "   1. Verifique se os containers estão rodando:"
            echo "      docker-compose -f docker-compose.dev.yml ps"
            echo ""
            echo "   2. Verifique os logs do backend:"
            echo "      docker-compose -f docker-compose.dev.yml logs backend --tail 50"
            echo ""
            echo "   3. Execute o script de diagnóstico completo:"
            echo "      ./diagnose-connection.sh"
            echo ""
            exit 1
        fi
        sleep 1
    done
else
    echo "✅ Backend está acessível!"
fi

# Navegar para o diretório Flutter
cd frontend-flutter

# Verificar se Flutter está instalado localmente
if ! command -v flutter &> /dev/null; then
    echo "❌ Flutter não está instalado localmente."
    echo "   Por favor, instale o Flutter: https://flutter.dev/docs/get-started/install/macos"
    exit 1
fi

# Verificar se Xcode está configurado
if ! xcode-select -p &> /dev/null || [ ! -d "$(xcode-select -p)" ]; then
    echo "❌ Xcode não está configurado."
    echo "   Por favor, instale e configure o Xcode primeiro."
    exit 1
fi

# Configurar variável de ambiente para API (usar 127.0.0.1 para evitar problemas de firewall)
export FLUTTER_API_BASE_URL=http://127.0.0.1:8000

echo ""
echo "📦 Preparando ambiente Flutter..."
flutter pub get

echo ""
echo "🔨 Executando build runner..."
flutter pub run build_runner build --delete-conflicting-outputs

echo ""
echo "🎯 Iniciando aplicação macOS com DevTools..."
echo ""
echo "💡 Dica: O DevTools será aberto automaticamente."
echo "   Você verá uma URL no terminal para acessar o DevTools no navegador."
echo ""

# Executar Flutter com DevTools
flutter run -d macos
