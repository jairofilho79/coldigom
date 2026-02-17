# Plano de Rotas Públicas - Coldigom API

## Objetivo
Liberar rotas GET de leitura de dados públicos (praises, tags, materiais, etc.) para consumo pela aplicação Coletânea Digital, mantendo segurança através de rate limiting rigoroso.

## Levantamento de Rotas GET

### Rotas Atualmente Protegidas por Autenticação

#### Praises (`/api/v1/praises`)
- ✅ **GET `/`** - Listar praises (com paginação, busca, filtros)
- ✅ **GET `/{praise_id}`** - Obter um praise específico
- ❌ **GET `/download-by-material-kind`** - Download ZIP (deve permanecer protegido)
- ❌ **GET `/{praise_id}/download-zip`** - Download ZIP (deve permanecer protegido)

#### Praise Tags (`/api/v1/praise-tags`)
- ✅ **GET `/`** - Listar todas as tags
- ✅ **GET `/{tag_id}`** - Obter uma tag específica

#### Material Kinds (`/api/v1/material-kinds`)
- ✅ **GET `/`** - Listar todos os tipos de material
- ✅ **GET `/{kind_id}`** - Obter um tipo de material específico

#### Material Types (`/api/v1/material-types`)
- ✅ **GET `/`** - Listar todos os tipos de material
- ✅ **GET `/{type_id}`** - Obter um tipo de material específico

#### Praise Materials (`/api/v1/praise-materials`)
- ✅ **GET `/`** - Listar materiais
- ✅ **GET `/batch`** - Listar materiais em lote
- ✅ **GET `/{material_id}`** - Obter um material específico
- ✅ **GET `/{material_id}/download-url`** - Obter URL de download (pode ser público com rate limiting)
- ❌ **GET `/{material_id}/download`** - Download direto (deve permanecer protegido ou ter rate limiting muito rigoroso)
- ❌ **GET `/batch-download`** - Download em lote (deve permanecer protegido)

#### Languages (`/api/v1/languages`)
- ✅ **GET `/`** - Listar idiomas
- ✅ **GET `/{code}`** - Obter um idioma específico

#### Translations (`/api/v1/translations`)
- ✅ **GET `/material-kinds`** - Listar traduções de material kinds
- ✅ **GET `/material-kinds/{translation_id}`** - Obter tradução específica
- ✅ **GET `/praise-tags`** - Listar traduções de tags
- ✅ **GET `/praise-tags/{translation_id}`** - Obter tradução específica
- ✅ **GET `/material-types`** - Listar traduções de tipos de material
- ✅ **GET `/material-types/{translation_id}`** - Obter tradução específica

### Rotas que DEVEM Permanecer Protegidas

#### Autenticação (`/api/v1/auth`)
- ❌ **GET `/me`** - Informações do usuário atual (requer autenticação)

#### Auditoria (`/api/v1/audit-logs`)
- ❌ Todas as rotas GET (dados sensíveis)

#### Proteção de Dados (`/api/v1/data-protection`)
- ❌ Todas as rotas (dados sensíveis)

#### Snapshots (`/api/v1/snapshots`)
- ❌ Todas as rotas (operações administrativas)

#### Todas as Rotas POST, PUT, DELETE
- ❌ Todas devem permanecer protegidas

## Plano de Implementação

### 1. Criar Dependência de Autenticação Opcional

Criar uma nova dependência `get_current_user_optional` que retorna `None` se não houver token, mas valida o token se fornecido.

**Arquivo**: `backend/app/core/dependencies.py`

```python
async def get_current_user_optional(
    token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Obtém o usuário atual se o token for fornecido, caso contrário retorna None"""
    if token is None:
        return None
    
    try:
        payload = decode_access_token(token)
        if payload is None:
            return None

        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            return None

        user_id = UUID(user_id_str)
        user_repo = UserRepository(db)
        user = user_repo.get_by_id(user_id)
        return user
    except Exception:
        return None
```

### 2. Aplicar Rate Limiting Rigoroso nas Rotas Públicas

Usar `slowapi` para aplicar rate limiting baseado em IP nas rotas públicas:

**Limites Propostos:**
- **Rotas de listagem**: 100 requisições/hora por IP
- **Rotas de detalhes**: 200 requisições/hora por IP
- **Rotas de download URL**: 50 requisições/hora por IP

**Exemplo de implementação:**

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

@router.get("/", response_model=List[PraiseResponse])
@limiter.limit("100/hour")
def list_praises(
    request: Request,  # Adicionar Request para rate limiting
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    # ... outros parâmetros
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)  # Opcional
):
    """Lista todos os praises com paginação"""
    # Rate limiting já aplicado pelo decorator
    service = PraiseService(db)
    praises = service.get_all(...)
    return praises
```

### 3. Estratégia de Segurança

#### Rate Limiting por IP
- **Vantagem**: Protege contra abuso mesmo sem autenticação
- **Limitação**: IPs compartilhados (NAT, proxies) podem ser afetados
- **Mitigação**: Limites generosos mas suficientes para prevenir abuso

#### Rate Limiting por Token (quando autenticado)
- Usuários autenticados podem ter limites maiores
- Implementar lógica condicional baseada em `current_user`

#### Monitoramento
- Logar todas as requisições públicas para análise
- Alertar sobre padrões suspeitos (muitas requisições do mesmo IP)

### 4. Ordem de Implementação

1. ✅ Criar `get_current_user_optional` em `dependencies.py`
2. ✅ Atualizar rotas de **Praises** (GET `/` e GET `/{praise_id}`)
3. ✅ Atualizar rotas de **Praise Tags** (GET `/` e GET `/{tag_id}`)
4. ✅ Atualizar rotas de **Material Kinds** (GET `/` e GET `/{kind_id}`)
5. ✅ Atualizar rotas de **Material Types** (GET `/` e GET `/{type_id}`)
6. ✅ Atualizar rotas de **Praise Materials** (GET `/`, GET `/batch`, GET `/{material_id}`, GET `/{material_id}/download-url`)
7. ✅ Atualizar rotas de **Languages** (GET `/` e GET `/{code}`)
8. ✅ Atualizar rotas de **Translations** (todos os GETs)
9. ✅ Testar rate limiting
10. ✅ Documentar mudanças

### 5. Configuração de Rate Limiting

**Arquivo**: `backend/app/core/config.py`

```python
# Rate Limiting Configuration
PUBLIC_ROUTES_RATE_LIMIT: str = "100/hour"  # Para listagens
PUBLIC_ROUTES_DETAIL_RATE_LIMIT: str = "200/hour"  # Para detalhes
PUBLIC_ROUTES_DOWNLOAD_URL_RATE_LIMIT: str = "50/hour"  # Para URLs de download
```

### 6. Testes

- ✅ Testar acesso sem autenticação
- ✅ Testar rate limiting (fazer 101 requisições e verificar bloqueio)
- ✅ Testar acesso com autenticação (deve funcionar normalmente)
- ✅ Testar CORS com rotas públicas
- ✅ Testar performance sob carga

## Considerações de Segurança

### ✅ Mitigações Implementadas

1. **Rate Limiting por IP**: Previne abuso básico
2. **Limites de Paginação**: `limit` máximo de 100 itens por requisição
3. **Validação de Parâmetros**: Query parameters validados
4. **CORS Configurado**: Apenas origens permitidas
5. **Logging**: Todas as requisições são logadas

### ⚠️ Riscos e Mitigações

1. **Risco**: Abuso de rate limiting usando múltiplos IPs
   - **Mitigação**: Monitorar padrões suspeitos e implementar bloqueio de IPs se necessário

2. **Risco**: Scraping em massa de dados
   - **Mitigação**: Rate limiting + limites de paginação + monitoramento

3. **Risco**: DDoS através de rotas públicas
   - **Mitigação**: Rate limiting + possível uso de CDN/WAF em produção

### 📊 Métricas de Monitoramento

- Requisições por IP por hora
- Taxa de erro 429 (Rate Limit Exceeded)
- Padrões de uso suspeitos
- Performance das rotas públicas

## Próximos Passos

1. Implementar `get_current_user_optional`
2. Atualizar rotas uma por uma, começando por `/api/v1/praises`
3. Testar cada rota após atualização
4. Documentar mudanças na API
5. Atualizar documentação do Coletânea Digital
