#!/bin/bash

# Script para criar as redes Docker compartilhadas necessárias
# Execute este script antes de subir os containers pela primeira vez

echo "Criando redes Docker compartilhadas..."

# Criar rede para ambiente dev
if docker network ls | grep -q "coldigom-coletanea-dev-network"; then
    echo "Rede 'coldigom-coletanea-dev-network' já existe."
else
    docker network create coldigom-coletanea-dev-network
    echo "Rede 'coldigom-coletanea-dev-network' criada com sucesso."
fi

# Criar rede para ambiente prod
if docker network ls | grep -q "coldigom-coletanea-prod-network"; then
    echo "Rede 'coldigom-coletanea-prod-network' já existe."
else
    docker network create coldigom-coletanea-prod-network
    echo "Rede 'coldigom-coletanea-prod-network' criada com sucesso."
fi

echo ""
echo "Redes Docker criadas com sucesso!"
echo ""
echo "Para usar:"
echo "  Dev:   docker-compose -f docker-compose.dev.yml up -d"
echo "  Prod:  docker-compose -f docker-compose.prod.yml up -d"
