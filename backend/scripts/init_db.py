#!/usr/bin/env python3
"""
Script para inicializar o banco de dados com dados básicos
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.user import User
from app.core.security import get_password_hash
from app.infrastructure.database.repositories.user_repository import UserRepository


def init_db():
    """Cria um usuário admin padrão se não existir"""
    db: Session = SessionLocal()
    try:
        user_repo = UserRepository(db)
        
        # Verifica se já existe um usuário admin
        admin = user_repo.get_by_username("admin")
        if admin:
            print("Usuário admin já existe")
            return
        
        # Cria usuário admin padrão
        admin_user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            is_active=True
        )
        user_repo.create(admin_user)
        print("Usuário admin criado com sucesso!")
        print("Username: admin")
        print("Password: admin123")
        print("IMPORTANTE: Altere a senha após o primeiro login!")
        
    except Exception as e:
        print(f"Erro ao inicializar banco de dados: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    init_db()






