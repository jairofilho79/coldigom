# 🚀 Guia de Próximos Passos - Praise Manager

Este guia te ajudará a prosseguir com o projeto passo a passo.

## 📋 Estado Atual do Projeto

✅ **Backend FastAPI** - Estruturado e pronto
- Clean Architecture implementada
- Integração com PostgreSQL configurada
- Cliente Wasabi configurado
- Endpoints REST criados
- Sistema de autenticação JWT

✅ **Assets Locais** - Organizados na pasta ColDigOS
- ~20.000 arquivos (PDFs, MP3s)
- Metadados em YAML
- Estrutura: `ColDigOS/praise/{praise_id}/`

⏳ **Pendências**
- Sincronizar arquivos locais → Wasabi → PostgreSQL
- Configurar ambiente (.env)
- Criar frontend
- Deploy na VPS

---

## 🎯 Passo 1: Configurar Ambiente Local

### 1.1. Criar arquivo `.env`

Copie o arquivo de exemplo e configure as variáveis:

```bash
cd app/backend
cp env.example .env
```

Edite o `.env` com suas credenciais:

```env
# Database (para desenvolvimento local com Docker)
POSTGRES_USER=praise_user
POSTGRES_PASSWORD=praise_password
POSTGRES_DB=praise_db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://praise_user:praise_password@localhost:5432/praise_db

# Wasabi Storage (OBRIGATÓRIO - obtenha em https://wasabi.com)
WASABI_ACCESS_KEY=sua_access_key_aqui
WASABI_SECRET_KEY=sua_secret_key_aqui
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_BUCKET=nome_do_seu_bucket
WASABI_REGION=us-east-1

# JWT Authentication
JWT_SECRET_KEY=gerar-uma-chave-secreta-aleatoria-aqui
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# API
API_PORT=8000
CORS_ORIGINS=*
```

**⚠️ IMPORTANTE:**
- Crie uma conta no Wasabi se ainda não tiver: https://wasabi.com
- Crie um bucket no Wasabi
- Gere uma chave secreta JWT forte (pode usar: `openssl rand -hex 32`)

### 1.2. Instalar Dependências

```bash
cd app/backend
pip install -r requirements.txt
```

### 1.3. Subir Banco de Dados Local (Docker)

```bash
cd app/backend
docker-compose up -d db
```

Aguarde alguns segundos para o PostgreSQL inicializar.

### 1.4. Executar Migrations

```bash
cd app/backend
alembic upgrade head
```

### 1.5. Popular MaterialKinds Iniciais

Execute o script para popular os tipos de material no banco:

```bash
cd app/backend
python scripts/seed_material_kinds.py
```

Para apenas ver o que seria criado (dry run):

```bash
cd app/backend
python scripts/seed_material_kinds.py --dry-run
```

### 1.6. Criar Usuário Admin

```bash
cd app/backend
python scripts/init_db.py
```

Isso criará um usuário admin padrão:
- **Username:** `admin`
- **Password:** `admin123`
- ⚠️ **IMPORTANTE:** Altere a senha após o primeiro login!

### 1.7. Testar Backend Localmente

```bash
cd app/backend
uvicorn app.main:app --reload
```

Acesse:
- API: http://localhost:8000
- Documentação Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 📤 Passo 2: Importar Arquivos do ColDigOS

Agora vamos sincronizar os arquivos locais com Wasabi e banco de dados.

### 2.1. Teste Pequeno (Recomendado Primeiro)

Teste com apenas algumas pastas para garantir que está funcionando:

```bash
cd app/backend
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS" \
  --dry-run \
  --limit 5
```

Isso mostrará o que seria feito sem fazer alterações.

### 2.2. Importação Real (Pequeno Lote)

Se o dry-run estiver OK, faça uma importação real com poucos itens:

```bash
cd app/backend
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS" \
  --limit 10
```

**O que o script faz:**
1. Lê cada `metadata.yml` na pasta `ColDigOS/praise/{praise_id}/`
2. Cria/atualiza o Praise no banco de dados
3. Cria/atualiza as Tags associadas
4. Faz upload dos arquivos para Wasabi
5. Cria/atualiza os PraiseMaterials no banco

### 2.3. Importação Completa

Quando estiver confiante, execute a importação completa:

```bash
cd app/backend
python scripts/import_colDigOS.py \
  --colDigOS-path "../../ColDigOS"
```

⚠️ **ATENÇÃO:**
- Isso pode levar muito tempo (20.000+ arquivos)
- Certifique-se de ter espaço no Wasabi
- O script faz commits periódicos a cada 10 praises
- Monitore os logs para erros

### 2.4. Verificar Resultados

Após a importação, verifique:
- Banco de dados: quantos praises foram importados
- Wasabi: arquivos foram enviados corretamente
- API: teste alguns endpoints para verificar os dados

---

## 🎨 Passo 3: Criar Frontend

Você mencionou que quer um frontend. **Recomendamos criar no mesmo repositório (monorepo)**.

📖 **Veja o guia completo:** [`ESTRUTURA_MONOREPO.md`](ESTRUTURA_MONOREPO.md)

### 3.1. Criar Frontend no Mesmo Repositório

```bash
# Na raiz do projeto (app/)
cd app

# React + TypeScript (Recomendado)
npx create-react-app frontend --template typescript

# OU Next.js (se preferir SSR)
npx create-next-app@latest frontend --typescript --tailwind --app

# OU Vue.js
npm create vue@latest frontend
```

**Estrutura Resultante:**
```
app/
├── backend/        # Já existe ✅
├── frontend/       # Novo ✨
├── shared/         # Código compartilhado (opcional)
├── README.md       # Documentação principal
└── ESTRUTURA_MONOREPO.md

# Assets ficam fora (não versionados)
../ColDigOS/
```

### 3.2. Instalar Dependências do Frontend

```bash
cd app/frontend
npm install axios react-router-dom @tanstack/react-query
# ou se Next.js:
npm install axios @tanstack/react-query
```

### 3.3. Configurar Variáveis de Ambiente do Frontend

Crie `app/frontend/.env.local`:

```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

### 3.4. Configurar CORS no Backend

Atualize `app/backend/.env` para aceitar o frontend:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080
```

**Funcionalidades Sugeridas para o Frontend:**
1. ✅ Login/Autenticação
2. 📋 Listar Praises (com busca e filtros)
3. 👁️ Visualizar Praise (detalhes + materiais)
4. 📤 Upload de novos arquivos
5. ✏️ Editar Praise (nome, tags, materiais)
6. 🏷️ Gerenciar Tags
7. 📁 Download de arquivos (via presigned URL)
8. 🗑️ Deletar arquivos/materiais

**API Base URL:** `http://localhost:8000/api/v1` (ou use `REACT_APP_API_URL` do .env)

**💡 Dica:** Veja [`ESTRUTURA_MONOREPO.md`](ESTRUTURA_MONOREPO.md) para:
- Configuração de pasta `shared/` com tipos TypeScript
- Docker Compose unificado
- Configuração completa do monorepo

---

## 🚀 Passo 4: Deploy na VPS

### 4.1. Preparar VPS

Certifique-se de ter:
- Ubuntu 20.04+ ou Debian 11+
- Docker e Docker Compose instalados
- Domínio configurado (opcional, mas recomendado)

### 4.2. Configurar PostgreSQL na VPS

Opção A: Usar Docker Compose na VPS
Opção B: Usar PostgreSQL gerenciado (AWS RDS, DigitalOcean, etc.)

### 4.3. Configurar Variáveis de Ambiente na VPS

Crie um `.env` na VPS com as mesmas variáveis, mas ajustando:
- `DATABASE_URL`: apontar para PostgreSQL da VPS
- `WASABI_*`: mesmas credenciais (Wasabi é cloud)
- `JWT_SECRET_KEY`: gerar nova chave para produção
- `CORS_ORIGINS`: URL do seu frontend

### 4.4. Deploy com Docker Compose

```bash
# Na VPS
git clone seu-repositorio
cd app/backend
docker-compose up -d
```

### 4.5. Configurar Nginx (Recomendado)

Crie um proxy reverso para expor a API:

```nginx
server {
    listen 80;
    server_name api.seudominio.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4.6. SSL com Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.seudominio.com
```

---

## 📝 Checklist Final

Use este checklist para acompanhar seu progresso:

### Ambiente Local
- [ ] Arquivo `.env` configurado
- [ ] Dependências instaladas
- [ ] Banco de dados rodando (Docker)
- [ ] Migrations executadas
- [ ] MaterialKinds populados
- [ ] Usuário admin criado
- [ ] Backend rodando localmente
- [ ] Testado endpoints na documentação Swagger

### Importação
- [ ] Teste dry-run executado
- [ ] Importação pequena (10-50 praises) testada
- [ ] Importação completa executada
- [ ] Verificado dados no banco
- [ ] Verificado arquivos no Wasabi
- [ ] Testado download de arquivos via API

### Frontend
- [ ] Projeto frontend criado
- [ ] Integração com API funcionando
- [ ] Autenticação implementada
- [ ] Listagem de praises
- [ ] Upload de arquivos
- [ ] Edição de praises
- [ ] Download de arquivos

### Deploy
- [ ] VPS configurada
- [ ] PostgreSQL na VPS
- [ ] Backend deployado na VPS
- [ ] Nginx configurado
- [ ] SSL configurado
- [ ] Frontend deployado (Netlify/Vercel/ou VPS)
- [ ] Testes em produção

---

## 🆘 Solução de Problemas Comuns

### Erro: "Could not connect to database"
- Verifique se o PostgreSQL está rodando: `docker-compose ps`
- Verifique se a `DATABASE_URL` está correta
- Tente reiniciar: `docker-compose restart db`

### Erro: "Access Denied" no Wasabi
- Verifique `WASABI_ACCESS_KEY` e `WASABI_SECRET_KEY`
- Verifique se o bucket existe e tem as permissões corretas
- Verifique se a região está correta

### Erro: "JWT Secret Key missing"
- Gere uma nova chave: `openssl rand -hex 32`
- Adicione ao `.env`: `JWT_SECRET_KEY=<sua-chave>`

### Importação lenta
- Normal para muitos arquivos (20k+ arquivos)
- O script faz commits a cada 10 praises
- Você pode ajustar isso no código se necessário

### Arquivos não encontrados na importação
- Verifique se o caminho `--colDigOS-path` está correto (deve apontar para `../../ColDigOS` a partir de `app/backend`)
- Verifique se os arquivos estão nomeados como `{material_id}.{ext}`
- Verifique os logs do script para ver quais arquivos não foram encontrados

---

## 📚 Recursos Úteis

- **Wasabi Docs:** https://wasabi.com/help/
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Docker Compose:** https://docs.docker.com/compose/
- **PostgreSQL:** https://www.postgresql.org/docs/

---

## 💡 Próximas Melhorias Sugeridas

1. **Processamento em Background**
   - Usar Celery ou RQ para processar uploads grandes
   - Fila de importação para não bloquear a API

2. **Cache**
   - Redis para cache de queries frequentes
   - Cache de presigned URLs

3. **Busca Avançada**
   - Elasticsearch para busca full-text
   - Filtros complexos

4. **Monitoramento**
   - Sentry para erros
   - Prometheus + Grafana para métricas

5. **Backup**
   - Backup automático do PostgreSQL
   - Versionamento de arquivos no Wasabi

---

Boa sorte com o projeto! 🎉

Se precisar de ajuda, revise este guia ou verifique os logs de erro.
