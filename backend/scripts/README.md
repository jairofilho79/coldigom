# Scripts de Importação e Manutenção

Este diretório contém scripts utilitários para o Praise Manager.

## 📋 Scripts Disponíveis

### `init_db.py`
Cria um usuário admin padrão no banco de dados.

**Uso:**
```bash
python scripts/init_db.py
```

**Resultado:**
- Cria usuário: `admin`
- Senha: `admin123`
- ⚠️ **IMPORTANTE:** Altere a senha após o primeiro login!

---

### `seed_material_kinds.py`
Popula os tipos de material (MaterialKinds) iniciais no banco de dados.

**Uso:**
```bash
# Executar
python scripts/seed_material_kinds.py

# Ver o que seria criado (dry-run)
python scripts/seed_material_kinds.py --dry-run
```

**O que faz:**
- Cria todos os MaterialKinds baseados no enum do frontend
- Instrumentos (violino, flauta, trompete, etc.)
- Vozes (soprano, tenor, baixo, etc.)
- MIDI (MIDI Choir, MIDI Voice, etc.)
- Áudio (Audio General, Rehearsal Version, etc.)
- Partituras (Sheet Music, Score, Chord Chart, etc.)

**Nota:** Se um MaterialKind já existe, ele será pulado.

---

### `import_seed_data.py`
Importa dados iniciais de arquivos CSV para o banco de dados (praise_tags e material_kinds com IDs específicos).

**Uso:**
```bash
# Dry-run (não faz alterações)
python scripts/import_seed_data.py --dry-run

# Importar com caminhos padrão
python scripts/import_seed_data.py

# Importar com caminhos personalizados
python scripts/import_seed_data.py \
  --praise-tags-csv "/caminho/para/praise_tags_unique.csv" \
  --material-kinds-csv "/caminho/para/material_kinds_unique.csv"
```

**Parâmetros:**
- `--praise-tags-csv` (opcional): Caminho para o arquivo CSV de praise_tags (padrão: `/Volumes/SSD 2TB SD/assets2/praise_tags_unique.csv`)
- `--material-kinds-csv` (opcional): Caminho para o arquivo CSV de material_kinds (padrão: `/Volumes/SSD 2TB SD/assets2/material_kinds_unique.csv`)
- `--dry-run` (opcional): Modo de simulação (não faz alterações no banco)

**Formato dos CSVs:**

**praise_tags_unique.csv:**
```csv
praise_tag_id,praise_tag_name
45ab58b2-d293-45c7-aa75-090fcd968b24,Avulsos
c113296e-a8f6-4f07-83ba-f055c125542f,CIAs
...
```

**material_kinds_unique.csv:**
```csv
material_kind_id,material_kind_name
6d35011f-b98b-436f-b4f7-92c3cff413c5,Alto Saxophone
8ddc2fed-5298-4ead-bc71-e529921c00ac,Alto Voice
...
```

**O que faz:**
1. Lê os arquivos CSV de praise_tags e material_kinds
2. Cria/atualiza registros no banco de dados usando os IDs específicos do CSV
3. Mantém a consistência dos IDs (importante para relacionamentos existentes)
4. Atualiza nomes se o ID já existir mas com nome diferente
5. Pula registros que já existem com o mesmo ID e nome

**Notas:**
- Os IDs do CSV são preservados (não são gerados novos)
- Se um ID já existir, o nome será atualizado se for diferente
- Se um nome já existir com outro ID, o registro será ignorado
- Use `--dry-run` primeiro para ver o que seria importado

---

### `import_colDigOS.py`
Importa arquivos da pasta ColDigOS para Wasabi e sincroniza com o banco de dados.

**Uso Básico:**
```bash
# Dry-run (não faz alterações)
python scripts/import_colDigOS.py \
  --colDigOS-path "/caminho/para/ColDigOS" \
  --dry-run

# Teste com poucos arquivos
python scripts/import_colDigOS.py \
  --colDigOS-path "/caminho/para/ColDigOS" \
  --limit 10

# Importação completa
python scripts/import_colDigOS.py \
  --colDigOS-path "/caminho/para/ColDigOS"
```

**Parâmetros:**
- `--colDigOS-path` (obrigatório): Caminho para a pasta ColDigOS
- `--dry-run` (opcional): Modo de simulação (não faz alterações)
- `--limit` (opcional): Limitar número de praises a processar

**O que faz:**
1. Lê cada pasta em `ColDigOS/praise/{praise_id}/`
2. Carrega `metadata.yml` de cada pasta
3. Cria/atualiza Praise no banco de dados
4. Cria/atualiza Tags associadas
5. Faz upload dos arquivos para Wasabi
6. Cria/atualiza PraiseMaterials no banco

**Estrutura Esperada:**
```
ColDigOS/
└── praise/
    └── {praise_id}/
        ├── metadata.yml
        └── {material_id}.pdf
        └── {material_id}.mp3
        └── ...
```

**Formato do metadata.yml:**
```yaml
praise_id: 0a4c007f-7dd4-42d5-993c-85e50243bfad
praise_name: Não Desanimes, Deus Proverá
praise_number: '123'
praise_tags:
  - 45ab58b2-d293-45c7-aa75-090fcd968b24
  - d369f950-5259-483c-9412-b0a37d90042c
praise_materiais:
  - praise_material_id: f9e225de-4899-49e5-bbef-6beadea0f733
    file_path_legacy: Avulsos Migrados/...
    material_kind: c2fb644f-697c-4d43-9d5f-22319fa0ce79
    type: pdf
```

**Notas:**
- O script faz commits periódicos a cada 10 praises
- Arquivos devem estar nomeados como `{material_id}.{ext}`
- Se um arquivo não for encontrado, ele será pulado
- Se um MaterialKind não existir, ele será criado automaticamente
- Se uma Tag não existir, ela será criada (mas precisa ter o ID correto no metadata)

**Mapeamento de Tipos:**
O script mapeia automaticamente tipos em português para MaterialKinds em inglês:
- `partitura` → `Sheet Music`
- `coro` → `Choir`
- `midi coro` → `MIDI Choir`
- `voz cantada` → `Sung Voice`
- `versão ensaio` → `Rehearsal Version`
- etc.

---

## 🔧 Pré-requisitos

Antes de executar os scripts:

1. **Configurar .env**
   ```bash
   cp env.example .env
   # Editar .env com suas credenciais
   ```

2. **Instalar dependências**
   ```bash
   pip install -r requirements.txt
   ```

3. **Banco de dados rodando**
   ```bash
   docker-compose up -d db
   ```

4. **Executar migrations**
   ```bash
   alembic upgrade head
   ```

---

## 📝 Ordem Recomendada de Execução

1. **Importar dados iniciais (praise_tags e material_kinds com IDs específicos):**
   ```bash
   # Ver o que seria importado
   python scripts/import_seed_data.py --dry-run
   
   # Importar
   python scripts/import_seed_data.py
   ```

   **OU popular MaterialKinds manualmente:**
   ```bash
   python scripts/seed_material_kinds.py
   ```

2. **Criar usuário admin:**
   ```bash
   python scripts/init_db.py
   ```

3. **Testar importação (dry-run):**
   ```bash
   python scripts/import_colDigOS.py \
     --colDigOS-path "/caminho/para/ColDigOS" \
     --dry-run \
     --limit 5
   ```

4. **Importação pequena (teste):**
   ```bash
   python scripts/import_colDigOS.py \
     --colDigOS-path "/caminho/para/ColDigOS" \
     --limit 10
   ```

5. **Importação completa:**
   ```bash
   python scripts/import_colDigOS.py \
     --colDigOS-path "/caminho/para/ColDigOS"
   ```

---

## 🐛 Solução de Problemas

### Erro: "Module not found"
- Certifique-se de estar na pasta `backend`
- Verifique se todas as dependências estão instaladas: `pip install -r requirements.txt`

### Erro: "Could not connect to database"
- Verifique se o PostgreSQL está rodando: `docker-compose ps`
- Verifique a `DATABASE_URL` no `.env`

### Erro: "Access Denied" no Wasabi
- Verifique `WASABI_ACCESS_KEY` e `WASABI_SECRET_KEY` no `.env`
- Verifique se o bucket existe no Wasabi

### Arquivos não encontrados
- Verifique se o caminho `--colDigOS-path` está correto
- Verifique se os arquivos estão nomeados como `{material_id}.{ext}`
- Verifique os logs do script para ver quais arquivos não foram encontrados

### Importação lenta
- Normal para muitos arquivos (20k+ arquivos)
- O script faz commits a cada 10 praises
- Você pode ajustar isso no código se necessário

---

## 💡 Dicas

- **Sempre use `--dry-run` primeiro** para ver o que seria feito
- **Use `--limit`** para testar com poucos arquivos antes da importação completa
- **Monitore os logs** para identificar problemas
- **Faça backup do banco** antes de importações grandes
- **Verifique o espaço no Wasabi** antes de importar tudo
