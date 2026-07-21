# Checklist em casa — Google Drive import (Coldigom)

Siga nesta ordem quando for ligar a feature em produção.
Código: branch `cursor/drive-import-efc8` / PR https://github.com/jairofilho79/coldigom/pull/8

---

## A) Google Cloud Console

Projeto OAuth que o Coldigom já usa: [Google Cloud Console](https://console.cloud.google.com/)

### A1. Ativar Drive API

1. **APIs e serviços → Biblioteca**
2. Buscar **Google Drive API**
3. **Ativar**

### A2. Escopo na tela de consentimento

1. **APIs e serviços → Tela de consentimento OAuth**
2. Em **Escopos**, garantir:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.readonly` ← **novo (obrigatório)**
3. Se o app estiver em **Testando**: adicionar seu e-mail (e quem for testar) em **Usuários de teste**
4. Produção pública depois exige verificação do Google (escopo sensível). Em Testando, só test users funcionam.

### A3. Credenciais (mesmo Client ID)

1. **APIs e serviços → Credenciais** → Client ID tipo **Aplicativo da Web** (o do Coldigom)
2. Confirmar **URI de redirecionamento autorizado** (exato):

```
https://coldigom-api.jairofilho79.workers.dev/auth/callback
```

3. Origem JS (se listar): `https://coldigom-web.pages.dev`
4. Salvar. **Não precisa** criar outro Client ID — secrets do Worker continuam os mesmos.

---

## B) Cloudflare (API)

Use wrangler **global 4.x** (`wrangler`, **não** `npx wrangler`).

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom/api"

# 1) Migration D1 (tabelas Drive + jobs)
wrangler d1 execute coldigom --remote --file=migrations/007_drive_import.sql

# 2) Fila de import (só na primeira vez)
wrangler queues create drive-import

# 3) Secrets (só se ainda não existirem)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put AUTH_JWT_SECRET

# 4) Deploy do Worker (binding DRIVE_IMPORT já está no wrangler.toml)
npm run deploy
```

**Atenção:** `AUTH_JWT_SECRET` também cifra o refresh token do Drive. Não rotacione sem limpar a tabela `google_drive_credentials`.

---

## C) Cloudflare (Web)

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom/web"
# merge/deploy da branch do PR, ou o fluxo Pages que você já usa
npm run build
# deploy Pages: projeto coldigom-web (conta jairofilho79)
```

Garantir que a SPA aponta para a API de produção (`VITE_API_URL` / env do Pages).

---

## D) Teste rápido (5 min)

1. Login no Coldigom com um **usuário de teste** do Console
2. Abrir um louvor → **Materiais (admin)** → **Importar do Google Drive**
3. Se pedir → **Conectar Google Drive** → aceitar o escopo
4. Colar link de pasta (privada ok) → **Mapear pasta**
5. Revisar Material Kind / remover o que não quiser → **Importar**
6. Ver progresso; se falhar algo → **Tentar de novo os que falharam**

URL web: `https://coldigom-web.pages.dev`  
URL API: `https://coldigom-api.jairofilho79.workers.dev`

---

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| “Google did not return a Drive refresh token” | Remover o Coldigom em [Acesso de apps de terceiros](https://myaccount.google.com/permissions) e conectar de novo |
| 403 / Drive not connected | Conectar Drive de novo; conferir escopo `drive.readonly` no Console |
| Fila não processa | Rodar `wrangler queues create drive-import` + redeploy do Worker; ver logs do consumer |
| Docs/Sheets “pulados” | Esperado na v1 — exportar PDF/áudio no Drive antes |

---

## Escopo da v1 (já no código)

- OAuth do **usuário** (não conta da Coldigom)
- Pasta **ou** arquivo
- Google Docs nativos → pulados com aviso
- Falha parcial → continua + relatório + retry
