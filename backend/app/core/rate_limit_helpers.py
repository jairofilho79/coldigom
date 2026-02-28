"""Helper functions para aplicar rate limiting em rotas públicas"""
from fastapi import Request
from slowapi.errors import RateLimitExceeded
import logging

logger = logging.getLogger(__name__)


def apply_rate_limit(request: Request, limit_str: str):
    """Aplica rate limiting usando o limiter do app.
    
    Args:
        request: Objeto Request do FastAPI
        limit_str: String de limite no formato "X/hour" ou "X/minute"
    
    Raises:
        RateLimitExceeded: Se o limite for excedido
    """
    limiter = request.app.state.limiter
    
    # Criar uma função wrapper que será decorada
    # IMPORTANTE: A função deve aceitar request como primeiro parâmetro nomeado
    # para que o slowapi possa extrair a chave de rate limit corretamente
    def rate_limited_func(request: Request):
        # Função vazia - o slowapi apenas precisa verificar o limite
        return None
    
    try:
        # Aplicar o decorator limit() - o limiter já tem key_func configurada
        # Não passar key_func aqui para usar a mesma configurada no limiter
        decorated_func = limiter.limit(limit_str)(rate_limited_func)
        
        # Chamar a função decorada com o request
        # Se o limite for excedido, isso levantará RateLimitExceeded
        decorated_func(request=request)
        
        # Log para debug (pode ser removido em produção se necessário)
        # logger.debug(f"Rate limit aplicado: {limit_str} para {request.url.path}")
    except RateLimitExceeded:
        # Log do erro antes de re-raise
        logger.warning(
            f"Rate limit excedido: {limit_str} para rota {request.url.path} "
            f"(IP: {request.client.host if request.client else 'unknown'})"
        )
        # Re-raise para que o exception handler do FastAPI possa tratar
        raise
