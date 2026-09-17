# Contribuições da comunidade

Spec: `coldigui/docs/superpowers/specs/2026-09-17-contribuicoes-comunidade-design.md`.

| Método | Rota | Auth | O quê |
|---|---|---|---|
| `POST` | `/api/contributions` | `sess_…` da app (introspect no plpcg-catalog) | multipart `payload` + `file[]` (≤ 5 × 32 MiB) → quarentena + fila `contrib-scan` |
| `GET` | `/api/contributions/mine`, `/:id` | `sess_…` | Do próprio usuário |
| `GET` | `/api/admin/contributions[?status=&kind=&praise=&page=]`, `/:id` | admin | Fila de revisão |
| `GET` | `/api/admin/contributions/:id/files/:fileId` | admin | Só `scan_status = limpa`; `nosniff` + `CSP: sandbox` |
| `PATCH` | `/api/admin/contributions/:id` | admin + Origin | `{ status: em_analise\|aceita\|recusada\|aplicada, decision_note }` |

Setup (uma vez): `npx wrangler queues create contrib-scan`; `npx wrangler secret put VIRUSTOTAL_API_KEY`; `npx wrangler secret put SAFE_BROWSING_API_KEY`; `PLPCG_AUTH_URL` no bloco `[vars]` de `api/wrangler.toml`; migration `020_contributions.sql`; **lifecycle rule** no bucket `coldigom-assets` apagando o prefixo `quarantine/` após 30 dias (dashboard → R2 → bucket → Settings → Object lifecycle rules). Cron `0 3 * * *` reenfileira `recebida` > 6 h e bloqueia > 24 h.

Cada arquivo aceita no upload tem no máximo 32 MiB, até 5 arquivos por envio; o corpo inteiro do `multipart/form-data` respeita o teto de 96 MiB por requisição imposto pela borda do Cloudflare.
