#!/bin/bash

# Script para fazer backup do banco de dados PostgreSQL
# Uso: ./scripts/backup-db.sh [nome-do-backup]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Diretório de backups
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-praise_db_backup_${TIMESTAMP}}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql"

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}🗄️  Iniciando backup do banco de dados...${NC}"

# Verificar se o container está rodando
if ! docker ps | grep -q praise_db; then
    echo -e "${RED}❌ Erro: Container 'praise_db' não está rodando${NC}"
    echo "   Execute: docker-compose up -d db"
    exit 1
fi

# Fazer backup usando pg_dump
echo -e "${YELLOW}📦 Fazendo dump do banco de dados...${NC}"
docker-compose exec -T db pg_dump -U praise_user praise_db > "$BACKUP_FILE"

# Verificar se o backup foi criado com sucesso
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup criado com sucesso!${NC}"
    echo -e "   Arquivo: ${BACKUP_FILE}"
    echo -e "   Tamanho: ${BACKUP_SIZE}"
    
    # Comprimir o backup (opcional)
    echo -e "${YELLOW}📦 Comprimindo backup...${NC}"
    gzip -f "$BACKUP_FILE"
    COMPRESSED_FILE="${BACKUP_FILE}.gz"
    COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup comprimido!${NC}"
    echo -e "   Arquivo: ${COMPRESSED_FILE}"
    echo -e "   Tamanho: ${COMPRESSED_SIZE}"
else
    echo -e "${RED}❌ Erro: Falha ao criar backup${NC}"
    exit 1
fi

echo -e "${GREEN}✨ Backup concluído!${NC}"
