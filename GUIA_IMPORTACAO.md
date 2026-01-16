# 📥 Guia de Importação de Dados - ColDigOS

Este guia explica como popular o banco de dados com os dados do ColDigOS.

## ✅ Passo 1: Preparação (JÁ CONCLUÍDO)

- ✅ MaterialKinds populados (108 tipos criados)
- ✅ Usuário admin criado (username: `admin`, password: `admin123`)

## 📂 Passo 2: Localizar a Pasta de Dados

A pasta de dados está localizada em: `/Volumes/SSD 2TB SD/storage/assets`

**Estrutura atual:**
```
/Volumes/SSD 2TB SD/storage/assets/
└── praises/
    └── {praise_id}/
        ├── metadata.yml
        └── {material_id}.pdf
        └── {material_id}.mp3
        └── ...
```

✅ **Volume já configurado no Docker!** O volume já está montado em `/data/assets` no container.

## 🔧 Passo 3: Configurar Volume no Docker (Opcional, mas Recomendado)

Para facilitar o acesso à pasta ColDigOS do container Docker, adicione um volume no `docker-compose.dev.yml`.

✅ **Volume já configurado!** O volume está montado automaticamente no `docker-compose.dev.yml`:

```yaml
volumes:
  - "/Volumes/SSD 2TB SD/storage/assets:/data/assets:ro"
```

O caminho `/data/assets` dentro do container aponta para `/Volumes/SSD 2TB SD/storage/assets` no host.

## 🧪 Passo 4: Teste com Dry-Run (RECOMENDADO)

Antes de importar tudo, teste com um dry-run para ver o que será feito:

```bash
docker-compose -f docker-compose.dev.yml exec backend python scripts/import_colDigOS.py \
  --colDigOS-path "/data/assets" \
  --dry-run \
  --limit 5
```

## 🧪 Passo 5: Importação Pequena (Teste)

Após verificar o dry-run, faça uma importação pequena para garantir que tudo funciona:

```bash
docker-compose -f docker-compose.dev.yml exec backend python scripts/import_colDigOS.py \
  --colDigOS-path "/data/assets" \
  --limit 10
```

Isso importará apenas 10 praises para testar.

## 🚀 Passo 6: Importação Completa

Quando estiver confiante, execute a importação completa:

```bash
docker-compose -f docker-compose.dev.yml exec backend python scripts/import_colDigOS.py \
  --colDigOS-path "/data/assets"
```

⚠️ **ATENÇÃO:**
- Isso pode levar muito tempo (20.000+ arquivos)
- Certifique-se de ter espaço no Wasabi
- Certifique-se de ter as credenciais do Wasabi configuradas no `.env`

## 📋 Verificar Dados Importados

Após a importação, verifique se os dados foram importados:

```bash
# Verificar quantos praises foram importados
docker-compose -f docker-compose.dev.yml exec backend python -c "
from app.infrastructure.database.database import SessionLocal
from app.domain.models.praise import Praise
from app.domain.models.praise_material import PraiseMaterial
from app.domain.models.praise_tag import PraiseTag
db = SessionLocal()
praises = db.query(Praise).count()
materials = db.query(PraiseMaterial).count()
tags = db.query(PraiseTag).count()
print(f'Praises: {praises}')
print(f'Materials: {materials}')
print(f'Tags: {tags}')
db.close()
"
```

## 🐛 Solução de Problemas

### Erro: "Caminho não encontrado"
- Verifique se o caminho está correto
- Se estiver usando volume Docker, verifique se o caminho dentro do container está correto (`/data/ColDigOS`)
- Verifique se a pasta `praise/` existe dentro de ColDigOS

### Erro: "Pasta 'praise' não encontrada"
- Verifique se a estrutura está correta: `ColDigOS/praise/{praise_id}/`
- O script procura por `ColDigOS/praise/` dentro do caminho fornecido

### Erro: "Access Denied" no Wasabi
- Verifique `WASABI_ACCESS_KEY` e `WASABI_SECRET_KEY` no `.env`
- Verifique se o bucket existe no Wasabi

### Arquivos não encontrados
- Verifique se os arquivos estão nomeados como `{material_id}.{ext}` (como no metadata.yml)
- Verifique os logs do script para ver quais arquivos não foram encontrados

## 📝 Notas Importantes

- O script faz commits periódicos a cada 10 praises
- Se um MaterialKind não existir, ele será criado automaticamente
- Se uma Tag não existir, ela será criada (mas precisa ter o ID correto no metadata)
- Arquivos devem estar nomeados como `{material_id}.{ext}` para serem encontrados
