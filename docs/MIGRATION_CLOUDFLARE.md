# Migração Cloudflare — Coldigom

Migração da conta **coletaneadigitalicm** → **jairofilho79** (jul/2026).

## Contas e IDs

| | Origem | Destino |
|---|--------|---------|
| Account ID | `ae6f9337c75828a1c114e9ec10119d0f` | `246ee6c20c011ae98a226d48a7a38902` |
| D1 `coldigom` | `975818ec-73e0-40ca-b110-be9204e13d91` | `7186c208-a639-469e-810c-8e7401c16b33` |
| API URL | `coldigom-api.coletaneadigitalicm.workers.dev` | `coldigom-api.jairofilho79.workers.dev` |
| Web URL | `coldigom-web.pages.dev` | `coldigom-web.pages.dev` (mesmo nome global) |

## Status da migração

- [x] Export/import D1 (1846 louvores, 20725 materiais)
- [x] Queue `drive-import`, Worker, secrets na destino
- [x] R2 `coldigom-assets` (25 154 objetos)
- [x] Configs/CI com `account_id` destino e Pages `coldigom-web`
- [x] Pages `coldigom-web` na **destino** → `https://coldigom-web.pages.dev`
- [ ] Secret GitHub `CLOUDFLARE_API_TOKEN` da conta destino (token da jairofilho79)

## Cutover Pages

Já feito na conta destino. Deploy de produção exige `--branch=main` (senão vira preview).

```bash
cd web
VITE_API_URL=https://coldigom-api.jairofilho79.workers.dev npm run build
CLOUDFLARE_ACCOUNT_ID=246ee6c20c011ae98a226d48a7a38902 wrangler pages deploy dist --project-name=coldigom-web --branch=main
```

Pendente: atualizar `CLOUDFLARE_API_TOKEN` no GitHub (token da jairofilho79: Workers + D1 + R2 + Pages + Queues).

## Alternar login Wrangler

```bash
wrangler logout && wrangler login
wrangler whoami
```
