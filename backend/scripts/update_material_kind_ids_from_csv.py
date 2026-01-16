#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para atualizar os IDs dos MaterialKinds existentes para corresponder ao CSV
Isso atualiza os IDs diretamente no banco de dados
"""

import sys
import os
import csv
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.infrastructure.database.database import SessionLocal, engine
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


def update_material_kind_ids_from_csv(db: Session, csv_path: Path, dry_run: bool = False):
    """Atualiza os IDs dos MaterialKinds para corresponder ao CSV"""
    if not csv_path.exists():
        print(f"❌ Arquivo não encontrado: {csv_path}")
        return False
    
    print(f"\n🔄 Atualizando IDs dos MaterialKinds de: {csv_path}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print("=" * 80)
    
    repo = MaterialKindRepository(db)
    updated_count = 0
    errors = []
    
    # Ler CSV e criar mapeamento nome -> ID correto
    csv_mapping = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            material_kind_id_str = row.get('material_kind_id', '').strip()
            material_kind_name = row.get('material_kind_name', '').strip()
            if material_kind_id_str and material_kind_name:
                csv_mapping[material_kind_name] = material_kind_id_str
    
    if not dry_run:
        # Desabilitar temporariamente a foreign key constraint
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE praise_materials DROP CONSTRAINT IF EXISTS praise_materials_material_kind_id_fkey"))
            conn.commit()
            print("🔓 Foreign key constraint desabilitada temporariamente")
    
    # Para cada entrada do CSV, atualizar o MaterialKind correspondente
    for material_kind_name, correct_id_str in csv_mapping.items():
        try:
            correct_id = UUID(correct_id_str)
        except ValueError:
            print(f"⚠️  ID inválido no CSV: {correct_id_str} para '{material_kind_name}'")
            continue
        
        # Buscar MaterialKind por nome
        existing = repo.get_by_name(material_kind_name)
        if not existing:
            print(f"⚠️  MaterialKind '{material_kind_name}' não encontrado no banco")
            continue
        
        # Se o ID já está correto, pular
        if str(existing.id) == correct_id_str:
            continue
        
        print(f"🔄 Atualizando: {material_kind_name}")
        print(f"   ID atual: {existing.id}")
        print(f"   ID correto: {correct_id_str}")
        
        if not dry_run:
            # Verificar se o ID correto já existe
            existing_with_correct_id = repo.get_by_id(correct_id)
            if existing_with_correct_id:
                if existing_with_correct_id.name == material_kind_name:
                    # Já existe com o ID correto, apenas atualizar referências
                    print(f"   ⚠️  MaterialKind com ID {correct_id_str} já existe com mesmo nome")
                    # Atualizar referências nos materiais
                    with engine.connect() as conn:
                        conn.execute(text(
                            "UPDATE praise_materials SET material_kind_id = :new_id WHERE material_kind_id = :old_id"
                        ), {"new_id": correct_id, "old_id": existing.id})
                        conn.commit()
                    print(f"   ✅ Referências atualizadas")
                else:
                    print(f"   ❌ ID {correct_id_str} já está em uso por '{existing_with_correct_id.name}'")
                    errors.append({
                        'name': material_kind_name,
                        'old_id': str(existing.id),
                        'correct_id': correct_id_str,
                        'error': f'ID já está em uso por outro MaterialKind'
                    })
                    continue
            else:
                # Estratégia: atualizar referências, remover antigo, criar novo com ID correto
                # (Foreign key já está desabilitada)
                with engine.connect() as conn:
                    trans = conn.begin()
                    try:
                        # 1. Atualizar referências nos materiais primeiro
                        conn.execute(text(
                            "UPDATE praise_materials SET material_kind_id = :new_id WHERE material_kind_id = :old_id"
                        ), {"new_id": correct_id, "old_id": existing.id})
                        
                        # 2. Remover MaterialKind antigo
                        conn.execute(text(
                            "DELETE FROM material_kinds WHERE id = :old_id"
                        ), {"old_id": existing.id})
                        
                        # 3. Criar novo MaterialKind com ID correto (ou atualizar se já existir)
                        conn.execute(text(
                            "INSERT INTO material_kinds (id, name) VALUES (:id, :name) "
                            "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"
                        ), {"id": correct_id, "name": material_kind_name})
                        
                        trans.commit()
                        print(f"   ✅ ID atualizado")
                        updated_count += 1
                    except Exception as e:
                        trans.rollback()
                        print(f"   ❌ Erro: {e}")
                        errors.append({
                            'name': material_kind_name,
                            'old_id': str(existing.id),
                            'correct_id': correct_id_str,
                            'error': str(e)
                        })
        else:
            print(f"   [DRY RUN] Seria atualizado")
            updated_count += 1
    
    if not dry_run:
        # Reabilitar a foreign key constraint
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE praise_materials ADD CONSTRAINT praise_materials_material_kind_id_fkey "
                "FOREIGN KEY (material_kind_id) REFERENCES material_kinds(id)"
            ))
            conn.commit()
            print("\n🔒 Foreign key constraint reabilitada")
    
    print(f"\n{'📊 Resumo:' if not dry_run else '📊 Resumo (DRY RUN):'}")
    print(f"   IDs atualizados: {updated_count}")
    if errors:
        print(f"   Erros: {len(errors)}")
        for error in errors:
            print(f"      - {error['name']}: {error['error']}")
    
    return len(errors) == 0


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Atualiza IDs dos MaterialKinds para corresponder ao CSV')
    parser.add_argument('csv_path', type=str, help='Caminho para o arquivo CSV')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação (não faz alterações)')
    
    args = parser.parse_args()
    
    csv_path = Path(args.csv_path)
    
    db: Session = SessionLocal()
    try:
        success = update_material_kind_ids_from_csv(db, csv_path, dry_run=args.dry_run)
        if success:
            if not args.dry_run:
                print("\n✅ Atualização concluída com sucesso!")
            else:
                print("\n✅ Verificação concluída! Use sem --dry-run para atualizar os IDs.")
            return 0
        else:
            print("\n❌ Alguns erros ocorreram durante a atualização!")
            return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
