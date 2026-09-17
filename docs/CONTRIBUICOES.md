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

Cada arquivo aceita no upload tem no máximo 32 MiB, até 5 arquivos por envio; o corpo inteiro do `multipart/form-data` respeita o teto de **96 MiB** imposto pelo nosso próprio `MAX_REQUEST_BYTES` (`routes/contributions.ts`) — a borda do Cloudflare (planos Free/Pro) já corta em 100 MB antes disso; 96 MiB só existe para responder `413` com um erro nosso, cedo, em vez de deixar o edge cortar a conexão sem explicação nenhuma pro app.

**Gate de deploy — validar antes do app fixar 96 MiB de vez:** medir um multipart real de ~90 MiB contra o Worker publicado (não contra `wrangler dev` nem build local — ver `test-on-production-v2.md`). Se o isolate estourar memória (erro `1102`, "Worker exceeded resource limits"), baixar `MAX_REQUEST_BYTES` para algo entre 48–64 MiB e atualizar o teto correspondente no app Flutter antes de anunciar o limite para os usuários.

### Ordem de deploy (spec §10)

1. `wrangler d1 execute coldigom --remote --file=migrations/020_contributions.sql`
2. `npx wrangler queues create contrib-scan`
3. `npx wrangler secret put VIRUSTOTAL_API_KEY` e `SAFE_BROWSING_API_KEY`; `PLPCG_AUTH_URL` em `[vars]`
4. Lifecycle rule `quarantine/` → 30 dias no bucket `coldigom-assets`
5. Deploy do **plpcg-catalog** (introspect) — sempre antes do coldigom-api, que depende dele para autenticar `sess_…`
6. Deploy do **coldigom-api** (`npm run deploy`; já inclui o consumer da Queue e o cron)
7. App: build web para `v2.plpcg.com` + lojas quando couber

### Sem os secrets em produção

Se `VIRUSTOTAL_API_KEY` ou `SAFE_BROWSING_API_KEY` faltarem, o consumer loga `contributions.scan.keys_missing` (um `console.error` por batch, apontando qual das duas chaves falta) e segue rodando — nunca lança. Sem `SAFE_BROWSING_API_KEY`, todo link fica `adiado` para sempre; sem `VIRUSTOTAL_API_KEY`, todo arquivo fica `adiado` para sempre. Como nenhum dos dois nunca vira `limpa`/`unsafe`, a contribuição nunca sai de `recebida` pelo caminho normal — o cron diário (`requeueStaleContributions`) a bloqueia por `timeout` depois de 24 h (`scan_report.reason = 'timeout'`), em vez de ficar presa para sempre.

### Nota para a peça C (visualizador web)

A rota `GET /api/admin/contributions/:id/files/:fileId` passa por `requireAuth`, que exige um `Origin` confiável e lê a sessão do cookie `coldigom_access` (`SameSite=Lax`). Um `<iframe src="…">` apontando direto pra essa URL **não autentica** — navegação de subframe cross-site não manda o cookie `Lax`, nem o header `Origin` que a rota confere. O visualizador web precisa fazer `fetch` (que manda os dois) e montar um blob URL a partir da resposta. Atenção: um blob URL **não herda** o `Content-Security-Policy: sandbox` que a rota devolve no header — isso só vale para a resposta do `fetch` em si. Quem exibe o blob (`<iframe>`/`<embed>` apontando pro blob URL) precisa colocar o atributo `sandbox` no próprio elemento.

### Drift vs. a spec

- A spec descreve paginação por `cursor=` na lista do admin; a implementação usa `page=` (offset/limit) — mais simples de expor numa tela de fila com contagem total e "ir para a página N".
- A ordem do pipeline de scan é estrutural → dedupe → VirusTotal (a spec lista dedupe antes do estrutural); rodar o estrutural primeiro evita gastar uma consulta na tabela por um arquivo que nem passaria na checagem de assinatura/tokens.
- Um arquivo deduplicado grava `scan_detail.virustotal.dedupedFrom = <id do gêmeo>` em vez de copiar o `scan_detail` inteiro do gêmeo — mantém rastreável qual arquivo forneceu o veredito sem duplicar dado.
