from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    POSTGRES_USER: str = "praise_user"
    POSTGRES_PASSWORD: str = "praise_password"
    POSTGRES_DB: str = "praise_db"
    POSTGRES_PORT: int = 5432

    # Wasabi Storage
    WASABI_ACCESS_KEY: str
    WASABI_SECRET_KEY: str
    WASABI_ENDPOINT: str = "https://s3.wasabisys.com"
    WASABI_BUCKET: str
    WASABI_REGION: str = "us-east-1"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # API
    API_PORT: int = 8000
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()






