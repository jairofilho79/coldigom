#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para trocar traduções de Material Kinds entre pt-BR e en-US
Este script troca os valores de translated_name entre as duas linguagens
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind_translation import MaterialKindTranslation
from app.infrastructure.database.repositories.material_kind_translation_repository import MaterialKindTranslationRepository


def swap_translations(db: Session, language1: str = "pt-BR", language2: str = "en-US"):
    """
    Troca as traduções entre duas linguagens para Material Kinds
    
    Args:
        db: Sessão do banco de dados
        language1: Código da primeira linguagem (padrão: pt-BR)
        language2: Código da segunda linguagem (padrão: en-US)
    """
    repo = MaterialKindTranslationRepository(db)
    
    # Busca todas as traduções de language1
    translations_l1 = repo.get_by_language(language1)
    
    # Busca todas as traduções de language2
    translations_l2 = repo.get_by_language(language2)
    
    # Cria um dicionário para acesso rápido por material_kind_id
    l1_dict = {t.material_kind_id: t for t in translations_l1}
    l2_dict = {t.material_kind_id: t for t in translations_l2}
    
    # Encontra os material_kind_ids que têm tradução em ambas as linguagens
    common_ids = set(l1_dict.keys()) & set(l2_dict.keys())
    
    if not common_ids:
        print(f"Nenhuma tradução comum encontrada entre {language1} e {language2}")
        return
    
    print(f"Encontradas {len(common_ids)} traduções comuns entre {language1} e {language2}")
    print("\nTrocando traduções...\n")
    
    swapped_count = 0
    for material_kind_id in common_ids:
        trans_l1 = l1_dict[material_kind_id]
        trans_l2 = l2_dict[material_kind_id]
        
        # Armazena os valores atuais
        temp_name = trans_l1.translated_name
        
        # Troca os valores
        trans_l1.translated_name = trans_l2.translated_name
        trans_l2.translated_name = temp_name
        
        # Atualiza no banco
        repo.update(trans_l1)
        repo.update(trans_l2)
        
        swapped_count += 1
        print(f"✓ {material_kind_id}: '{trans_l2.translated_name}' <-> '{trans_l1.translated_name}'")
    
    print(f"\n✅ {swapped_count} traduções trocadas com sucesso!")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Troca traduções de Material Kinds entre duas linguagens")
    parser.add_argument(
        "--language1",
        default="pt-BR",
        help="Código da primeira linguagem (padrão: pt-BR)"
    )
    parser.add_argument(
        "--language2",
        default="en-US",
        help="Código da segunda linguagem (padrão: en-US)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o que seria feito sem fazer alterações"
    )
    
    args = parser.parse_args()
    
    db = SessionLocal()
    
    try:
        if args.dry_run:
            print("🔍 MODO DRY-RUN - Nenhuma alteração será feita\n")
            repo = MaterialKindTranslationRepository(db)
            
            translations_l1 = repo.get_by_language(args.language1)
            translations_l2 = repo.get_by_language(args.language2)
            
            l1_dict = {t.material_kind_id: t for t in translations_l1}
            l2_dict = {t.material_kind_id: t for t in translations_l2}
            common_ids = set(l1_dict.keys()) & set(l2_dict.keys())
            
            print(f"Encontradas {len(common_ids)} traduções comuns entre {args.language1} e {args.language2}\n")
            print("Traduções que seriam trocadas:\n")
            
            for material_kind_id in common_ids:
                trans_l1 = l1_dict[material_kind_id]
                trans_l2 = l2_dict[material_kind_id]
                print(f"  {material_kind_id}:")
                print(f"    {args.language1}: '{trans_l1.translated_name}' -> '{trans_l2.translated_name}'")
                print(f"    {args.language2}: '{trans_l2.translated_name}' -> '{trans_l1.translated_name}'")
                print()
        else:
            print(f"🔄 Trocando traduções entre {args.language1} e {args.language2}...\n")
            swap_translations(db, args.language1, args.language2)
            print("\n✅ Concluído!")
    except Exception as e:
        print(f"❌ Erro: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
