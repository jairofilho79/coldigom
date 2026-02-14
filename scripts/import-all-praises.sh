#!/bin/bash

# Script para importar todos os arquivos de storage/praises para o banco de dados e volume Docker
# Uso: ./scripts/import-all-praises.sh [--dry-run] [--source-path CAMINHO]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Caminho padrão do storage local
DEFAULT_SOURCE_PATH="/Volumes/SSD 2TB SD/storage/assets/praises"

# Parse argumentos
DRY_RUN=false
SOURCE_PATH=""
LIMIT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --source-path)
            SOURCE_PATH="$2"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}❌ Argumento desconhecido: $1${NC}"
            echo "Uso: $0 [--dry-run] [--source-path CAMINHO] [--limit N]"
            exit 1
            ;;
    esac
done

# Usar caminho padrão se não especificado
if [ -z "$SOURCE_PATH" ]; then
    SOURCE_PATH="$DEFAULT_SOURCE_PATH"
fi

echo -e "${BLUE}🚀 Importação de Todos os Praises${NC}"
echo -e "   Caminho fonte: ${SOURCE_PATH}"
if [ "$DRY_RUN" = true ]; then
    echo -e "   ${YELLOW}⚠️  MODO DRY RUN - Nenhuma alteração será feita${NC}"
fi
echo ""

# Verificar se o caminho existe
if [ ! -d "$SOURCE_PATH" ]; then
    echo -e "${RED}❌ Erro: Caminho não encontrado: ${SOURCE_PATH}${NC}"
    exit 1
fi

# Contar quantas pastas de praises existem
PRAISE_COUNT=$(find "$SOURCE_PATH" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo -e "${GREEN}📊 Encontradas ${PRAISE_COUNT} pastas de praises${NC}"

if [ "$PRAISE_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ Nenhuma pasta de praise encontrada${NC}"
    exit 1
fi

# Verificar se o Docker está rodando
if ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}❌ Erro: Docker não está rodando${NC}"
    exit 1
fi

# Detectar qual docker-compose está sendo usado (dev ou produção)
COMPOSE_FILE="docker-compose.yml"
COMPOSE_CMD="docker-compose"

# Verificar se docker-compose.dev.yml existe e está sendo usado
if [ -f "docker-compose.dev.yml" ]; then
    # Verificar qual está ativo pelos containers
    if docker ps | grep -q "praise_api_dev"; then
        COMPOSE_FILE="docker-compose.dev.yml"
        COMPOSE_CMD="docker-compose -f docker-compose.dev.yml"
        BACKEND_CONTAINER="praise_api_dev"
        echo -e "${BLUE}📋 Detectado: docker-compose.dev.yml (modo desenvolvimento)${NC}"
    elif docker ps | grep -q "praise_api"; then
        BACKEND_CONTAINER="praise_api"
        echo -e "${BLUE}📋 Detectado: docker-compose.yml (modo produção)${NC}"
    else
        BACKEND_CONTAINER="praise_api"
    fi
else
    BACKEND_CONTAINER="praise_api"
fi

# Verificar se o container do backend está rodando
if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
    echo -e "${YELLOW}⚠️  Container '$BACKEND_CONTAINER' não está rodando${NC}"
    echo "   Iniciando serviços..."
    $COMPOSE_CMD up -d db backend
    echo "   Aguardando serviços iniciarem..."
    sleep 5
fi

echo -e "${GREEN}✅ Container: ${BACKEND_CONTAINER}${NC}"

# Verificar se está usando volume nomeado ou bind mount
PROJECT_NAME=$(basename "$(pwd)")
VOLUME_NAME="${PROJECT_NAME}_storage_assets"
USING_VOLUME=false
STORAGE_MOUNT_PATH=""

# Verificar se existe volume nomeado
if docker volume ls | grep -q "$VOLUME_NAME"; then
    USING_VOLUME=true
    echo -e "${GREEN}✅ Volume Docker nomeado: ${VOLUME_NAME}${NC}"
elif docker volume ls --format "{{.Name}}" | grep -q "storage_assets$"; then
    VOLUME_NAME=$(docker volume ls --format "{{.Name}}" | grep "storage_assets$" | head -1)
    USING_VOLUME=true
    echo -e "${GREEN}✅ Volume Docker nomeado: ${VOLUME_NAME}${NC}"
else
    # Verificar bind mount no container
    echo -e "${YELLOW}⚠️  Volume nomeado não encontrado, verificando bind mount...${NC}"
    STORAGE_MOUNT_PATH=$(docker inspect "$BACKEND_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/storage/assets"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || echo "")
    
    if [ -n "$STORAGE_MOUNT_PATH" ]; then
        echo -e "${GREEN}✅ Bind mount detectado: ${STORAGE_MOUNT_PATH}${NC}"
        USING_VOLUME=false
    else
        echo -e "${RED}❌ Erro: Não foi possível detectar storage (volume ou bind mount)${NC}"
        echo "   Verifique se o docker-compose está configurado corretamente"
        exit 1
    fi
fi

echo ""

# Perguntar confirmação se não for dry-run
if [ "$DRY_RUN" = false ]; then
    echo -e "${YELLOW}⚠️  ATENÇÃO: Esta operação irá importar ${PRAISE_COUNT} praises para o banco de dados${NC}"
    read -p "   Deseja continuar? (sim/não): " CONFIRM
    
    if [ "$CONFIRM" != "sim" ] && [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "y" ]; then
        echo -e "${YELLOW}Operação cancelada${NC}"
        exit 0
    fi
fi

# Verificar/copiar arquivos para o storage (volume ou bind mount)
echo -e "${BLUE}📦 Verificando arquivos no storage...${NC}"

if [ "$USING_VOLUME" = true ]; then
    # Usando volume nomeado
    VOLUME_PRAISE_COUNT=$(docker run --rm -v "$VOLUME_NAME:/data" alpine sh -c "ls -1 /data/praises 2>/dev/null | wc -l" 2>/dev/null || echo "0")
    TARGET_PATH="/data/praises"
    
    if [ "$VOLUME_PRAISE_COUNT" -eq "0" ] || [ "$VOLUME_PRAISE_COUNT" != "$PRAISE_COUNT" ]; then
        if [ "$DRY_RUN" = false ]; then
            echo -e "${YELLOW}📁 Copiando arquivos para o volume Docker...${NC}"
            echo -e "   Isso pode levar alguns minutos (${PRAISE_COUNT} pastas)..."
            
            # Criar estrutura de diretórios no volume
            docker run --rm -v "$VOLUME_NAME:/data" alpine mkdir -p /data/praises
            
            # Copiar arquivos usando tar (mais eficiente)
            echo -e "   Copiando de: ${SOURCE_PATH}"
            echo -e "   Para volume: ${VOLUME_NAME}:${TARGET_PATH}"
            
            # Usar tar para copiar preservando estrutura e permissões
            (cd "$SOURCE_PATH" && tar -czf - .) | \
                docker run --rm -i -v "$VOLUME_NAME:/data" alpine sh -c "cd /data/praises && tar -xzf -"
            
            # Verificar se a cópia foi bem-sucedida
            NEW_COUNT=$(docker run --rm -v "$VOLUME_NAME:/data" alpine sh -c "ls -1 /data/praises 2>/dev/null | wc -l" 2>/dev/null || echo "0")
            if [ "$NEW_COUNT" -gt "0" ]; then
                echo -e "${GREEN}✅ Arquivos copiados para o volume Docker (${NEW_COUNT} pastas)${NC}"
            else
                echo -e "${RED}❌ Erro: Nenhum arquivo foi copiado${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}[DRY RUN] Copiaria ${PRAISE_COUNT} pastas para o volume Docker${NC}"
        fi
    else
        echo -e "${GREEN}✅ Arquivos já estão no volume Docker (${VOLUME_PRAISE_COUNT} praises)${NC}"
    fi
else
    # Usando bind mount - verificar se os arquivos já estão no caminho correto
    TARGET_PRAISES_PATH="$STORAGE_MOUNT_PATH/praises"
    
    # Verificar se o caminho fonte é o mesmo que o destino (já está no lugar certo)
    if [ "$SOURCE_PATH" = "$TARGET_PRAISES_PATH" ]; then
        echo -e "${GREEN}✅ Arquivos já estão no local correto (bind mount)${NC}"
        echo -e "   Caminho: ${SOURCE_PATH}"
    else
        # Verificar se o diretório existe
        if [ ! -d "$TARGET_PRAISES_PATH" ]; then
            echo -e "${YELLOW}⚠️  Diretório de praises não encontrado no bind mount${NC}"
            echo -e "   Criando: ${TARGET_PRAISES_PATH}"
            if [ "$DRY_RUN" = false ]; then
                mkdir -p "$TARGET_PRAISES_PATH"
            fi
        fi
        
        TARGET_COUNT=$(find "$TARGET_PRAISES_PATH" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ' || echo "0")
        
        if [ "$TARGET_COUNT" -eq "0" ] || [ "$TARGET_COUNT" != "$PRAISE_COUNT" ]; then
            if [ "$DRY_RUN" = false ]; then
                echo -e "${YELLOW}📁 Copiando arquivos para bind mount...${NC}"
                echo -e "   De: ${SOURCE_PATH}"
                echo -e "   Para: ${TARGET_PRAISES_PATH}"
                echo -e "   Isso pode levar alguns minutos (${PRAISE_COUNT} pastas)..."
                
                # Usar rsync se disponível (mais eficiente), senão usar cp
                if command -v rsync > /dev/null 2>&1; then
                    rsync -av --progress "$SOURCE_PATH/" "$TARGET_PRAISES_PATH/"
                else
                    cp -r "$SOURCE_PATH"/* "$TARGET_PRAISES_PATH/"
                fi
                
                # Verificar se a cópia foi bem-sucedida
                NEW_COUNT=$(find "$TARGET_PRAISES_PATH" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
                if [ "$NEW_COUNT" -gt "0" ]; then
                    echo -e "${GREEN}✅ Arquivos copiados para bind mount (${NEW_COUNT} pastas)${NC}"
                else
                    echo -e "${RED}❌ Erro: Nenhum arquivo foi copiado${NC}"
                    exit 1
                fi
            else
                echo -e "${YELLOW}[DRY RUN] Copiaria ${PRAISE_COUNT} pastas para bind mount${NC}"
            fi
        else
            echo -e "${GREEN}✅ Arquivos já estão no bind mount (${TARGET_COUNT} praises)${NC}"
        fi
    fi
fi

echo ""

# Executar script de importação Python
echo -e "${BLUE}🔄 Executando importação no banco de dados...${NC}"

# Construir comando Python
PYTHON_CMD="python scripts/import_colDigOS.py --colDigOS-path /storage/assets"

if [ "$DRY_RUN" = true ]; then
    PYTHON_CMD="$PYTHON_CMD --dry-run"
fi

if [ -n "$LIMIT" ]; then
    PYTHON_CMD="$PYTHON_CMD --limit $LIMIT"
fi

# Executar dentro do container do backend
echo -e "${YELLOW}Executando: ${PYTHON_CMD}${NC}"
echo ""

$COMPOSE_CMD exec -T backend sh -c "cd /app && $PYTHON_CMD"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✨ Importação concluída com sucesso!${NC}"
else
    echo ""
    echo -e "${RED}❌ Erro durante a importação${NC}"
    exit $EXIT_CODE
fi
