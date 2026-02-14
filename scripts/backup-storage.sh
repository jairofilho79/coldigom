#!/bin/bash

# Script para fazer backup do volume de storage Docker
# Uso: ./scripts/backup-storage.sh [nome-do-backup]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Diretório de backups
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-storage_backup_${TIMESTAMP}}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Detectar nome do volume Docker (prefixo do projeto + storage_assets)
# O Docker Compose cria volumes com o prefixo do nome do diretório
PROJECT_NAME=$(basename "$(pwd)")
VOLUME_NAME="${PROJECT_NAME}_storage_assets"

# Tentar encontrar o volume se o nome padrão não funcionar
if ! docker volume ls | grep -q "$VOLUME_NAME"; then
    # Tentar encontrar volume que termina com storage_assets
    VOLUME_NAME=$(docker volume ls --format "{{.Name}}" | grep "storage_assets$" | head -1)
    if [ -z "$VOLUME_NAME" ]; then
        echo -e "${RED}❌ Erro: Volume de storage não encontrado${NC}"
        echo "   Volumes disponíveis:"
        docker volume ls
        echo ""
        echo "   Verifique se o docker-compose está configurado corretamente"
        exit 1
    fi
    echo -e "${YELLOW}⚠️  Usando volume encontrado: $VOLUME_NAME${NC}"
fi

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}📁 Iniciando backup do volume de storage...${NC}"
echo -e "   Volume: ${VOLUME_NAME}"

# Criar container temporário para fazer backup
TEMP_CONTAINER="backup_storage_${TIMESTAMP}"

echo -e "${YELLOW}📦 Criando container temporário para backup...${NC}"

# Criar container temporário com o volume montado
docker run --rm \
    -v "$VOLUME_NAME:/data" \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/${BACKUP_NAME}.tar.gz" -C /data .

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
