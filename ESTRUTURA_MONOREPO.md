# 📁 Estrutura de Monorepo - Backend + Frontend

Este documento explica como organizar o projeto com backend e frontend no mesmo repositório.

## ✅ Vantagens do Monorepo

1. **Código Compartilhado**: Tipos TypeScript, utilitários, constantes
2. **Sincronização**: Mudanças na API refletem no frontend imediatamente
3. **Git Simplificado**: Um único repositório, commits relacionados ficam juntos
4. **Deploy Coordenado**: Fácil garantir versões compatíveis
5. **Documentação Unificada**: Tudo em um lugar

## 📂 Estrutura Recomendada

```
app/
├── backend/                 # FastAPI Backend
│   ├── app/
│   ├── scripts/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env
│
├── frontend/                # React/Next.js Frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── .env.local
│
├── shared/                  # Código compartilhado (opcional)
│   ├── types/              # TypeScript types compartilhados
│   │   ├── praise.ts
│   │   ├── material.ts
│   │   └── index.ts
│   └── constants/          # Constantes compartilhadas
│       └── api.ts
│
├── .gitignore             # Git ignore
├── README.md              # README principal do projeto
├── ESTRUTURA_MONOREPO.md  # Este documento
└── docker-compose.yml     # Docker Compose para tudo (opcional)

# Assets ficam fora da pasta app (não versionados)
../ColDigOS/
../Avulsos*/
../Coletânea*/
```

---

## 🛠️ Configuração Passo a Passo

### 1. Criar Pasta Frontend

```bash
cd app

# React + TypeScript (Recomendado)
npx create-react-app frontend --template typescript

# OU Next.js (se preferir SSR)
npx create-next-app@latest frontend --typescript --tailwind --app

# OU Vue.js
npm create vue@latest frontend
```

### 2. Configurar .gitignore

O `.gitignore` deve estar na raiz da pasta `app/` (ou na raiz do repositório Git)

Crie/atualize `.gitignore` na raiz do projeto:

```gitignore
# Backend
backend/.env
backend/__pycache__/
backend/*.pyc
backend/.venv/
backend/venv/
backend/.pytest_cache/
backend/.mypy_cache/

# Frontend
frontend/node_modules/
frontend/.next/
frontend/.nuxt/
frontend/dist/
frontend/build/
frontend/.env.local
frontend/.env*.local

# Assets (grandes demais para git)
ColDigOS/
Avulsos*/
Coletânea*/
GLTM/
*.csv

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Docker
.env
.dockerignore
```

### 3. Criar Pasta Shared (Opcional mas Recomendado)

```bash
mkdir -p shared/types shared/constants
```

**app/shared/types/praise.ts:**
```typescript
export interface Praise {
  id: string;
  name: string;
  number?: number;
  tags: PraiseTag[];
  materials: PraiseMaterial[];
  created_at: string;
  updated_at: string;
}

export interface PraiseTag {
  id: string;
  name: string;
}

export interface PraiseMaterial {
  id: string;
  material_kind_id: string;
  path: string;
  type: 'file' | 'youtube' | 'spotify' | 'text';
  praise_id: string;
}

export interface MaterialKind {
  id: string;
  name: string;
}
```

**app/shared/constants/api.ts:**
```typescript
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
export const API_VERSION = 'v1';
export const API_ENDPOINT = `${API_BASE_URL}/api/${API_VERSION}`;
```

**app/shared/types/index.ts:**
```typescript
export * from './praise';
export * from './material';
```

### 4. Configurar Frontend para Usar Shared

No `app/frontend/package.json`, adicione:

```json
{
  "scripts": {
    "dev": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@types/react": "^18.0.0"
  }
}
```

E configure o TypeScript para usar a pasta shared:

**app/frontend/tsconfig.json:**
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "paths": {
      "@shared/*": ["../../shared/*"]
    }
  },
  "include": [
    "src",
    "../shared"
  ]
}
```

No código do frontend:

```typescript
import { Praise, PraiseMaterial } from '@shared/types';
import { API_ENDPOINT } from '@shared/constants/api';
```

---

## 🐳 Docker Compose Unificado (Opcional)

Crie um `docker-compose.yml` na raiz para subir tudo junto:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: praise_db
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-praise_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-praise_password}
      POSTGRES_DB: ${POSTGRES_DB:-praise_db}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-praise_user}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    container_name: praise_api
    ports:
      - "${API_PORT:-8000}:8000"
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-praise_user}:${POSTGRES_PASSWORD:-praise_password}@db:5432/${POSTGRES_DB:-praise_db}
      - WASABI_ACCESS_KEY=${WASABI_ACCESS_KEY}
      - WASABI_SECRET_KEY=${WASABI_SECRET_KEY}
      - WASABI_ENDPOINT=${WASABI_ENDPOINT}
      - WASABI_BUCKET=${WASABI_BUCKET}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - CORS_ORIGINS=http://localhost:3000,http://localhost:5173
    volumes:
      - ./backend:/app
    depends_on:
      db:
        condition: service_healthy
    command: sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

  frontend:
    build: ./frontend
    container_name: praise_frontend
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend
    command: npm start

volumes:
  postgres_data:
```

**Uso:**
```bash
# Subir tudo
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar tudo
docker-compose down
```

---

## 📝 README Principal na Raiz

Crie um `README.md` na raiz da pasta `app/` explicando a estrutura:

```markdown
# Praise Manager

Sistema completo para gerenciamento de praises, materiais e tags.

## 🏗️ Estrutura do Projeto

```
assets2/
├── backend/      # FastAPI Backend
├── frontend/     # React/Next.js Frontend
└── shared/       # Código compartilhado
```

## 🚀 Iniciando o Projeto

### Pré-requisitos

- Python 3.9+
- Node.js 18+
- Docker e Docker Compose (opcional)

### Backend

```bash
cd app/backend
cp env.example .env
# Editar .env com suas credenciais
pip install -r requirements.txt
docker-compose up -d db
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd app/frontend
npm install
npm start
```

### Com Docker (Tudo Junto)

```bash
docker-compose up -d
```

## 📚 Documentação

- [Backend](backend/README.md)
- [Frontend](frontend/README.md)
- [Próximos Passos](backend/PROXIMOS_PASSOS.md)
```

---

## 🔧 Variáveis de Ambiente

### Backend (app/backend/.env)
```env
DATABASE_URL=postgresql://...
WASABI_ACCESS_KEY=...
WASABI_SECRET_KEY=...
JWT_SECRET_KEY=...
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Frontend (app/frontend/.env.local)
```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

---

## 🚢 Deploy

### Desenvolvimento Local

**Backend:**
```bash
cd app/backend
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd app/frontend
npm start
```

### Produção

**Backend na VPS:**
- Deploy do `app/backend/` na VPS
- Usar Nginx como proxy reverso
- PostgreSQL na VPS ou gerenciado

**Frontend:**
- Build: `cd app/frontend && npm run build`
- Deploy no Netlify/Vercel
- OU servir via Nginx na mesma VPS
- OU container Docker

**Exemplo Nginx (mesma VPS):**
```nginx
server {
    listen 80;
    server_name seudominio.com;
    
    # Frontend (React build)
    location / {
        root /var/www/app/frontend/build;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📦 Gerenciamento de Pacotes

### Python (Backend)
```bash
cd app/backend
pip install -r requirements.txt
```

### Node.js (Frontend)
```bash
cd app/frontend
npm install
# ou
yarn install
# ou
pnpm install
```

---

## ✅ Checklist de Configuração

- [ ] Criar pasta `app/frontend/`
- [ ] Configurar `.gitignore` na raiz do repositório
- [ ] Criar pasta `app/shared/` (opcional)
- [ ] Configurar TypeScript para usar `shared/`
- [ ] Criar `app/README.md` na raiz
- [ ] Configurar variáveis de ambiente (backend e frontend)
- [ ] Testar backend localmente
- [ ] Testar frontend localmente
- [ ] Testar integração entre frontend e backend
- [ ] Configurar CORS no backend para aceitar frontend

---

## 💡 Dicas

1. **Commits Separados**: Mesmo no monorepo, faça commits separados para backend e frontend quando as mudanças são independentes
2. **Branch Strategy**: Use branches por feature que podem tocar ambos backend e frontend
3. **CI/CD**: Configure pipelines que testem e façam build de ambos
4. **Shared Types**: Mantenha os tipos sincronizados entre backend (Pydantic) e frontend (TypeScript)

---

## 🔄 Alternativa: Repositórios Separados

Se preferir separar (não recomendado neste caso):

**Vantagens:**
- Deploys independentes
- Permissões diferentes por time
- Menor histórico Git

**Desvantagens:**
- Código compartilhado mais difícil
- Sincronização de versões manual
- Mais complexo de gerenciar

**Quando usar:**
- Times completamente separados
- Deploys muito independentes
- Projetos com ciclos diferentes

---

Para este projeto, **recomendo fortemente o monorepo** pela facilidade de sincronização e manutenção! 🎯
