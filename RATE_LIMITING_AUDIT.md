# Auditoria de Rate Limiting - Coldigom API

## Resumo Executivo

Este documento lista todas as rotas da API que possuem limitações de tráfego (rate limiting) e seus respectivos limites configurados.

**Problema Identificado**: A rota `GET /api/v1/translations/material-types?language_code=pt` está configurada com limite de **20 req/min**, mas está retornando erro 429 indicando que passou de **600 req/min**, sugerindo que o rate limiting não está funcionando corretamente para esta rota.

---

## Configuração do Rate Limiter

**Arquivo**: `backend/app/main.py`

- **Biblioteca**: `slowapi` (versão 0.1.9)
- **Chave de Rate Limit**: `IP + path` (cada rota tem seu próprio contador)
- **Função de chave**: `_rate_limit_key()` - usa `get_remote_address(request)` + `request.url.path`

---

## Rotas com Rate Limiting

### 1. Rotas de Autenticação (`/api/v1/auth`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/login` | POST | **600/min** | Sempre aplicado | `auth.py:35` |
| `/refresh` | POST | **600/min** | Sempre aplicado | `auth.py:50` |

**Observação**: Essas rotas aplicam rate limiting sempre, independente de autenticação.

---

### 2. Rotas de Translations (`/api/v1/translations`)

#### Material-Kinds Translations

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/material-kinds/{translation_id}` | GET | **40/min** | Apenas não autenticados | `translations.py:49` |
| `/material-kinds` | GET | **20/min** | Apenas não autenticados | `translations.py:69` |

#### Praise-Tags Translations

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/praise-tags/{translation_id}` | GET | **40/min** | Apenas não autenticados | `translations.py:132` |
| `/praise-tags` | GET | **20/min** | Apenas não autenticados | `translations.py:152` |

#### Material-Types Translations ⚠️ **PROBLEMA**

| Rota | Método | Limite Configurado | Limite Real (Erro) | Condição | Arquivo |
|------|--------|-------------------|-------------------|----------|---------|
| `/material-types/{translation_id}` | GET | **40/min** | - | Apenas não autenticados | `translations.py:215` |
| `/material-types` | GET | **20/min** | **600/min** ❌ | Apenas não autenticados | `translations.py:235` |

**⚠️ PROBLEMA IDENTIFICADO**: A rota `GET /material-types` está configurada com limite de **20/min**, mas está retornando erro 429 indicando limite de **600/min**. Isso sugere que o rate limiting não está sendo aplicado corretamente ou há algum limite padrão sendo usado.

---

### 3. Rotas de Praises (`/api/v1/praises`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **600/min** | Sempre aplicado | `praises.py:45` |
| `/download-by-material-kind` | GET | **600/min** | Sempre aplicado | `praises.py:81` |
| `/{praise_id}` | GET | **600/min** | Sempre aplicado | `praises.py:295` |
| `/{praise_id}/download-url` | GET | **600/min** | Sempre aplicado | `praises.py:507` |

**Observação**: Essas rotas aplicam rate limiting sempre, independente de autenticação.

---

### 4. Rotas de Material Types (`/api/v1/material-types`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **20/min** | Apenas não autenticados | `material_types.py:28` |
| `/{type_id}` | GET | **40/min** | Apenas não autenticados | `material_types.py:48` |

---

### 5. Rotas de Praise Tags (`/api/v1/praise-tags`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **20/min** | Apenas não autenticados | `praise_tags.py:29` |
| `/{tag_id}` | GET | **40/min** | Apenas não autenticados | `praise_tags.py:50` |

---

### 6. Rotas de Material Kinds (`/api/v1/material-kinds`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **20/min** | Apenas não autenticados | `material_kinds.py:28` |
| `/{kind_id}` | GET | **40/min** | Apenas não autenticados | `material_kinds.py:48` |

---

### 7. Rotas de Languages (`/api/v1/languages`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **20/min** | Apenas não autenticados | `languages.py:28` |
| `/{code}` | GET | **40/min** | Apenas não autenticados | `languages.py:48` |

---

### 8. Rotas de Praise Materials (`/api/v1/praise-materials`)

| Rota | Método | Limite | Condição | Arquivo |
|------|--------|--------|----------|---------|
| `/` | GET | **600/min** | Apenas não autenticados | `praise_materials.py:52` |
| `/batch` | GET | **600/min** | Apenas não autenticados | `praise_materials.py:84` |
| `/{material_id}/download-url` | GET | **40/min** | Apenas não autenticados | `praise_materials.py:342` |
| `/{material_id}/download` | GET | **40/min** | Apenas não autenticados | `praise_materials.py:381` |
| `/{material_id}` | GET | **40/min** | Apenas não autenticados | `praise_materials.py:486` |

---

## Resumo por Limite

### Limite de 20 req/min
- `GET /api/v1/translations/material-kinds` (não autenticados)
- `GET /api/v1/translations/praise-tags` (não autenticados)
- `GET /api/v1/translations/material-types` ⚠️ (não autenticados) - **PROBLEMA**
- `GET /api/v1/material-types/` (não autenticados)
- `GET /api/v1/praise-tags/` (não autenticados)
- `GET /api/v1/material-kinds/` (não autenticados)
- `GET /api/v1/languages/` (não autenticados)

### Limite de 40 req/min
- `GET /api/v1/translations/material-kinds/{id}` (não autenticados)
- `GET /api/v1/translations/praise-tags/{id}` (não autenticados)
- `GET /api/v1/translations/material-types/{id}` (não autenticados)
- `GET /api/v1/material-types/{id}` (não autenticados)
- `GET /api/v1/praise-tags/{id}` (não autenticados)
- `GET /api/v1/material-kinds/{id}` (não autenticados)
- `GET /api/v1/languages/{code}` (não autenticados)
- `GET /api/v1/praise-materials/{id}/download-url` (não autenticados)
- `GET /api/v1/praise-materials/{id}/download` (não autenticados)
- `GET /api/v1/praise-materials/{id}` (não autenticados)

### Limite de 600 req/min
- `POST /api/v1/auth/login` (sempre)
- `POST /api/v1/auth/refresh` (sempre)
- `GET /api/v1/praises/` (sempre)
- `GET /api/v1/praises/download-by-material-kind` (sempre)
- `GET /api/v1/praises/{id}` (sempre)
- `GET /api/v1/praises/{id}/download-url` (sempre)
- `GET /api/v1/praise-materials/` (não autenticados)
- `GET /api/v1/praise-materials/batch` (não autenticados)

---

## Análise do Problema

### Rota Problemática
**Rota**: `GET /api/v1/translations/material-types?language_code=pt`

**Configuração Esperada**:
- Limite: **20 req/min** para usuários não autenticados
- Código: `translations.py:234-235`

**Comportamento Observado**:
- Erro 429 indicando limite de **600 req/min**

### Possíveis Causas

1. **Problema na implementação de `apply_rate_limit`**: A função pode não estar aplicando o limite corretamente
2. **Limite padrão do slowapi**: Pode haver um limite padrão de 600/min sendo aplicado quando o rate limiting falha
3. **Cache ou estado compartilhado**: O rate limiter pode estar compartilhando estado entre rotas diferentes
4. **Problema na chave de rate limit**: A função `_rate_limit_key` pode não estar diferenciando corretamente as rotas

### Próximos Passos

1. ✅ **Verificar a implementação de `apply_rate_limit`** - CORRIGIDO
   - Implementação melhorada com melhor tratamento de erros e logs
   - Arquivo: `backend/app/core/rate_limit_helpers.py`

2. **Testar o rate limiting especificamente para a rota `/api/v1/translations/material-types`**
   - Fazer requisições de teste para validar que o limite de 20/min está sendo aplicado
   - Verificar logs para confirmar que o rate limiting está funcionando

3. **Verificar se há algum middleware ou configuração global que possa estar interferindo**
   - Confirmar que não há `default_limits` configurado no Limiter
   - Verificar se há algum middleware que possa estar aplicando limites adicionais

4. **Comparar com outras rotas similares que estão funcionando corretamente**
   - Verificar se outras rotas com limite de 20/min estão funcionando corretamente
   - Comparar a implementação entre rotas que funcionam e a que não funciona

### Correções Aplicadas

**Arquivo**: `backend/app/core/rate_limit_helpers.py`

- Melhorado tratamento de erros com try/except explícito
- Adicionado logging para debug (pode ser removido em produção se necessário)
- Garantido que a função usa a mesma `key_func` configurada no limiter
- Comentários adicionados para clarificar o funcionamento

---

## Recomendações

1. **Padronizar limites**: Algumas rotas têm limites muito diferentes (20/min vs 600/min). Avaliar se faz sentido ter essa diferença.

2. **Documentar comportamento**: Documentar claramente quando o rate limiting é aplicado (sempre vs apenas não autenticados).

3. **Testes de rate limiting**: Criar testes automatizados para validar que os limites estão sendo aplicados corretamente.

4. **Monitoramento**: Adicionar logs/métricas para monitorar quando rate limits são atingidos.

5. **Corrigir problema específico**: Investigar e corrigir o problema na rota `/api/v1/translations/material-types`.

---

**Data da Auditoria**: 2026-02-19
**Versão da API**: 1.0.0
