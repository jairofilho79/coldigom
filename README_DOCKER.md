# Docker Setup - Praise Manager

Este projeto suporta Docker para facilitar o desenvolvimento e deploy.

## Estrutura Docker

O projeto possui dois arquivos docker-compose:

1. **`docker-compose.yml`** - Produção/Staging (build otimizado)
2. **`docker-compose.dev.yml`** - Desenvolvimento (hot-reload)

## Pré-requisitos

- Docker e Docker Compose instalados
- Arquivo `.env` configurado na raiz do projeto

## Configuração Inicial

1. Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

2. Edite o `.env` com suas configurações (especialmente JWT_SECRET_KEY)

## Desenvolvimento (Hot Reload)

Para desenvolvimento com hot-reload:

```bash
# Subir todos os serviços
docker-compose -f docker-compose.dev.yml up -d

# Ver logs
docker-compose -f docker-compose.dev.yml logs -f

# Parar serviços
docker-compose -f docker-compose.dev.yml down
```

### Acessos em Desenvolvimento

- **Frontend**: http://localhost:3000 (Vite dev server com hot-reload)
- **Backend API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432

## Produção/Staging

Para build de produção:

```bash
# Build e subir todos os serviços
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Parar serviços
docker-compose down
```

### Acessos em Produção

- **Frontend**: http://localhost:3000 (Nginx servindo build otimizado)
- **Backend API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432 (apenas interno, não exposto por padrão)

## Arquitetura Docker

### Frontend

- **Build Stage**: Node.js 20 Alpine - compila o projeto React
- **Production Stage**: Nginx Alpine - serve os arquivos estáticos
- **Proxy**: Nginx faz proxy de `/api` para o backend
- **Porta**: 3000 (configurável via `FRONTEND_PORT`)

### Backend

- **Base**: Python 3.11-slim
- **Porta**: 8000 (configurável via `API_PORT`)
- **Hot Reload**: Apenas no modo desenvolvimento (`docker-compose.dev.yml`)

### Banco de Dados

- **Base**: PostgreSQL 15 Alpine
- **Porta**: 5432 (configurável via `POSTGRES_PORT`)
- **Volume**: Persistência de dados via Docker volume

## Comandos Úteis

### Rebuild completo

```bash
docker-compose down -v
docker-compose up -d --build
```

### Ver logs de um serviço específico

```bash
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f db
```

### Executar comandos no container

```bash
# Backend - executar migrations manualmente
docker-compose exec backend alembic upgrade head

# Backend - criar usuário admin
docker-compose exec backend python scripts/init_db.py

# Backend - popular material kinds
docker-compose exec backend python scripts/seed_material_kinds.py

# Frontend - instalar nova dependência
docker-compose -f docker-compose.dev.yml exec frontend-dev npm install <package>

# Database - acessar PostgreSQL
docker-compose exec db psql -U praise_user -d praise_db
```

### Limpar tudo

```bash
# Parar e remover containers, volumes e imagens
docker-compose down -v --rmi all
```

## Variáveis de Ambiente

Todas as variáveis são configuradas no arquivo `.env` na raiz do projeto.

### Importantes

- `JWT_SECRET_KEY`: **OBRIGATÓRIO** - Altere em produção!
- `POSTGRES_PASSWORD`: **OBRIGATÓRIO** - Senha do PostgreSQL
- `DATABASE_URL`: Gerado automaticamente baseado em POSTGRES_*

### Frontend

- `FRONTEND_PORT`: Porta do frontend (padrão: 3000)
- `FRONTEND_API_BASE_URL`: URL base da API (vazio = relativo, usa proxy nginx)

### Backend

- `API_PORT`: Porta da API (padrão: 8000)
- `CORS_ORIGINS`: Origens permitidas no CORS

## Troubleshooting

### Frontend não carrega

1. Verifique se o build foi concluído: `docker-compose logs frontend`
2. Verifique a porta: `docker-compose ps`
3. Rebuild: `docker-compose up -d --build frontend`

### Backend não conecta ao banco

1. Verifique se o banco está saudável: `docker-compose ps db`
2. Verifique logs: `docker-compose logs db`
3. Aguarde o healthcheck completar antes de iniciar backend

### Erro 401 na API

1. Verifique se `JWT_SECRET_KEY` está configurado no `.env`
2. Verifique os logs do backend: `docker-compose logs backend`

### Porta já em uso

1. Altere a porta no `.env` (ex: `FRONTEND_PORT=3001`)
2. Ou pare o serviço que está usando a porta

## Network Docker

Todos os serviços estão na mesma rede Docker (`praise-network`), permitindo comunicação interna:

- Frontend pode acessar Backend via `http://backend:8000`
- Backend pode acessar Database via `postgresql://db:5432`

## Volumes

- `postgres_data`: Dados persistentes do PostgreSQL
- `./backend:/app`: Código do backend (modo desenvolvimento)
- `./frontend:/app`: Código do frontend (modo desenvolvimento)
- `./storage/assets:/storage/assets`: Arquivos de storage local

## Próximos Passos

1. Configure SSL/HTTPS em produção (usando Let's Encrypt com Nginx)
2. Configure backup automático do PostgreSQL
3. Configure monitoramento e logs centralizados
4. Configure CI/CD para build e deploy automático
