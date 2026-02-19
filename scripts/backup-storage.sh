#!/bin/bash

# Script para fazer backup do volume de storage Docker
# Suporta volume Docker nomeado e bind mount (usado em prod)
# Uso: ./scripts/backup-storage.sh [nome-do-backup] [--env prod|dev|local]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variáveis
ENV=""
BACKUP_NAME=""

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
        *)
            if [ -z "$BACKUP_NAME" ] && [[ "$1" != --* ]]; then
                BACKUP_NAME="$1"
                shift
            else
                echo -e "${RED}❌ Argumento desconhecido: $1${NC}"
                exit 1
            fi
            ;;
    esac
done

# Diretório de backups
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${BACKUP_NAME:-storage_backup_${TIMESTAMP}}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

# Detectar ambiente e container
PROJECT_NAME=$(basename "$(pwd)")
VOLUME_NAME="${PROJECT_NAME}_storage_assets"

if [ -z "$ENV" ]; then
    # Detecção automática
    if docker ps 2>/dev/null | grep -q "praise_api_prod"; then
        ENV="prod"
        BACKEND_CONTAINER="praise_api_prod"
    elif docker ps 2>/dev/null | grep -q "praise_api_dev"; then
        ENV="dev"
        BACKEND_CONTAINER="praise_api_dev"
    else
        ENV="local"
        BACKEND_CONTAINER="praise_api_dev"
    fi
    echo -e "${CYAN}🔍 Ambiente detectado: $(echo "$ENV" | tr '[:lower:]' '[:upper:]')${NC}"
else
    case "$ENV" in
        prod)
            BACKEND_CONTAINER="praise_api_prod"
            ;;
        dev|local)
            BACKEND_CONTAINER="praise_api_dev"
            ;;
    esac
    echo -e "${CYAN}📋 Ambiente: $(echo "$ENV" | tr '[:lower:]' '[:upper:]') (container: ${BACKEND_CONTAINER})${NC}"
fi

# Verificar se Docker está disponível
if ! command -v docker > /dev/null 2>&1 || ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}❌ Erro: Docker não está disponível ou não está rodando${NC}"
    exit 1
fi

# Verificar se está usando volume nomeado ou bind mount
USING_VOLUME=false
STORAGE_MOUNT_PATH=""

if docker volume ls 2>/dev/null | grep -q "$VOLUME_NAME"; then
    USING_VOLUME=true
elif FOUND_VOLUME=$(docker volume ls --format "{{.Name}}" 2>/dev/null | grep "storage_assets$" | head -1); [ -n "$FOUND_VOLUME" ]; then
    VOLUME_NAME="$FOUND_VOLUME"
    USING_VOLUME=true
    echo -e "${YELLOW}⚠️  Usando volume encontrado: $VOLUME_NAME${NC}"
fi

if [ "$USING_VOLUME" = false ]; then
    # Verificar bind mount no container do backend
    if docker ps 2>/dev/null | grep -q "$BACKEND_CONTAINER"; then
        STORAGE_MOUNT_PATH=$(docker inspect "$BACKEND_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/storage/assets"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || echo "")
    fi

    if [ -z "$STORAGE_MOUNT_PATH" ] || [ ! -d "$STORAGE_MOUNT_PATH" ]; then
        echo -e "${RED}❌ Erro: Storage não encontrado${NC}"
        echo "   - Volume Docker 'storage_assets' não existe"
        echo "   - Container '$BACKEND_CONTAINER' não está rodando ou não tem bind mount em /storage/assets"
        echo ""
        echo "   Use --env prod se estiver fazendo backup de produção no VPS"
        exit 1
    fi
fi

echo -e "${GREEN}📁 Iniciando backup do storage...${NC}"

if [ "$USING_VOLUME" = true ]; then
    echo -e "   Tipo: Volume Docker (${VOLUME_NAME})"
    echo -e "${YELLOW}📦 Criando backup via container temporário...${NC}"

    docker run --rm \
        -v "$VOLUME_NAME:/data" \
        -v "$(pwd)/$BACKUP_DIR:/backup" \
        alpine tar czf "/backup/${BACKUP_NAME}.tar.gz" -C /data .
else
    echo -e "   Tipo: Bind mount (${STORAGE_MOUNT_PATH})"
    echo -e "${YELLOW}📦 Criando backup...${NC}"

    tar czf "$BACKUP_FILE" -C "$STORAGE_MOUNT_PATH" .
fi

# Verificar se o backup foi criado com sucesso
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup criado com sucesso!${NC}"
    echo -e "   Arquivo: ${BACKUP_FILE}"
    echo -e "   Tamanho: ${BACKUP_SIZE}"
else
    echo -e "${RED}❌ Erro: Falha ao criar backup${NC}"
    exit 1
fi

echo -e "${GREEN}✨ Backup concluído!${NC}"
