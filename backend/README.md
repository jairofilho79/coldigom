# Praise Manager API

Backend FastAPI para gerenciamento de praises, materiais e tags.

## Arquitetura

O projeto segue Clean Architecture com as seguintes camadas:

- **Domain**: Entidades e schemas (sem dependências externas)
- **Application**: Serviços de negócio e interfaces de repositório
- **Infrastructure**: Implementações concretas (banco de dados, storage, migrations)
- **API**: Camada de apresentação (endpoints REST)

## Tecnologias

- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic (migrations)
- Docker & Docker Compose
- Wasabi (S3-compatible storage)
- JWT Authentication

## Estrutura do Projeto

```
backend/
├── app/
│   ├── core/              # Configurações e dependências centrais
│   ├── domain/            # Entidades de domínio
│   │   ├── models/       # Modelos SQLAlchemy
│   │   └── schemas/      # Pydantic schemas
│   ├── application/       # Casos de uso
│   │   ├── services/     # Serviços de negócio
│   │   └── repositories/ # Interfaces de repositório
│   ├── infrastructure/   # Implementações concretas
│   │   ├── database/     # Repositórios SQLAlchemy
│   │   ├── storage/      # Cliente Wasabi
│   │   └── migrations/  # Alembic migrations
│   └── api/             # Camada de apresentação
│       └── v1/
│           └── routes/   # Endpoints REST
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Configuração

1. Copie o arquivo `env.example` para `.env` e configure as variáveis:

```bash
cp env.example .env
```

2. Configure as variáveis de ambiente:
   - `DATABASE_URL`: URL de conexão do PostgreSQL
   - `WASABI_ACCESS_KEY`: Chave de acesso do Wasabi
   - `WASABI_SECRET_KEY`: Chave secreta do Wasabi
   - `WASABI_ENDPOINT`: Endpoint do Wasabi
   - `WASABI_BUCKET`: Nome do bucket
   - `JWT_SECRET_KEY`: Chave secreta para JWT

## Executando com Docker

```bash
# Subir os containers
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar os containers
docker-compose down
```

A API estará disponível em `http://localhost:8000`

## Executando localmente

1. Instale as dependências:

```bash
pip install -r requirements.txt
```

2. Execute as migrations:

```bash
alembic upgrade head
```

3. Inicie o servidor:

```bash
uvicorn app.main:app --reload
```

## Endpoints

### Autenticação

- `POST /api/v1/auth/register` - Registrar novo usuário
- `POST /api/v1/auth/login` - Login e obter token JWT

### Praise Tags

- `GET /api/v1/praise-tags/` - Listar tags
- `GET /api/v1/praise-tags/{id}` - Obter tag por ID
- `POST /api/v1/praise-tags/` - Criar tag
- `PUT /api/v1/praise-tags/{id}` - Atualizar tag
- `DELETE /api/v1/praise-tags/{id}` - Deletar tag

### Material Kinds

- `GET /api/v1/material-kinds/` - Listar tipos de material
- `GET /api/v1/material-kinds/{id}` - Obter tipo por ID
- `POST /api/v1/material-kinds/` - Criar tipo
- `PUT /api/v1/material-kinds/{id}` - Atualizar tipo
- `DELETE /api/v1/material-kinds/{id}` - Deletar tipo

### Praise Materials

- `GET /api/v1/praise-materials/` - Listar materiais
- `GET /api/v1/praise-materials/{id}` - Obter material por ID
- `POST /api/v1/praise-materials/upload` - Upload de arquivo
- `POST /api/v1/praise-materials/` - Criar material (links, textos)
- `PUT /api/v1/praise-materials/{id}` - Atualizar material
- `DELETE /api/v1/praise-materials/{id}` - Deletar material
- `GET /api/v1/praise-materials/{id}/download-url` - Obter URL de download

### Praises

- `GET /api/v1/praises/` - Listar praises (com busca opcional)
- `GET /api/v1/praises/{id}` - Obter praise por ID
- `POST /api/v1/praises/` - Criar praise
- `PUT /api/v1/praises/{id}` - Atualizar praise
- `DELETE /api/v1/praises/{id}` - Deletar praise

## Documentação

A documentação interativa da API está disponível em:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Migrations

```bash
# Criar nova migration
alembic revision --autogenerate -m "description"

# Aplicar migrations
alembic upgrade head

# Reverter última migration
alembic downgrade -1
```

## Boas Práticas

- Clean Architecture
- SOLID principles
- DRY (Don't Repeat Yourself)
- Repository Pattern
- Service Layer Pattern
- Migrations para controle de schema






