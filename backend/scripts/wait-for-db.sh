#!/bin/sh
# Aguarda o PostgreSQL ficar pronto antes de iniciar a API.
# Necessário quando containers reiniciam em paralelo (ex: Docker Desktop após reboot).

set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-praise_user}"
MAX_RETRIES=60
RETRY_INTERVAL=2

echo "⏳ Aguardando PostgreSQL em ${DB_HOST}:${DB_PORT}..."

for i in $(seq 1 $MAX_RETRIES); do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    echo "✅ PostgreSQL está pronto!"
    exit 0
  fi
  echo "   Tentativa $i/$MAX_RETRIES - PostgreSQL ainda não está pronto, aguardando ${RETRY_INTERVAL}s..."
  sleep $RETRY_INTERVAL
done

echo "❌ Timeout: PostgreSQL não ficou pronto em $((MAX_RETRIES * RETRY_INTERVAL)) segundos"
exit 1
