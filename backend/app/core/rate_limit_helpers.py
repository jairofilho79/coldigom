"""Helper functions para aplicar rate limiting em rotas públicas"""
from fastapi import Request


def apply_rate_limit(request: Request, limit_str: str):
    """Aplica rate limiting usando o limiter do app.
    
    Args:
        request: Objeto Request do FastAPI
        limit_str: String de limite no formato "X/hour" ou "X/minute"
    
    Raises:
        RateLimitExceeded: Se o limite for excedido
    """
    limiter = request.app.state.limiter
    # Criar função com request como argumento nomeado (requisito do slowapi)
    def rate_limited(request: Request):
        pass
    # Aplicar decorator e chamar
    decorated = limiter.limit(limit_str)(rate_limited)
    decorated(request=request)
