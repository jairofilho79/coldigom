#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para importar dados iniciais de CSV para o banco de dados
Importa: praise_tags e material_kinds
"""

import sys
import os
import csv
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.praise_tag import PraiseTag
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository


def import_praise_tags(csv_path: str, db: Session, dry_run: bool = False) -> tuple[int, int, int]:
    """Importa praise_tags do CSV"""
    repo = PraiseTagRepository(db)
    created_count = 0
    skipped_count = 0
    updated_count = 0
    
    if not os.path.exists(csv_path):
        print(f"❌ Arquivo não encontrado: {csv_path}")
        return created_count, skipped_count, updated_count
    
    print(f"\n📋 Importando PraiseTags de: {csv_path}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print()
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                tag_id_str = row.get('praise_tag_id', '').strip()
                tag_name = row.get('praise_tag_name', '').strip()
                
                if not tag_id_str or not tag_name:
                    print(f"⏭️  Linha ignorada (dados incompletos): {row}")
                    skipped_count += 1
                    continue
                
                try:
                    tag_id = UUID(tag_id_str)
                except ValueError:
                    print(f"❌ ID inválido: {tag_id_str} - {tag_name}")
                    skipped_count += 1
                    continue
                
                # Verifica se já existe por ID
                existing_by_id = repo.get_by_id(tag_id)
                if existing_by_id:
                    if existing_by_id.name != tag_name:
                        if dry_run:
                            print(f"  [DRY RUN] Atualizaria: {tag_id} - '{existing_by_id.name}' -> '{tag_name}'")
                        else:
                            existing_by_id.name = tag_name
                            repo.update(existing_by_id)
                            print(f"🔄 Atualizado: {tag_id} - '{existing_by_id.name}' -> '{tag_name}'")
                            updated_count += 1
                    else:
                        print(f"⏭️  Já existe (por ID): {tag_id} - {tag_name}")
                        skipped_count += 1
                    continue
                
                # Verifica se já existe por nome
                existing_by_name = repo.get_by_name(tag_name)
                if existing_by_name:
                    if dry_run:
                        print(f"  [DRY RUN] Ignoraria (já existe com outro ID): {existing_by_name.id} - {tag_name}")
                    else:
                        print(f"⏭️  Já existe (por nome, ID diferente): {existing_by_name.id} - {tag_name}")
                    skipped_count += 1
                    continue
                
                # Cria novo registro
                if dry_run:
                    print(f"  [DRY RUN] Criaria: {tag_id} - {tag_name}")
                else:
                    tag = PraiseTag(id=tag_id, name=tag_name)
                    repo.create(tag)
                    print(f"✅ Criado: {tag_id} - {tag_name}")
                    created_count += 1
        
        return created_count, skipped_count, updated_count
        
    except Exception as e:
        print(f"\n❌ Erro ao importar PraiseTags: {e}")
        import traceback
        traceback.print_exc()
        raise


def import_material_kinds(csv_path: str, db: Session, dry_run: bool = False) -> tuple[int, int, int]:
    """Importa material_kinds do CSV"""
    repo = MaterialKindRepository(db)
    created_count = 0
    skipped_count = 0
    updated_count = 0
    
    if not os.path.exists(csv_path):
        print(f"❌ Arquivo não encontrado: {csv_path}")
        return created_count, skipped_count, updated_count
    
    print(f"\n📋 Importando MaterialKinds de: {csv_path}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print()
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                kind_id_str = row.get('material_kind_id', '').strip()
                kind_name = row.get('material_kind_name', '').strip()
                
                if not kind_id_str or not kind_name:
                    print(f"⏭️  Linha ignorada (dados incompletos): {row}")
                    skipped_count += 1
                    continue
                
                try:
                    kind_id = UUID(kind_id_str)
                except ValueError:
                    print(f"❌ ID inválido: {kind_id_str} - {kind_name}")
                    skipped_count += 1
                    continue
                
                # Verifica se já existe por ID
                existing_by_id = repo.get_by_id(kind_id)
                if existing_by_id:
                    if existing_by_id.name != kind_name:
                        if dry_run:
                            print(f"  [DRY RUN] Atualizaria: {kind_id} - '{existing_by_id.name}' -> '{kind_name}'")
                        else:
                            existing_by_id.name = kind_name
                            repo.update(existing_by_id)
                            print(f"🔄 Atualizado: {kind_id} - '{existing_by_id.name}' -> '{kind_name}'")
                            updated_count += 1
                    else:
                        print(f"⏭️  Já existe (por ID): {kind_id} - {kind_name}")
                        skipped_count += 1
                    continue
                
                # Verifica se já existe por nome
                existing_by_name = repo.get_by_name(kind_name)
                if existing_by_name:
                    if dry_run:
                        print(f"  [DRY RUN] Ignoraria (já existe com outro ID): {existing_by_name.id} - {kind_name}")
                    else:
                        print(f"⏭️  Já existe (por nome, ID diferente): {existing_by_name.id} - {kind_name}")
                    skipped_count += 1
                    continue
                
                # Cria novo registro
                if dry_run:
                    print(f"  [DRY RUN] Criaria: {kind_id} - {kind_name}")
                else:
                    material_kind = MaterialKind(id=kind_id, name=kind_name)
                    repo.create(material_kind)
                    print(f"✅ Criado: {kind_id} - {kind_name}")
                    created_count += 1
        
        return created_count, skipped_count, updated_count
        
    except Exception as e:
        print(f"\n❌ Erro ao importar MaterialKinds: {e}")
        import traceback
        traceback.print_exc()
        raise


def main(praise_tags_csv: str = None, material_kinds_csv: str = None, dry_run: bool = False):
    """Função principal de importação"""
    db: Session = SessionLocal()
    
    try:
        # Default paths se não fornecidos
        script_dir = os.path.dirname(os.path.abspath(__file__))
        app_root = os.path.dirname(script_dir)  # /app no container Docker

        if not praise_tags_csv:
            candidates = [
                os.path.normpath(os.path.join(script_dir, '../../../assets2/praise_tags_unique.csv')),
                os.path.join(app_root, 'praise_tags_unique.csv'),   # /app/praise_tags_unique.csv
                '/Volumes/SSD 2TB SD/assets2/praise_tags_unique.csv',
            ]
            praise_tags_csv = next((p for p in candidates if os.path.exists(p)), candidates[0])

        if not material_kinds_csv:
            candidates = [
                os.path.normpath(os.path.join(script_dir, '../../../assets2/material_kinds_unique.csv')),
                os.path.join(app_root, 'material_kinds_unique.csv'),  # /app/material_kinds_unique.csv
                '/Volumes/SSD 2TB SD/assets2/material_kinds_unique.csv',
            ]
            material_kinds_csv = next((p for p in candidates if os.path.exists(p)), candidates[0])
        
        print("="*60)
        print("🌱 Importação de Dados Iniciais")
        print("="*60)
        
        total_created = 0
        total_skipped = 0
        total_updated = 0
        
        # Importa PraiseTags
        if os.path.exists(praise_tags_csv):
            try:
                created, skipped, updated = import_praise_tags(praise_tags_csv, db, dry_run)
                total_created += created
                total_skipped += skipped
                total_updated += updated
            except Exception as e:
                print(f"❌ Erro ao importar PraiseTags: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️  Arquivo não encontrado: {praise_tags_csv}")
        
        # Importa MaterialKinds
        if os.path.exists(material_kinds_csv):
            try:
                created, skipped, updated = import_material_kinds(material_kinds_csv, db, dry_run)
                total_created += created
                total_skipped += skipped
                total_updated += updated
            except Exception as e:
                print(f"❌ Erro ao importar MaterialKinds: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️  Arquivo não encontrado: {material_kinds_csv}")
        
        # Commit se não for dry_run
        if not dry_run:
            db.commit()
            print(f"\n💾 Commit realizado")
        
        # Resumo
        print(f"\n{'='*60}")
        print("📊 RESUMO DA IMPORTAÇÃO")
        print(f"{'='*60}")
        print(f"✅ Criados: {total_created}")
        print(f"🔄 Atualizados: {total_updated}")
        print(f"⏭️  Ignorados: {total_skipped}")
        print(f"📈 Total processados: {total_created + total_skipped + total_updated}")
        print(f"{'='*60}\n")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Erro geral: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Importa dados iniciais de CSV para o banco de dados'
    )
    parser.add_argument(
        '--praise-tags-csv',
        type=str,
        help='Caminho para o arquivo CSV de praise_tags (padrão: /Volumes/SSD 2TB SD/assets2/praise_tags_unique.csv)'
    )
    parser.add_argument(
        '--material-kinds-csv',
        type=str,
        help='Caminho para o arquivo CSV de material_kinds (padrão: /Volumes/SSD 2TB SD/assets2/material_kinds_unique.csv)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Modo de simulação (não faz alterações no banco)'
    )
    
    args = parser.parse_args()
    exit(main(
        praise_tags_csv=args.praise_tags_csv,
        material_kinds_csv=args.material_kinds_csv,
        dry_run=args.dry_run
    ))
