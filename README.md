# Praise Manager

Sistema completo para gerenciamento de praises, materiais e tags com sincronização entre banco de dados PostgreSQL e armazenamento Wasabi.

## 🏗️ Estrutura do Projeto

```
app/
├── backend/              # FastAPI Backend
│   ├── app/             # Código da aplicação
│   ├── scripts/         # Scripts de importação e manutenção
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/            # React/Next.js Frontend (a ser criado)
│
├── shared/              # Código compartilhado (opcional)
│   ├── types/          # TypeScript types compartilhados
│   └── constants/      # Constantes compartilhadas
│
├── README.md           # Este arquivo
├── PROXIMOS_PASSOS.md  # Guia de próximos passos
└── ESTRUTURA_MONOREPO.md # Guia de estrutura monorepo
```

## 🚀 Iniciando o Projeto

### Ambientes

O projeto suporta dois ambientes:

- **dev** (Desenvolvimento): Para desenvolvimento local
- **prod** (Produção): Para produção

Scripts disponíveis:
- `./scripts/dev.sh` - Inicia ambiente de desenvolvimento
- `./scripts/prod.sh` - Inicia ambiente de produção

Consulte os arquivos `.env.dev` e `.env.prod` para configurações específicas de cada ambiente.

### Pré-requisitos

- Python 3.9+
- Node.js 18+ (para frontend)
- Docker e Docker Compose (recomendado)
- PostgreSQL 15+ (ou via Docker)
- Conta Wasabi com bucket criado

### Configuração Inicial

1. **Configurar Ambientes:**

O projeto suporta dois ambientes: **dev** (desenvolvimento) e **prod** (produção).

```bash
# Desenvolvimento
cp .env.example .env.dev
# Editar .env.dev com suas configurações locais

# Produção
cp .env.example .env.prod
# Editar .env.prod com suas configurações de produção
```

**IMPORTANTE**: Em produção, configure:
- `CORS_ORIGINS` com domínios específicos (não use `*`)
- `JWT_SECRET_KEY` com um secret forte e único
- Senhas de banco de dados fortes

2. **Iniciar Ambiente:**

```bash
# Desenvolvimento
./scripts/dev.sh

# Produção
./scripts/prod.sh

# Ou manualmente com Docker Compose:
export COMPOSE_PROFILE=dev  # ou 'prod'
docker-compose --profile $COMPOSE_PROFILE up -d
```

3. **Instalar Dependências (desenvolvimento local):**

```bash
cd app/backend
pip install -r requirements.txt
```

3. **Subir Banco de Dados:**

```bash
cd app/backend
docker-compose up -d db
```

4. **Executar Migrations:**

```bash
cd app/backend
alembic upgrade head
```

5. **Popular MaterialKinds:**

```bash
cd app/backend
python scripts/seed_material_kinds.py
```

6. **Criar Usuário Admin:**

```bash
cd app/backend
python scripts/init_db.py
```

7. **Iniciar Backend:**

```bash
cd app/backend
uvicorn app.main:app --reload
```

A API estará disponível em: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 📤 Importar Arquivos do ColDigOS

Para sincronizar arquivos locais com Wasabi e banco de dados:

```bash
cd app/backend

# Teste primeiro (dry-run)
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS" \
  --dry-run \
  --limit 5

# Importação pequena (teste)
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS" \
  --limit 10

# Importação completa
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS"
```

**Nota:** Os assets (ColDigOS) devem ficar **fora** da pasta `app/` (não versionados).

## 🎨 Frontend

Frontend React + Vite + TypeScript já implementado. Veja [`frontend/README.md`](frontend/README.md) para detalhes.

### Executar Frontend Localmente

```bash
cd frontend
npm install
npm run dev
```

O frontend estará disponível em: `http://localhost:3000`

## 📚 Documentação

- [`README_DOCKER.md`](README_DOCKER.md) - Guia completo de Docker
- [`PROXIMOS_PASSOS.md`](PROXIMOS_PASSOS.md) - Guia completo passo a passo
- [`ESTRUTURA_MONOREPO.md`](ESTRUTURA_MONOREPO.md) - Guia de estrutura monorepo
- [`backend/README.md`](backend/README.md) - Documentação do backend
- [`frontend/README.md`](frontend/README.md) - Documentação do frontend
- [`backend/scripts/README.md`](backend/scripts/README.md) - Documentação dos scripts

## 🐳 Docker Compose

O projeto suporta Docker para facilitar desenvolvimento e deploy. Veja [`README_DOCKER.md`](README_DOCKER.md) para documentação completa.

### Início Rápido com Docker

1. **Configurar variáveis de ambiente:**

```bash
cp .env.example .env
# Editar .env com suas configurações (especialmente JWT_SECRET_KEY)
```

2. **Desenvolvimento (com hot-reload):**

```bash
docker-compose -f docker-compose.dev.yml up -d
```

3. **Produção/Staging:**

```bash
docker-compose up -d --build
```

### Serviços Docker

- **PostgreSQL** (porta 5432) - Banco de dados
- **Backend API** (porta 8000) - FastAPI
- **Frontend** (porta 3000) - React + Vite (desenvolvimento) ou Nginx (produção)

### Acessos

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🛠️ Tecnologias

### Backend
- FastAPI - Framework web moderno
- PostgreSQL - Banco de dados relacional
- SQLAlchemy - ORM
- Alembic - Migrations
- Wasabi - Armazenamento de objetos (S3-compatible)
- JWT - Autenticação

### Frontend
- React 19 - Framework frontend
- Vite - Build tool e dev server
- TypeScript - Tipagem estática
- React Router - Roteamento
- TanStack Query - Gerenciamento de estado e cache
- Zustand - Estado global (autenticação)
- Axios - Cliente HTTP
- React Hook Form + Zod - Formulários e validação
- Tailwind CSS - Estilização
- Nginx - Servidor web em produção (Docker)

## 📝 Scripts Disponíveis

- `scripts/init_db.py` - Criar usuário admin
- `scripts/seed_material_kinds.py` - Popular MaterialKinds
- `scripts/import_colDigOS.py` - Importar arquivos do ColDigOS

Veja [`backend/scripts/README.md`](backend/scripts/README.md) para detalhes.

## 🔒 Segurança

⚠️ **IMPORTANTE:**
- Nunca commite arquivos `.env` no Git
- Use variáveis de ambiente em produção
- Altere a senha do admin após primeiro login
- Gere uma chave JWT forte para produção

## 🚀 Deploy

### Backend (VPS)

1. Clone o repositório na VPS
2. Configure `.env` na VPS
3. Execute migrations
4. Configure Nginx como proxy reverso
5. Configure SSL com Let's Encrypt

### Frontend

1. Build: `npm run build`
2. Deploy no Netlify/Vercel
3. OU servir via Nginx na mesma VPS

Veja [`PROXIMOS_PASSOS.md`](PROXIMOS_PASSOS.md) para detalhes completos de deploy.

## 📊 Estado Atual

✅ **Concluído:**
- Backend FastAPI estruturado
- Frontend React + Vite completo
- Integração com PostgreSQL
- Integração com Wasabi
- Sistema de autenticação JWT
- CRUD completo de Praises, Tags, Materiais e Material Kinds
- Upload de arquivos e gerenciamento de materiais
- Docker configuration para desenvolvimento e produção
- Scripts de importação
- Documentação completa

## 🤝 Contribuindo

Este é um projeto pessoal, mas sugestões e melhorias são bem-vindas!

## 📄 Licença

Projeto privado - Todos os direitos reservados

---

**Última atualização:** 2024
