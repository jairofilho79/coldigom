#!/usr/bin/env python3
"""Script para verificar se is_old e old_description estão sendo salvos no banco.
Uso: docker compose run --rm backend python scripts/check_is_old_columns.py
Ou com python local: cd backend && python scripts/check_is_old_columns.py (com DATABASE_URL no .env)
"""
import os
import sys

# Adiciona o app ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings


def main():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        r = conn.execute(text("SELECT id, is_old, old_description, path FROM praise_materials ORDER BY id LIMIT 10"))
        rows = r.fetchall()
    print("praise_materials (últimos 10):")
    print("-" * 80)
    for row in rows:
        print(f"  id={row[0]}  is_old={row[1]}  old_description={repr(row[2])}  path={str(row[3])[:50]}...")
    print("-" * 80)
    print(f"Total: {len(rows)} linhas. Confira se is_old e old_description aparecem corretamente.")


if __name__ == "__main__":
    main()
