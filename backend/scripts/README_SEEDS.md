# Seeds: Material Kinds e Traduções

## Problema

Na VPS os **material_kinds** e as **traduções** podem não existir. No Docker local do coldigom eles já estão populados. Em vez de recriar as traduções manualmente, exportamos do banco local e importamos na VPS.

## Passos

### 1. Exportar do banco local (Docker coldigom)

Com o Docker do coldigom rodando e o `backend/.env` apontando para esse Postgres:

```bash
cd backend
python scripts/export_material_kinds_seeds.py
```

Isso gera na pasta `backend/`:

- `material_kinds_seed.csv` — lista de material kinds (id, name)
- `material_kind_translations_seed.csv` — traduções (id, material_kind_id, language_code, translated_name)

Opcional: gerar em outro diretório:

```bash
python scripts/export_material_kinds_seeds.py --output-dir ./seeds
```

### 2. Na VPS: importar material_kinds

Copie `material_kinds_seed.csv` para o backend na VPS e rode:

```bash
python scripts/import_seed_data.py --material-kinds-csv material_kinds_seed.csv
```

(Se quiser importar só material_kinds, use esse comando; `import_seed_data` também importa praise_tags se você passar o CSV deles.)

### 3. Na VPS: importar traduções

Com `material_kind_translations_seed.csv` no backend na VPS:

```bash
python scripts/seed_translations.py --csv material_kind_translations_seed.csv
```

Ou deixe o arquivo em `backend/material_kind_translations_seed.csv` e rode:

```bash
python scripts/seed_translations.py
```

---

**Ordem obrigatória:** primeiro material_kinds, depois traduções (as traduções referenciam `material_kind_id`).
