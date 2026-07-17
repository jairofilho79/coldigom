# Google Drive import — setup no Google Cloud Console

O código já espera OAuth do **usuário** com escopo `drive.readonly`.
Este tutorial é o que precisa ser feito **à mão** no Google Console e no Cloudflare.

## Pré-requisitos

- Coldigom login Google já funcionando (`openid email profile`)
- Acesso ao [Google Cloud Console](https://console.cloud.google.com/) no mesmo projeto do OAuth atual
- Wrangler 4.x global (`wrangler`, não `npx wrangler`)

## 1. Ativar a Google Drive API

1. Abra **APIs e serviços → Biblioteca**
2. Busque **Google Drive API**
3. Clique em **Ativar**

## 2. Atualizar a tela de consentimento OAuth

1. **APIs e serviços → Tela de consentimento OAuth**
2. Em **Escopos**, adicione:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.readonly` ← **novo**
3. Se o app estiver em **Testando**, mantenha os **usuários de teste** (e-mails que vão importar).
4. Para produção pública depois: será preciso passar pela verificação do Google (escopo sensível/restrito). Enquanto estiver em Testando, só test users funcionam.

## 3. Credenciais OAuth (mesmo Client ID)

1. **APIs e serviços → Credenciais →** abra o Client ID tipo **Aplicativo da Web** já usado pelo Coldigom
2. Confirme o **URI de redirecionamento autorizado** (exato):

```
https://coldigom-api.coletaneadigitalicm.workers.dev/auth/callback
```

(O connect do Drive reutiliza o mesmo `/auth/callback`.)

3. Salve. **Client ID / Secret** continuam os mesmos secrets do Worker.

## 4. Cloudflare — schema D1 + fila

Na pasta `api/`:

```bash
# Schema / migration
wrangler d1 execute coldigom --remote --file=migrations/007_drive_import.sql

# Criar a fila (uma vez)
wrangler queues create drive-import

# Deploy do Worker (já inclui binding DRIVE_IMPORT no wrangler.toml)
npm run deploy
```

Secrets (se ainda não existirem):

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put AUTH_JWT_SECRET
```

`AUTH_JWT_SECRET` também cifra o refresh token do Drive em D1 — não rotacione sem limpar `google_drive_credentials`.

## 5. Teste rápido

1. Login no Coldigom com um usuário de teste do Console
2. Abra um louvor → **Materiais (admin)** → **Importar do Google Drive**
3. Se pedir, clique **Conectar Google Drive** e aceite o escopo
4. Cole um link de pasta sua (privada ok) → **Mapear pasta**
5. Revise Material Kind / remova itens → **Importar**
6. Acompanhe o relatório; se algo falhar, **Tentar de novo os que falharam**

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| “Google did not return a Drive refresh token” | Em [conta Google → Segurança → Acesso de apps de terceiros](https://myaccount.google.com/permissions), remova o Coldigom e conecte de novo (precisa de `prompt=consent` + `offline`) |
| 403 / Drive not connected | Conectar Drive de novo; conferir escopo na tela de consentimento |
| Fila não processa | `wrangler queues create drive-import` + redeploy; ver logs do consumer |
| Docs/Sheets pulados | Esperado na v1 — exportar PDF/áudio antes |

## Escopo de produto (v1)

- OAuth do **usuário** (`drive.readonly`)
- Pasta ou arquivo
- Pula Google Docs nativos com aviso
- Falha parcial continua + relatório + retry
