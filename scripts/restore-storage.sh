#!/bin/bash

# Script para restaurar backup do volume de storage Docker
# Uso: ./scripts/restore-storage.sh <arquivo-backup.tar.gz>

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se o arquivo foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Arquivo de backup não especificado${NC}"
    echo "   Uso: ./scripts/restore-storage.sh <arquivo-backup.tar.gz>"
    exit 1
fi

BACKUP_FILE="$1"

# Verificar se o arquivo existe
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Erro: Arquivo '$BACKUP_FILE' não encontrado${NC}"
    exit 1
fi

# Detectar nome do volume Docker (prefixo do projeto + storage_assets)
PROJECT_NAME=$(basename "$(pwd)")
VOLUME_NAME="${PROJECT_NAME}_storage_assets"

# Tentar encontrar o volume se o nome padrão não funcionar
if ! docker volume ls | grep -q "$VOLUME_NAME"; then
    # Tentar encontrar volume que termina com storage_assets
    FOUND_VOLUME=$(docker volume ls --format "{{.Name}}" | grep "storage_assets$" | head -1)
    if [ -n "$FOUND_VOLUME" ]; then
        VOLUME_NAME="$FOUND_VOLUME"
        echo -e "${YELLOW}⚠️  Usando volume encontrado: $VOLUME_NAME${NC}"
    fi
fi

echo -e "${YELLOW}⚠️  ATENÇÃO: Esta operação irá substituir todos os arquivos do storage!${NC}"
read -p "   Deseja continuar? (sim/não): " CONFIRM

if [ "$CONFIRM" != "sim" ] && [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "y" ]; then
    echo -e "${YELLOW}Operação cancelada${NC}"
    exit 0
fi

echo -e "${GREEN}📁 Iniciando restauração do volume de storage...${NC}"
echo -e "   Volume: ${VOLUME_NAME}"

# Verificar se o volume existe, criar se não existir
if ! docker volume ls | grep -q "$VOLUME_NAME"; then
    echo -e "${YELLOW}📦 Criando volume '$VOLUME_NAME'...${NC}"
    docker volume create "$VOLUME_NAME"
fi

# Criar container temporário para restaurar backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEMP_CONTAINER="restore_storage_${TIMESTAMP}"

echo -e "${YELLOW}📦 Restaurando dados...${NC}"

# Criar container temporário com o volume montado e restaurar
docker run --rm \
    -v "$VOLUME_NAME:/data" \
    -v "$(pwd)/$(dirname "$BACKUP_FILE"):/backup" \
    alpine sh -c "cd /data && rm -rf * && tar xzf /backup/$(basename "$BACKUP_FILE")"

echo -e "${GREEN}✅ Restauração concluída com sucesso!${NC}"
