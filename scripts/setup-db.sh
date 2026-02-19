#!/bin/bash

# Script para configurar banco de dados com dados iniciais (seeds)
# Suporta três ambientes: Local (Docker dev na máquina), Dev (Docker dev na VPS), Prod (Docker prod na VPS)
# Uso: ./scripts/setup-db.sh [--env prod|dev|local] [--skip-material-types] [--skip-seed-data]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variáveis de ambiente
ENV=""  # prod, dev, ou local (será detectado automaticamente se não especificado)
SKIP_MATERIAL_TYPES=false
SKIP_SEED_DATA=false

# Função para mostrar uso
show_usage() {
    echo "Uso: $0 [OPÇÕES]"
    echo ""
    echo "Opções:"
    echo "  --env ENV              Força ambiente específico (prod|dev|local)"
    echo "                         local = Docker dev na máquina local"
    echo "                         dev = Docker dev na VPS"
    echo "                         prod = Docker prod na VPS"
    echo "  --skip-material-types  Pular seed de MaterialTypes"
    echo "  --skip-seed-data       Pular importação de dados iniciais (MaterialKinds, PraiseTags)"
    echo "  --help                 Mostrar esta mensagem de ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 --env prod"
    echo "  $0 --env dev"
    echo "  $0 --env local"
}

# Parse argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            if [[ ! "$ENV" =~ ^(prod|dev|local)$ ]]; then
                echo -e "${RED}❌ Ambiente inválido: $ENV${NC}"
                echo "   Use: prod, dev ou local"
                exit 1
            fi
            shift 2
            ;;
        --skip-material-types)
            SKIP_MATERIAL_TYPES=true
            shift
            ;;
        --skip-seed-data)
            SKIP_SEED_DATA=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Argumento desconhecido: $1${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🌱 Configuração do Banco de Dados${NC}"
echo ""

# Verificar se Docker está disponível
if ! command -v docker > /dev/null 2>&1 || ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}❌ Erro: Docker não está disponível ou não está rodando${NC}"
    echo "   Este script requer Docker para executar"
    exit 1
fi

# Detectar ambiente se não foi especificado
if [ -z "$ENV" ]; then
    echo -e "${CYAN}🔍 Detectando ambiente...${NC}"
    
    # Detectar prod primeiro (prioridade)
    if docker ps | grep -q "praise_api_prod"; then
        ENV="prod"
        BACKEND_CONTAINER="praise_api_prod"
        COMPOSE_FILE="docker-compose.prod.yml"
        COMPOSE_CMD="docker-compose -f docker-compose.prod.yml"
        echo -e "${GREEN}✅ Ambiente detectado: PRODUÇÃO (Docker na VPS)${NC}"
    # Detectar dev
    elif docker ps | grep -q "praise_api_dev"; then
        ENV="dev"
        BACKEND_CONTAINER="praise_api_dev"
        COMPOSE_FILE="docker-compose.dev.yml"
        COMPOSE_CMD="docker-compose -f docker-compose.dev.yml"
        echo -e "${GREEN}✅ Ambiente detectado: DESENVOLVIMENTO (Docker)${NC}"
        echo -e "${CYAN}   Nota: Se estiver na sua máquina local, use --env local${NC}"
    else
        # Nenhum container encontrado, assumir local (máquina do desenvolvedor)
        ENV="local"
        BACKEND_CONTAINER="praise_api_dev"
        COMPOSE_FILE="docker-compose.dev.yml"
        COMPOSE_CMD="docker-compose -f docker-compose.dev.yml"
        echo -e "${YELLOW}⚠️  Nenhum container encontrado, assumindo LOCAL (Docker dev na máquina)${NC}"
    fi
else
    echo -e "${CYAN}📋 Ambiente forçado: ${ENV^^}${NC}"
    
    # Configurar variáveis baseadas no ambiente forçado
    case "$ENV" in
        prod)
            BACKEND_CONTAINER="praise_api_prod"
            COMPOSE_FILE="docker-compose.prod.yml"
            COMPOSE_CMD="docker-compose -f docker-compose.prod.yml"
            ;;
        dev|local)
            # Ambos dev e local usam docker-compose.dev.yml
            BACKEND_CONTAINER="praise_api_dev"
            COMPOSE_FILE="docker-compose.dev.yml"
            COMPOSE_CMD="docker-compose -f docker-compose.dev.yml"
            if [ "$ENV" = "local" ]; then
                echo -e "${CYAN}   Usando docker-compose.dev.yml (ambiente local simula dev)${NC}"
            fi
            ;;
    esac
fi

echo ""

# Função para executar seed de MaterialTypes
run_material_types_seed() {
    echo -e "${BLUE}📋 Executando seed de MaterialTypes...${NC}"
    
    # Verificar se container está rodando
    if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
        echo -e "${YELLOW}⚠️  Container '$BACKEND_CONTAINER' não está rodando${NC}"
        echo "   Iniciando serviços..."
        $COMPOSE_CMD up -d db backend
        echo "   Aguardando serviços iniciarem..."
        sleep 5
    fi
    
    docker exec "$BACKEND_CONTAINER" python scripts/seed_material_types.py
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ MaterialTypes seedados com sucesso${NC}"
    else
        echo -e "${RED}❌ Erro ao seedar MaterialTypes${NC}"
        exit $EXIT_CODE
    fi
}

# Função para executar importação de dados iniciais
run_seed_data_import() {
    echo -e "${BLUE}📋 Executando importação de dados iniciais...${NC}"
    
    # Verificar se container está rodando
    if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
        echo -e "${YELLOW}⚠️  Container '$BACKEND_CONTAINER' não está rodando${NC}"
        echo "   Iniciando serviços..."
        $COMPOSE_CMD up -d db backend
        echo "   Aguardando serviços iniciarem..."
        sleep 5
    fi
    
    docker exec "$BACKEND_CONTAINER" python scripts/import_seed_data.py
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Dados iniciais importados com sucesso${NC}"
    else
        echo -e "${YELLOW}⚠️  Aviso: Erro ao importar dados iniciais (pode ser normal se já existirem)${NC}"
    fi
}

# Executar seeds
if [ "$SKIP_MATERIAL_TYPES" = false ]; then
    run_material_types_seed
    echo ""
else
    echo -e "${YELLOW}⏭️  Seed de MaterialTypes pulado${NC}"
    echo ""
fi

if [ "$SKIP_SEED_DATA" = false ]; then
    run_seed_data_import
    echo ""
else
    echo -e "${YELLOW}⏭️  Importação de dados iniciais pulada${NC}"
    echo ""
fi

echo -e "${GREEN}✨ Configuração do banco de dados concluída!${NC}"
echo ""
echo -e "${CYAN}💡 Próximos passos:${NC}"
echo "   1. Execute migrations se necessário: alembic upgrade head"
echo "   2. Execute a importação de praises: ./scripts/import-all-praises.sh --env $ENV"
