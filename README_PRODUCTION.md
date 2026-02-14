# Guia de Produção Beta - Storage Local

Este guia documenta como preparar, fazer backup e restaurar o sistema para produção beta usando storage local.

## Visão Geral

Durante a fase beta, o sistema utiliza:
- **Storage Local**: Arquivos armazenados em volume Docker nomeado
- **PostgreSQL**: Banco de dados em volume Docker nomeado
- **Modo Local**: Sem uso do Wasabi (será reativado após beta)

## Configuração Inicial

### 1. Variáveis de Ambiente

Configure o arquivo `.env` com as seguintes variáveis:

```env
# Deployment
DEPLOYMENT_ENV=local  # ou 'vps' quando em produção
DEPLOYMENT_HOST=192.168.1.100  # IP local ou URI do VPS

# Storage (forçar local)
STORAGE_MODE=local
STORAGE_LOCAL_PATH=/storage/assets  # Caminho dentro do container
```

### 2. Volumes Docker

O sistema utiliza dois volumes nomeados:
- `postgres_data`: Dados do PostgreSQL
- `storage_assets`: Arquivos de storage (PDFs, áudios, etc.)

Estes volumes são criados automaticamente pelo `docker-compose.yml`.

## Backup

### Backup do Banco de Dados

Para fazer backup do banco de dados:

```bash
./scripts/backup-db.sh [nome-opcional]
```

O backup será salvo em `./backups/praise_db_backup_TIMESTAMP.sql.gz`

**Exemplo:**
```bash
./scripts/backup-db.sh backup_pre_deploy
# Cria: ./backups/backup_pre_deploy.sql.gz
```

### Backup do Storage

Para fazer backup do volume de storage:

```bash
./scripts/backup-storage.sh [nome-opcional]
```

O backup será salvo em `./backups/storage_backup_TIMESTAMP.tar.gz`

**Exemplo:**
```bash
./scripts/backup-storage.sh storage_pre_deploy
# Cria: ./backups/storage_pre_deploy.tar.gz
```

### Backup Completo

Para fazer backup completo (banco + storage):

```bash
# Criar diretório de backups com timestamp
BACKUP_DIR="backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup do banco
./scripts/backup-db.sh "$BACKUP_DIR/db_backup"

# Backup do storage
./scripts/backup-storage.sh "$BACKUP_DIR/storage_backup"

echo "Backup completo salvo em: $BACKUP_DIR"
```

## Restauração

### Restaurar Banco de Dados

⚠️ **ATENÇÃO**: Esta operação substitui todos os dados do banco!

```bash
./scripts/restore-db.sh <arquivo-backup.sql[.gz]>
```

**Exemplo:**
```bash
./scripts/restore-db.sh backups/praise_db_backup_20250209_120000.sql.gz
```

### Restaurar Storage

⚠️ **ATENÇÃO**: Esta operação substitui todos os arquivos do storage!

```bash
./scripts/restore-storage.sh <arquivo-backup.tar.gz>
```

**Exemplo:**
```bash
./scripts/restore-storage.sh backups/storage_backup_20250209_120000.tar.gz
```

## Deploy para VPS

### Passo 1: Backup Local

No ambiente local, faça backup completo:

```bash
# Criar backup completo
BACKUP_DIR="backups/deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

./scripts/backup-db.sh "$BACKUP_DIR/db_backup"
./scripts/backup-storage.sh "$BACKUP_DIR/storage_backup"

# Comprimir tudo em um único arquivo
tar czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
```

### Passo 2: Transferir para VPS

Copie os arquivos de backup para o VPS:

```bash
# Via SCP
scp backups/deploy_*.tar.gz user@vps:/path/to/backups/

# Ou via rsync
rsync -avz backups/deploy_*.tar.gz user@vps:/path/to/backups/
```

### Passo 3: Configurar VPS

No VPS, configure o `.env`:

```env
DEPLOYMENT_ENV=vps
DEPLOYMENT_HOST=api.exemplo.com  # ou IP do VPS

STORAGE_MODE=local
STORAGE_LOCAL_PATH=/storage/assets
```

### Passo 4: Subir Serviços no VPS

```bash
# Subir serviços
docker-compose up -d

# Aguardar serviços iniciarem
docker-compose ps
```

### Passo 5: Restaurar Dados no VPS

```bash
# Extrair backup
tar xzf deploy_TIMESTAMP.tar.gz
cd deploy_TIMESTAMP

# Restaurar banco
../scripts/restore-db.sh db_backup.sql.gz

# Restaurar storage
../scripts/restore-storage.sh storage_backup.tar.gz
```

## Estrutura de Arquivos

```
coldigom/
├── backups/                    # Diretório de backups
│   ├── praise_db_backup_*.sql.gz
│   └── storage_backup_*.tar.gz
├── scripts/
│   ├── backup-db.sh           # Script de backup do banco
│   ├── backup-storage.sh      # Script de backup do storage
│   ├── restore-db.sh          # Script de restauração do banco
│   └── restore-storage.sh     # Script de restauração do storage
├── docker-compose.yml         # Configuração Docker
└── .env                       # Variáveis de ambiente
```

## Volumes Docker

### Listar Volumes

```bash
docker volume ls | grep coldigom
```

### Inspecionar Volume

```bash
docker volume inspect coldigom_storage_assets
docker volume inspect coldigom_postgres_data
```

### Remover Volumes (⚠️ CUIDADO!)

```bash
# Parar serviços primeiro
docker-compose down

# Remover volumes (apaga todos os dados!)
docker volume rm coldigom_storage_assets coldigom_postgres_data
```

## Troubleshooting

### Erro: Container não está rodando

```bash
# Verificar status
docker-compose ps

# Subir serviços
docker-compose up -d
```

### Erro: Volume não encontrado

```bash
# Verificar volumes
docker volume ls

# Criar volume manualmente se necessário
docker volume create coldigom_storage_assets
```

### Erro: Permissão negada nos scripts

```bash
# Tornar scripts executáveis
chmod +x scripts/*.sh
```

### Verificar Tamanho dos Backups

```bash
# Listar backups com tamanho
ls -lh backups/
```

## Importação de Arquivos

### Importar Todos os Praises do Storage Local

Para importar todos os arquivos de `storage/praises` para o banco de dados e volume Docker:

```bash
# Modo dry-run (teste sem fazer alterações)
./scripts/import-all-praises.sh --dry-run

# Importação completa (todos os praises)
./scripts/import-all-praises.sh

# Importação limitada (teste com N praises)
./scripts/import-all-praises.sh --limit 10

# Especificar caminho fonte diferente
./scripts/import-all-praises.sh --source-path /caminho/para/praises
```

**O que o script faz:**

1. Verifica se os arquivos estão no volume Docker
2. Copia os arquivos do storage local para o volume Docker (se necessário)
3. Executa o script Python de importação que:
   - Lê `metadata.yml` de cada pasta de praise
   - Cria/atualiza registros no banco de dados
   - Associa materiais (PDFs, áudios) aos praises
   - Associa tags aos praises

**Notas importantes:**

- ⚠️ O script processa **todos** os praises encontrados (use `--limit` para testes)
- 📦 A cópia de arquivos pode levar vários minutos dependendo da quantidade
- 💾 O script faz commits periódicos a cada 10 praises
- 🔍 Use `--dry-run` primeiro para ver o que seria importado

**Exemplo de uso:**

```bash
# 1. Teste com 5 praises primeiro
./scripts/import-all-praises.sh --dry-run --limit 5

# 2. Se tudo estiver OK, importar todos
./scripts/import-all-praises.sh
```

## Próximos Passos (Pós-Beta)

Após a fase beta, quando o Wasabi for reativado:

1. Atualizar `STORAGE_MODE=wasabi` no `.env`
2. Configurar credenciais do Wasabi
3. Migrar arquivos do storage local para Wasabi
4. Atualizar `storage_factory.py` para reativar suporte ao Wasabi

## Notas Importantes

- ⚠️ **Sempre faça backup antes de restaurar**
- ⚠️ **Restauração substitui dados existentes**
- 📦 **Backups são comprimidos automaticamente**
- 🔒 **Mantenha backups em local seguro**
- 📅 **Faça backups regulares**

## Comandos Úteis

```bash
# Ver logs do banco
docker-compose logs -f db

# Ver logs do backend
docker-compose logs -f backend

# Acessar banco via psql
docker-compose exec db psql -U praise_user -d praise_db

# Ver espaço usado pelos volumes
docker system df -v

# Limpar backups antigos (manter últimos 7 dias)
find backups/ -type f -mtime +7 -delete
```
