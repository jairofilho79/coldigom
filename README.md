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

### Pré-requisitos

- Python 3.9+
- Node.js 18+ (para frontend)
- Docker e Docker Compose (recomendado)
- PostgreSQL 15+ (ou via Docker)
- Conta Wasabi com bucket criado

### Configuração Inicial

1. **Configurar Backend:**

```bash
cd app/backend
cp env.example .env
# Editar .env com suas credenciais (Wasabi, PostgreSQL, JWT)
```

2. **Instalar Dependências:**

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

O frontend ainda não foi criado. Para criar:

1. **React + TypeScript (Recomendado):**

```bash
cd app
npx create-react-app frontend --template typescript
cd frontend
npm install axios react-router-dom @tanstack/react-query
```

2. **Ou Next.js:**

```bash
cd app
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend
npm install axios @tanstack/react-query
```

Veja o guia completo: [`ESTRUTURA_MONOREPO.md`](ESTRUTURA_MONOREPO.md)

## 📚 Documentação

- [`PROXIMOS_PASSOS.md`](PROXIMOS_PASSOS.md) - Guia completo passo a passo
- [`ESTRUTURA_MONOREPO.md`](ESTRUTURA_MONOREPO.md) - Guia de estrutura monorepo
- [`backend/README.md`](backend/README.md) - Documentação do backend
- [`backend/scripts/README.md`](backend/scripts/README.md) - Documentação dos scripts

## 🐳 Docker Compose

Para subir tudo com Docker:

```bash
cd app/backend
docker-compose up -d
```

Isso subirá:
- PostgreSQL (porta 5432)
- Backend API (porta 8000)

## 🛠️ Tecnologias

### Backend
- FastAPI - Framework web moderno
- PostgreSQL - Banco de dados relacional
- SQLAlchemy - ORM
- Alembic - Migrations
- Wasabi - Armazenamento de objetos (S3-compatible)
- JWT - Autenticação

### Frontend (a ser implementado)
- React/Next.js - Framework frontend
- TypeScript - Tipagem estática
- Axios - Cliente HTTP
- React Query - Gerenciamento de estado

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
- Integração com PostgreSQL
- Integração com Wasabi
- Sistema de autenticação JWT
- Scripts de importação
- Documentação completa

⏳ **Em Andamento:**
- Frontend (a ser criado)

## 🤝 Contribuindo

Este é um projeto pessoal, mas sugestões e melhorias são bem-vindas!

## 📄 Licença

Projeto privado - Todos os direitos reservados

---

**Última atualização:** 2024
