#!/bin/bash

# Script utilitário para gerar JWT e DB passwords fortes automaticamente
# Uso: ./scripts/generate_secrets.sh

echo "Gerando chaves seguras para o ambiente de Produção..."

# Gera strings hex de 32 e 64 caracteres
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)

echo ""
echo "========================================================="
echo " SUAS CREDENCIAIS FORAM GERADAS COM SUCESSO"
echo "========================================================="
echo ""
echo "POSTGRES_PASSWORD=$DB_PASS"
echo "JWT_SECRET_KEY=$JWT_SECRET"
echo ""
echo "Instruções:"
echo "1. Copie o arquivo .env.prod para a VPS"
echo "2. Cole as credenciais acima nos campos correspondentes do arquivo .env.prod"
echo "3. Preencha a variável CORS_ORIGINS com o domínio de produção."
echo ""
echo "ATENÇÃO: Guarde estas credenciais em um lugar seguro. Se o JWT_SECRET mudar, todos os usuários serão deslogados."
