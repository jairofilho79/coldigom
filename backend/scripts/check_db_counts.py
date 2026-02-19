#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para verificar a quantidade de registros nas tabelas de praises e materials
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.infrastructure.database.database import SessionLocal
from app.domain.models.praise import Praise
from app.domain.models.praise_material import PraiseMaterial


def check_counts():
    """Verifica e exibe a contagem de registros"""
    db: Session = SessionLocal()
    
    try:
        # Contar praises
        praise_count = db.query(func.count(Praise.id)).scalar()
        
        # Contar materials
        material_count = db.query(func.count(PraiseMaterial.id)).scalar()
        
        # Contar praises com materials
        praises_with_materials = db.query(func.count(func.distinct(PraiseMaterial.praise_id))).scalar()
        
        # Contar materials por praise (média)
        avg_materials_per_praise = None
        if praise_count > 0:
            avg_materials_per_praise = material_count / praise_count
        
        # Estatísticas adicionais
        praises_without_materials = praise_count - praises_with_materials
        
        print("=" * 60)
        print("📊 ESTATÍSTICAS DO BANCO DE DADOS")
        print("=" * 60)
        print()
        print(f"✅ Total de Praises: {praise_count}")
        print(f"✅ Total de Materials: {material_count}")
        print()
        print("📈 Detalhes:")
        print(f"   • Praises com materials: {praises_with_materials}")
        print(f"   • Praises sem materials: {praises_without_materials}")
        if avg_materials_per_praise:
            print(f"   • Média de materials por praise: {avg_materials_per_praise:.2f}")
        print()
        
        # Verificar se está próximo do esperado (mais de 1800)
        if praise_count >= 1800:
            print(f"✅ Status: OK - O banco tem {praise_count} praises (esperado: >1800)")
        else:
            print(f"⚠️  Status: ATENÇÃO - O banco tem apenas {praise_count} praises (esperado: >1800)")
        
        if material_count > 0:
            print(f"✅ Status: OK - O banco tem {material_count} materials")
        else:
            print(f"❌ Status: ERRO - Nenhum material encontrado no banco")
        
        print()
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Erro ao verificar contagens: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()
    
    return 0


if __name__ == "__main__":
    exit(check_counts())
