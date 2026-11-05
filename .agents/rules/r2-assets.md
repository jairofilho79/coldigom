# Cloudflare R2 Asset Management

Sempre que gerar, atualizar ou publicar arquivos de mídia ou partituras para louvores no Coldigom:

1. **Prefixo Obrigatório no R2**:
   A API do Coldigom (`api/src/routes/assets.ts`) mapeia a rota `/assets/*` diretamente para a chave `storage/assets/*` no bucket `coldigom-assets`.
   Portanto, a chave remota no R2 **SEMPRE** deve começar com `storage/`:
   `coldigom-assets/storage/assets/praises/<praise_id>/<material_id>.<ext>`

2. **Flag `--remote` Obrigatória**:
   O comando `npx wrangler r2 object put` sem `--remote` grava apenas no storage simulado local. Para publicar em produção, use **sempre**:
   `npx wrangler r2 object put "coldigom-assets/storage/assets/praises/<praise_id>/<material_id>.<ext>" --file "<caminho_local>" --remote`

3. **Verificação de ETag / Cache**:
   Sempre verifique o upload via `curl -sI "https://coldigom-web.pages.dev/assets/praises/<praise_id>/<material_id>.<ext>"` e confirme que o cabeçalho `etag` é idêntico ao hash MD5 do arquivo local.
