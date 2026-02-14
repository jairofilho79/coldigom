#!/bin/bash

# Script para restaurar backup do banco de dados PostgreSQL
# Uso: ./scripts/restore-db.sh <arquivo-backup.sql[.gz]>

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se o arquivo foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Arquivo de backup não especificado${NC}"
    echo "   Uso: ./scripts/restore-db.sh <arquivo-backup.sql[.gz]>"
    exit 1
fi

BACKUP_FILE="$1"

# Verificar se o arquivo existe
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Erro: Arquivo '$BACKUP_FILE' não encontrado${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️  ATENÇÃO: Esta operação irá substituir todos os dados do banco!${NC}"
read -p "   Deseja continuar? (sim/não): " CONFIRM

if [ "$CONFIRM" != "sim" ] && [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "y" ]; then
    echo -e "${YELLOW}Operação cancelada${NC}"
    exit 0
fi

# Verificar se o container está rodando
if ! docker ps | grep -q praise_db; then
    echo -e "${RED}❌ Erro: Container 'praise_db' não está rodando${NC}"
    echo "   Execute: docker-compose up -d db"
    exit 1
fi

echo -e "${GREEN}🗄️  Iniciando restauração do banco de dados...${NC}"

# Verificar se é arquivo comprimido
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "${YELLOW}📦 Descomprimindo backup...${NC}"
    TEMP_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    BACKUP_FILE="$TEMP_FILE"
    CLEANUP_TEMP=true
else
    CLEANUP_TEMP=false
fi

# Restaurar backup
echo -e "${YELLOW}📥 Restaurando dados...${NC}"
docker-compose exec -T db psql -U praise_user -d praise_db < "$BACKUP_FILE"

# Limpar arquivo temporário se necessário
if [ "$CLEANUP_TEMP" = true ]; then
    rm -f "$TEMP_FILE"
fi

echo -e "${GREEN}✅ Restauração concluída com sucesso!${NC}"
