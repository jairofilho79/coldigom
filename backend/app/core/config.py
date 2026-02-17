from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union
import warnings
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    POSTGRES_USER: str = "praise_user"
    POSTGRES_PASSWORD: str = "praise_password"
    POSTGRES_DB: str = "praise_db"
    POSTGRES_PORT: int = 5432

    # Deployment Configuration
    DEPLOYMENT_ENV: str = "dev"  # dev ou prod
    DEPLOYMENT_HOST: str = ""  # IP local ou URI do VPS

    # Storage Configuration (modo local para produção beta)
    STORAGE_MODE: str = "local"  # local (wasabi desabilitado temporariamente)
    
    # Wasabi Storage (desabilitado temporariamente - será usado após fase beta)
    # WASABI_ACCESS_KEY: str = ""
    # WASABI_SECRET_KEY: str = ""
    # WASABI_ENDPOINT: str = "https://s3.wasabisys.com"
    # WASABI_BUCKET: str = ""
    # WASABI_REGION: str = "us-east-1"
    
    # Local Storage (usado quando STORAGE_MODE=local)
    STORAGE_LOCAL_PATH: str = "/storage/assets"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # API
    API_PORT: int = 8000
    CORS_ORIGINS: Union[str, List[str]] = "*"
    
    # Nginx (para configuração do docker-compose, não usado pela aplicação Python)
    NGINX_PORT: int = 8080

    @field_validator('CORS_ORIGINS', mode='after')
    @classmethod
    def validate_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Valida CORS_ORIGINS e alerta sobre wildcard em produção"""
        if isinstance(v, str):
            if v == "*" or v == "":
                parsed = ["*"]
            else:
                parsed = [origin.strip() for origin in v.split(",") if origin.strip()]
        else:
            parsed = v if isinstance(v, list) else ["*"]


        # Verificar se está em produção e usando wildcard
        deployment_env = os.getenv("DEPLOYMENT_ENV", "dev")
        if deployment_env == "prod" and "*" in parsed:
            warnings.warn(
                "⚠️  SECURITY WARNING: CORS_ORIGINS is set to '*' in production environment. "
                "This is a security risk. Please set specific origins in your .env.prod file:\n"
                "CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com",
                UserWarning,
                stacklevel=2
            )

        return parsed

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
    )


settings = Settings()






