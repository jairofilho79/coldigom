# Configuração OAuth Google (coldigom)

Use o comando global **`wrangler`** (4.x). Não use `npx wrangler` (resolve versão 3.x e quebra `wrangler login`).

## URLs de produção

| Serviço | URL |
|---------|-----|
| API (Worker) | `https://coldigom-api.jairofilho79.workers.dev` |
| Web (Pages) | `https://coldigom-web.pages.dev` |

Auth e API em produção passam pelo **mesmo origin** da SPA (`/auth/*`, `/api/*`, `/assets/*` via Pages Functions), para cookies first-party no Safari/iPhone.

## 1. Google Cloud Console

1. Crie ou selecione um projeto em [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs e serviços → Tela de consentimento OAuth**: tipo Externo (ou Interno se Workspace); escopos `openid`, `email`, `profile` (e `drive.readonly` para importação do Drive — ver [DRIVE_SETUP.md](./DRIVE_SETUP.md)); adicione **usuários de teste** enquanto o app estiver em Testando.
3. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**:
   - **URI de redirecionamento autorizado** (exato — obrigatório para login):
     ```
     https://coldigom-web.pages.dev/auth/callback
     ```
   - (Opcional, legado) `https://coldigom-api.jairofilho79.workers.dev/auth/callback`
   - **Origem JavaScript**: `https://coldigom-web.pages.dev`
4. Copie **Client ID** e **Client Secret**.

## 2. Cloudflare Worker `coldigom-api`

Na pasta `api/` (com `wrangler.toml` configurado):

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put AUTH_JWT_SECRET   # openssl rand -hex 32
```

Variáveis públicas em `wrangler.toml` → bloco `[vars]`:

```toml
[vars]
AUTH_BASE_URL = "https://coldigom-web.pages.dev"
WEB_ORIGIN = "https://coldigom-web.pages.dev"
AUTH_COOKIE_SAMESITE = "Lax"
```

`AUTH_BASE_URL` define o `redirect_uri` do Google (`{AUTH_BASE_URL}/auth/callback`).
Migração D1 (refresh tokens):

```bash
wrangler d1 execute coldigom --remote --file=scripts/migration-auth-refresh.sql
```

Deploy:

```bash
npm run build
wrangler deploy
```

## 3. Verificação

```bash
curl -s https://coldigom-web.pages.dev/auth/status | jq
# ou direto no Worker:
curl -s https://coldigom-api.jairofilho79.workers.dev/auth/status | jq
```

Esperado (exemplo):

```json
{
  "googleClientConfigured": true,
  "jwtConfigured": true,
  "webOriginSet": true,
  "authBaseUrl": "https://coldigom-web.pages.dev",
  "cookieSameSiteEffective": "Lax",
  "callbackUrl": "https://coldigom-web.pages.dev/auth/callback"
}
```

### Smoke test manual

1. Abra `https://coldigom-web.pages.dev` → **Entrar com Google**.
2. Após login, URL pode ter `?auth=success` (removido automaticamente).
3. DevTools → Application → Cookies de **coldigom-web.pages.dev**: `coldigom_access`, `coldigom_refresh` com `SameSite=Lax; Secure`.
4. `GET /auth/me` (same-origin) deve retornar `user` preenchido.
5. Recarregue no iPhone/Safari — sessão deve permanecer.

## Erros comuns

| Sintoma | Solução |
|---------|---------|
| `Google OAuth not configured` | `wrangler secret put GOOGLE_CLIENT_ID` + redeploy |
| `redirect_uri_mismatch` | URI no Google = `https://coldigom-web.pages.dev/auth/callback` |
| `?auth=error` | Ver logs do Worker; conferir `AUTH_JWT_SECRET`, D1 `auth_refresh_tokens`, Client Secret |
| Logado some no iPhone/Safari | Confirme Pages Functions e `VITE_API_URL` vazio; cookies devem ser first-party em pages.dev |
| CORS bloqueado | `WEB_ORIGIN` deve ser exatamente a origem da SPA (sem `/` final) |

## Cookies first-party

OAuth e `/api` passam pelo proxy same-origin (Pages Functions → Worker). Cookies ficam em `coldigom-web.pages.dev` e funcionam no Safari/iPhone sem depender de third-party cookies.
