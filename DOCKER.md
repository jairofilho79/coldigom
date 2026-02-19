# Docker - Coldigom

Este projeto possui configurações Docker separadas para ambientes de desenvolvimento e produção.

## Setup Inicial

### 1. Criar Redes Docker Compartilhadas

Execute o script para criar as redes necessárias:

```bash
./setup-docker-networks.sh
```

Ou manualmente:

```bash
docker network create coldigom-coletanea-dev-network
docker network create coldigom-coletanea-prod-network
```

## Desenvolvimento

### Subir Ambiente Dev

**Importante:** Suba primeiro o coletanea-digital dev, depois o coldigom dev.

```bash
# 1. No coletanea-digital
cd /Users/jairofilho79/DEV/coletanea-digital
docker-compose -f docker-compose.dev.yml up -d

# 2. No coldigom
cd /Volumes/SSD\ 2TB\ SD/dev/coldigom
docker-compose -f docker-compose.dev.yml up -d
```

### Características do Ambiente Dev

- Hot-reload habilitado no backend (`--reload`)
- Volumes montados para código fonte (alterações refletem imediatamente)
- Frontend com Vite dev server na porta 5173
- Rede compartilhada: `coldigom-coletanea-dev-network`
- Comunicação com coletanea-dev via `coletanea_api_dev:8001`

### Containers Dev

- `praise_db_dev` - PostgreSQL
- `praise_api_dev` - Backend API
- `praise_frontend_dev` - Frontend (Vite dev server)

## Produção

### Subir Ambiente Prod

**Importante:** Suba primeiro o coletanea-digital prod, depois o coldigom prod.

```bash
# 1. No coletanea-digital
cd /Users/jairofilho79/DEV/coletanea-digital
docker-compose -f docker-compose.prod.yml up -d

# 2. No coldigom
cd /Volumes/SSD\ 2TB\ SD/dev/coldigom
docker-compose -f docker-compose.prod.yml up -d
```

### Características do Ambiente Prod

- Sem hot-reload (otimizado para produção)
- Código copiado na imagem (sem volumes de código)
- Frontend buildado e servido via nginx na porta 80 (mapeado para 3000)
- Rede compartilhada: `coldigom-coletanea-prod-network`
- Comunicação com coletanea-prod via `coletanea_api_prod:8001`
- Health checks configurados
- Restart policies adequadas

### Containers Prod

- `praise_db_prod` - PostgreSQL
- `praise_api_prod` - Backend API
- `praise_frontend_prod` - Frontend (nginx)

## Variáveis de Ambiente

### Dev

Use `.env.dev` ou `.env` com valores de desenvolvimento.

### Prod

Use `.env.prod` com valores de produção.

## Isolamento de Ambientes

- **Dev** e **Prod** são completamente isolados
- Cada ambiente usa sua própria rede Docker
- Dev não se comunica com Prod e vice-versa
- Cada ambiente tem seus próprios volumes de banco de dados

## Comunicação entre Serviços

O coldigom se comunica com o coletanea-digital através da variável de ambiente `COLETANEA_API_URL`:

- **Dev**: `http://coletanea_api_dev:8001`
- **Prod**: `http://coletanea_api_prod:8001`

## Comandos Úteis

```bash
# Ver logs
docker-compose -f docker-compose.dev.yml logs -f
docker-compose -f docker-compose.prod.yml logs -f

# Parar containers
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.prod.yml down

# Rebuild
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.prod.yml build --no-cache
```
