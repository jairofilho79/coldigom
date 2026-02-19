# Scripts de Importação e Configuração

Este diretório contém scripts auxiliares para configurar e importar dados no coldigom.

## Scripts Disponíveis

### `setup-db.sh`

Script para configurar o banco de dados com dados iniciais (seeds).

**Uso:**
```bash
./scripts/setup-db.sh [--env prod|dev|local] [--skip-material-types] [--skip-seed-data]
```

**Opções:**
- `--env ENV`: Força ambiente específico (prod|dev|local). Se não especificado, detecta automaticamente.
- `--skip-material-types`: Pula o seed de MaterialTypes
- `--skip-seed-data`: Pula a importação de dados iniciais (MaterialKinds, PraiseTags)

**Exemplos:**
```bash
# Configurar banco de produção
./scripts/setup-db.sh --env prod

# Configurar banco de desenvolvimento
./scripts/setup-db.sh --env dev

# Configurar banco local (Docker dev na máquina)
./scripts/setup-db.sh --env local
```

**O que faz:**
1. Executa seed de MaterialTypes (pdf, audio, text, youtube, spotify)
2. Importa dados iniciais de MaterialKinds e PraiseTags (se arquivos CSV estiverem disponíveis)

### `import-all-praises.sh`

Script para importar todos os arquivos de storage/praises para o banco de dados.

**Uso:**
```bash
./scripts/import-all-praises.sh [--env prod|dev|local] [--dry-run] [--source-path CAMINHO] [--limit N] [--skip-prerequisites]
```

**Opções:**
- `--env ENV`: Força ambiente específico (prod|dev|local). Se não especificado, detecta automaticamente.
- `--dry-run`: Modo de simulação (não faz alterações)
- `--source-path CAMINHO`: Caminho para pasta de praises (padrão: `/Volumes/SSD 2TB SD/storage/assets/praises`)
- `--limit N`: Limitar número de praises a processar (útil para testes)
- `--skip-prerequisites`: Pula verificação de pré-requisitos

**Exemplos:**
```bash
# Importar em produção (detecção automática)
./scripts/import-all-praises.sh --source-path "/Volumes/SSD 2TB SD/storage/assets/praises"

# Importar em produção (forçado)
./scripts/import-all-praises.sh --env prod --source-path "/Volumes/SSD 2TB SD/storage/assets/praises"

# Importar em desenvolvimento (VPS)
./scripts/import-all-praises.sh --env dev

# Importar localmente (Docker dev na máquina)
./scripts/import-all-praises.sh --env local

# Teste com dry-run (não faz alterações)
./scripts/import-all-praises.sh --env prod --dry-run --limit 5
```

**O que faz:**
1. Detecta ou usa ambiente especificado (prod/dev/local)
2. Verifica pré-requisitos (MaterialTypes)
3. Copia arquivos para o storage apropriado (se necessário)
4. Executa importação dos praises no banco de dados

### `backup-storage.sh`

Script para fazer backup do storage/assets (arquivos de praises: PDFs, áudios, metadata.yml). Suporta volume Docker e bind mount (usado em produção).

**Uso:**
```bash
./scripts/backup-storage.sh [nome-do-backup] [--env prod|dev|local]
```

**Opções:**
- `nome-do-backup`: Nome do arquivo de backup (sem extensão). Padrão: `storage_backup_TIMESTAMP`
- `--env ENV`: Ambiente (prod|dev|local). Se não especificado, detecta automaticamente.

**Exemplos:**
```bash
# Backup com nome padrão (timestamp)
./scripts/backup-storage.sh

# Backup de produção no VPS com nome mensal
./scripts/backup-storage.sh storage_prod_$(date +%Y-%m) --env prod

# Backup de desenvolvimento
./scripts/backup-storage.sh storage_dev_backup --env dev
```

O arquivo é salvo em `./backups/<nome>.tar.gz`.

### Backup de Produção e Download para Máquina Local

Fluxo em 2 passos para fazer backup do storage de prod no VPS e baixar para sua máquina:

**Passo 1 – No VPS**, dentro do diretório do projeto:

```bash
cd /caminho/para/coldigom
./scripts/backup-storage.sh storage_prod_$(date +%Y-%m) --env prod
```

O arquivo será criado em: `./backups/storage_prod_YYYY-MM.tar.gz`

**Passo 2 – Na sua máquina local**, baixar o arquivo do VPS:

```bash
# Opção A: scp (mais simples)
scp usuario@ip-do-vps:/caminho/para/coldigom/backups/storage_prod_YYYY-MM.tar.gz ~/Downloads/

# Opção B: rsync (recomendado para arquivos grandes – retoma se a conexão cair)
rsync -avz --progress usuario@ip-do-vps:/caminho/para/coldigom/backups/storage_prod_YYYY-MM.tar.gz ~/Downloads/
```

Substitua: `usuario` (usuário SSH), `ip-do-vps` (IP ou hostname), `/caminho/para/coldigom` (caminho real no VPS), `YYYY-MM` (ex: 2025-02).

**Nota:** O arquivo pode ser grande (vários GB). Use `rsync` para transferências mais confiáveis.

## Ambientes Suportados

### Local (`local`)
- **Onde**: Máquina do desenvolvedor
- **Container**: `praise_api_dev`
- **Compose file**: `docker-compose.dev.yml`
- **Network**: `coldigom-coletanea-dev-network`
- **Volume**: `./storage/assets:/storage/assets` (bind mount)
- **Descrição**: Ambiente Docker de desenvolvimento rodando na máquina local, simula o ambiente dev

### Docker Desenvolvimento (`dev`)
- **Onde**: VPS (servidor remoto)
- **Container**: `praise_api_dev`
- **Compose file**: `docker-compose.dev.yml`
- **Network**: `coldigom-coletanea-dev-network`
- **Volume**: `./storage/assets:/storage/assets` + volume adicional de dados
- **Descrição**: Ambiente Docker de desenvolvimento compartilhado na VPS

### Docker Produção (`prod`)
- **Onde**: VPS (servidor remoto)
- **Container**: `praise_api_prod`
- **Compose file**: `docker-compose.prod.yml`
- **Network**: `coldigom-coletanea-prod-network`
- **Volume**: `./storage/assets:/storage/assets` (bind mount)
- **Descrição**: Ambiente Docker de produção na VPS

**Nota Importante**: Tanto `local` quanto `dev` usam o mesmo arquivo `docker-compose.dev.yml`. A diferença é apenas onde está rodando (máquina local vs VPS). Isso permite que o ambiente local simule perfeitamente o ambiente de desenvolvimento.

## Fluxo Recomendado

### Para Produção (VPS)

1. **Configurar banco de dados:**
   ```bash
   ./scripts/setup-db.sh --env prod
   ```

2. **Importar praises:**
   ```bash
   ./scripts/import-all-praises.sh --env prod --source-path "/Volumes/SSD 2TB SD/storage/assets/praises"
   ```

### Para Desenvolvimento (VPS)

1. **Configurar banco de dados:**
   ```bash
   ./scripts/setup-db.sh --env dev
   ```

2. **Importar praises:**
   ```bash
   ./scripts/import-all-praises.sh --env dev
   ```

### Para Desenvolvimento Local (Máquina do Desenvolvedor)

1. **Garantir que Docker está rodando:**
   ```bash
   docker ps
   ```

2. **Criar network se necessário:**
   ```bash
   ./setup-docker-networks.sh
   ```

3. **Subir containers:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. **Configurar banco de dados:**
   ```bash
   ./scripts/setup-db.sh --env local
   ```

5. **Importar praises:**
   ```bash
   ./scripts/import-all-praises.sh --env local
   ```

## Pré-requisitos

### Para Todos os Ambientes
- Docker e Docker Compose instalados
- Containers rodando ou capacidade de iniciá-los
- Arquivos de storage acessíveis
- Network Docker criada (execute `./setup-docker-networks.sh` se necessário)

## Troubleshooting

### Erro: "MaterialTypes não encontrados"
Execute primeiro o script de setup:
```bash
./scripts/setup-db.sh --env [prod|dev|local]
```

### Erro: "Container não encontrado"
- Verifique se os containers estão rodando: `docker ps`
- Inicie os containers:
  - Local/Dev: `docker-compose -f docker-compose.dev.yml up -d`
  - Prod: `docker-compose -f docker-compose.prod.yml up -d`

### Erro: "Docker não está disponível"
- Certifique-se de que Docker está instalado e rodando
- Verifique com: `docker ps`

### Erro: "Caminho não encontrado"
- Verifique se o caminho do storage está correto
- Use `--source-path` para especificar caminho diferente

### Erro: "Network não encontrada"
- Execute o script de setup de networks:
  ```bash
  ./setup-docker-networks.sh
  ```

## Notas

- Os scripts detectam automaticamente o ambiente se `--env` não for especificado
- Em modo Docker, os arquivos são copiados para volumes/bind mounts automaticamente
- Use `--dry-run` para testar sem fazer alterações reais
- O ambiente `local` usa o mesmo `docker-compose.dev.yml` que `dev`, garantindo consistência entre desenvolvimento local e remoto
