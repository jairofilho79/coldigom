# Configuração OAuth Google (coldigom)

Use o comando global **`wrangler`** (4.x). Não use `npx wrangler` (resolve versão 3.x e quebra `wrangler login`).

## URLs de produção

| Serviço | URL |
|---------|-----|
| API (Worker) | `https://coldigom-api.coletaneadigitalicm.workers.dev` |
| Web (Pages) | `https://coldigom-web.pages.dev` |

## 1. Google Cloud Console

1. Crie ou selecione um projeto em [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs e serviços → Tela de consentimento OAuth**: tipo Externo (ou Interno se Workspace); escopos `openid`, `email`, `profile` (e `drive.readonly` para importação do Drive — ver [DRIVE_SETUP.md](./DRIVE_SETUP.md)); adicione **usuários de teste** enquanto o app estiver em Testando.
3. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**:
   - **URI de redirecionamento autorizado** (exato):
     ```
     https://coldigom-api.coletaneadigitalicm.workers.dev/auth/callback
     ```
   - **Origem JavaScript** (recomendado): `https://coldigom-web.pages.dev`
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
AUTH_BASE_URL = "https://coldigom-api.coletaneadigitalicm.workers.dev"
WEB_ORIGIN = "https://coldigom-web.pages.dev"
AUTH_COOKIE_SAMESITE = "None"
```

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
curl -s https://coldigom-api.coletaneadigitalicm.workers.dev/auth/status | jq
```

Esperado (exemplo):

```json
{
  "googleClientConfigured": true,
  "jwtConfigured": true,
  "webOriginSet": true,
  "cookieSameSiteEffective": "None"
}
```

### Smoke test manual

1. Abra `https://coldigom-web.pages.dev` → **Entrar com Google**.
2. Após login, URL pode ter `?auth=success` (removido automaticamente).
3. DevTools → Application → Cookies do domínio **da API**: `coldigom_access`, `coldigom_refresh` com `SameSite=None; Secure`.
4. `GET /auth/me` com credenciais deve retornar `user` preenchido.
5. Recarregue a página — sessão deve permanecer.

## Erros comuns

| Sintoma | Solução |
|---------|---------|
| `Google OAuth not configured` | `wrangler secret put GOOGLE_CLIENT_ID` + redeploy |
| `redirect_uri_mismatch` | URI no Google = `{AUTH_BASE_URL}/auth/callback` |
| `?auth=error` | Ver logs do Worker; conferir `AUTH_JWT_SECRET`, D1 `auth_refresh_tokens`, Client Secret |
| Logado some ao recarregar | Definir `WEB_ORIGIN` e `AUTH_COOKIE_SAMESITE=None` |
| CORS bloqueado | `WEB_ORIGIN` deve ser exatamente a origem da SPA (sem `/` final) |

## Cookies de terceiros

Safari/Firefox com bloqueio estrito podem impedir cookies cross-site. Teste em Chrome primeiro; se necessário, desative bloqueio para o site ou avalie proxy de auth na Pages (futuro).
