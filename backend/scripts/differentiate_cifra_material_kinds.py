#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para diferenciar os tipos de cifra criando 2 novos Material Kinds:
- Chord Chart I (para Cifra I / Cifra nível I)
- Chord Chart II (para Cifra II / Cifra nível II)

E mantendo "Chord Chart" apenas para cifras sem nível específico.
"""

import sys
import os
import yaml
import re
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.application.services.metadata_sync_service import sync_praise_to_metadata
from app.core.config import settings


def create_new_material_kinds(db: Session, dry_run: bool = False) -> tuple[UUID, UUID]:
    """Cria os 2 novos Material Kinds: Chord Chart I e Chord Chart II"""
    material_kind_repo = MaterialKindRepository(db)
    
    # Verificar se já existem
    chord_chart_i = material_kind_repo.get_by_name("Chord Chart I")
    chord_chart_ii = material_kind_repo.get_by_name("Chord Chart II")
    
    if chord_chart_i and chord_chart_ii:
        print("✓ Material Kinds 'Chord Chart I' e 'Chord Chart II' já existem")
        return chord_chart_i.id, chord_chart_ii.id
    
    if not dry_run:
        if not chord_chart_i:
            chord_chart_i = MaterialKind(name="Chord Chart I")
            chord_chart_i = material_kind_repo.create(chord_chart_i)
            print(f"✓ Criado Material Kind 'Chord Chart I' (ID: {chord_chart_i.id})")
        else:
            print(f"✓ Material Kind 'Chord Chart I' já existe (ID: {chord_chart_i.id})")
        
        if not chord_chart_ii:
            chord_chart_ii = MaterialKind(name="Chord Chart II")
            chord_chart_ii = material_kind_repo.create(chord_chart_ii)
            print(f"✓ Criado Material Kind 'Chord Chart II' (ID: {chord_chart_ii.id})")
        else:
            print(f"✓ Material Kind 'Chord Chart II' já existe (ID: {chord_chart_ii.id})")
        
        return chord_chart_i.id, chord_chart_ii.id
    else:
        print("[DRY RUN] Seriam criados Material Kinds 'Chord Chart I' e 'Chord Chart II'")
        # Retornar UUIDs fictícios para dry run
        return UUID('00000000-0000-0000-0000-000000000001'), UUID('00000000-0000-0000-0000-000000000002')


def detect_cifra_type(file_path: str) -> str:
    """
    Detecta o tipo de cifra baseado no file_path_legacy
    Retorna: 'I', 'II', ou None (para cifra sem nível)
    """
    file_path_lower = file_path.lower()
    
    # Padrões para Cifra I
    patterns_i = [
        r'cifra\s+nível\s+i\b',
        r'cifra\s+i\b',
        r'cifra\s+i\.pdf',
    ]
    
    # Padrões para Cifra II
    patterns_ii = [
        r'cifra\s+nível\s+ii\b',
        r'cifra\s+ii\b',
        r'cifra\s+ii\.pdf',
    ]
    
    # Verificar Cifra II primeiro (para evitar match parcial de "II" em "I")
    for pattern in patterns_ii:
        if re.search(pattern, file_path_lower):
            return 'II'
    
    # Verificar Cifra I
    for pattern in patterns_i:
        if re.search(pattern, file_path_lower):
            return 'I'
    
    return None


def load_metadata_file(metadata_path: Path) -> dict:
    """Carrega e parseia um arquivo de metadados YAML"""
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = yaml.safe_load(f)
            return metadata
    except Exception as e:
        print(f"Erro ao carregar {metadata_path}: {e}")
        return {}


def update_materials_from_metadata(
    db: Session,
    storage_path: Path,
    chord_chart_id: UUID,
    chord_chart_i_id: UUID,
    chord_chart_ii_id: UUID,
    dry_run: bool = False
) -> dict:
    """
    Atualiza os materiais baseado nos metadata.yml files
    Retorna estatísticas: {'updated': int, 'skipped': int, 'errors': list}
    """
    material_repo = PraiseMaterialRepository(db)
    material_kind_repo = MaterialKindRepository(db)
    praise_repo = PraiseRepository(db)
    
    stats = {'updated': 0, 'skipped': 0, 'errors': []}
    
    # Buscar todos os metadata.yml files
    praises_path = storage_path / "praises"
    if not praises_path.exists():
        print(f"❌ Diretório não encontrado: {praises_path}")
        return stats
    
    metadata_files = list(praises_path.glob("*/metadata.yml"))
    print(f"\n📁 Encontrados {len(metadata_files)} arquivos metadata.yml")
    
    # Buscar o Material Kind "Chord Chart" original
    chord_chart_kind = material_kind_repo.get_by_name("Chord Chart")
    if not chord_chart_kind:
        print("❌ Material Kind 'Chord Chart' não encontrado no banco!")
        return stats
    
    chord_chart_uuid = chord_chart_kind.id
    
    for metadata_path in metadata_files:
        metadata = load_metadata_file(metadata_path)
        if not metadata:
            continue
        
        praise_id_str = metadata.get('praise_id')
        if not praise_id_str:
            continue
        
        try:
            praise_id = UUID(praise_id_str)
        except ValueError:
            continue
        
        praise_name = metadata.get('praise_name', 'Desconhecido')
        materials_meta = metadata.get('praise_materiais', [])
        
        updated_in_praise = False
        
        for material_meta in materials_meta:
            material_id_str = material_meta.get('praise_material_id')
            file_path_legacy = material_meta.get('file_path_legacy', '')
            current_kind_id_str = material_meta.get('material_kind', '')
            
            if not material_id_str or not file_path_legacy:
                continue
            
            # Verificar se o material_kind atual é "Chord Chart"
            try:
                current_kind_id = UUID(current_kind_id_str)
            except ValueError:
                continue
            
            if str(current_kind_id) != str(chord_chart_uuid):
                continue
            
            # Detectar o tipo de cifra
            cifra_type = detect_cifra_type(file_path_legacy)
            
            if cifra_type == 'I':
                new_kind_id = chord_chart_i_id
                new_kind_name = 'Chord Chart I'
            elif cifra_type == 'II':
                new_kind_id = chord_chart_ii_id
                new_kind_name = 'Chord Chart II'
            else:
                # Mantém como "Chord Chart" original
                stats['skipped'] += 1
                continue
            
            # Buscar o material no banco
            try:
                material_id = UUID(material_id_str)
                material = material_repo.get_by_id(material_id)
                
                if not material:
                    stats['errors'].append(f"Material {material_id_str} não encontrado no banco")
                    continue
                
                if str(material.material_kind_id) == str(new_kind_id):
                    # Já está correto
                    continue
                
                print(f"\n📝 {praise_name}")
                print(f"   Arquivo: {file_path_legacy}")
                print(f"   Material ID: {material_id_str}")
                print(f"   Atual: Chord Chart → Novo: {new_kind_name}")
                
                if not dry_run:
                    material.material_kind_id = new_kind_id
                    material_repo.update(material)
                    updated_in_praise = True
                    stats['updated'] += 1
                    print(f"   ✅ Atualizado!")
                else:
                    print(f"   [DRY RUN] Seria atualizado")
                    stats['updated'] += 1
                
            except Exception as e:
                stats['errors'].append(f"Erro ao atualizar material {material_id_str}: {e}")
        
        # Sincronizar metadata.yml se houve atualizações
        if updated_in_praise and not dry_run:
            try:
                praise = praise_repo.get_by_id(praise_id)
                if praise:
                    sync_praise_to_metadata(praise)
            except Exception as e:
                stats['errors'].append(f"Erro ao sincronizar metadata para praise {praise_id}: {e}")
    
    return stats


def update_translations_file(dry_run: bool = False):
    """Atualiza o arquivo create_pt_br_translations.py com as novas traduções"""
    translations_file = Path(__file__).parent / "create_pt_br_translations.py"
    
    if not translations_file.exists():
        print(f"⚠️  Arquivo de traduções não encontrado: {translations_file}")
        return
    
    with open(translations_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Verificar se as traduções já existem
    if '"Chord Chart I": "Cifra I"' in content:
        print("✓ Traduções já existem no arquivo create_pt_br_translations.py")
        return
    
    # Adicionar as novas traduções após "Chord Chart": "Cifra",
    pattern = r'("Chord Chart": "Cifra",)'
    replacement = r'\1\n    "Chord Chart I": "Cifra I",\n    "Chord Chart II": "Cifra II",'
    
    new_content = re.sub(pattern, replacement, content)
    
    if new_content != content:
        if not dry_run:
            with open(translations_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print("✓ Arquivo create_pt_br_translations.py atualizado com as novas traduções")
        else:
            print("[DRY RUN] Arquivo create_pt_br_translations.py seria atualizado")


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Diferencia tipos de cifra criando Material Kinds separados'
    )
    parser.add_argument(
        '--storage-path',
        type=str,
        default=None,
        help='Caminho para o diretório storage/assets (padrão: STORAGE_LOCAL_PATH do config)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Modo de simulação (não faz alterações)'
    )
    
    args = parser.parse_args()
    
    # Determinar o caminho do storage
    if args.storage_path:
        storage_path = Path(args.storage_path)
    else:
        storage_path = Path(settings.STORAGE_LOCAL_PATH)
        if not storage_path.exists():
            # Fallback para path dentro do container
            alt = Path("/storage/assets")
            if alt.exists():
                storage_path = alt
    
    if not storage_path.exists():
        print(f"❌ Diretório de storage não encontrado: {storage_path}")
        return 1
    
    print("=" * 80)
    print("Diferenciação de Tipos de Cifra")
    print("=" * 80)
    if args.dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print(f"📁 Storage path: {storage_path}")
    print("=" * 80)
    
    db: Session = SessionLocal()
    try:
        # 1. Criar os novos Material Kinds
        print("\n1️⃣  Criando novos Material Kinds...")
        chord_chart_i_id, chord_chart_ii_id = create_new_material_kinds(db, dry_run=args.dry_run)
        
        # 2. Buscar o ID do Chord Chart original
        material_kind_repo = MaterialKindRepository(db)
        chord_chart_kind = material_kind_repo.get_by_name("Chord Chart")
        if not chord_chart_kind:
            print("❌ Material Kind 'Chord Chart' não encontrado!")
            return 1
        
        # 3. Atualizar materiais baseado nos metadata.yml
        print("\n2️⃣  Atualizando materiais baseado nos metadata.yml...")
        stats = update_materials_from_metadata(
            db,
            storage_path,
            chord_chart_kind.id,
            chord_chart_i_id,
            chord_chart_ii_id,
            dry_run=args.dry_run
        )
        
        # 4. Atualizar arquivo de traduções
        print("\n3️⃣  Atualizando arquivo de traduções...")
        update_translations_file(dry_run=args.dry_run)
        
        # Resumo
        print("\n" + "=" * 80)
        print("📊 RESUMO")
        print("=" * 80)
        print(f"Materiais atualizados: {stats['updated']}")
        print(f"Materiais mantidos (sem nível): {stats['skipped']}")
        if stats['errors']:
            print(f"Erros: {len(stats['errors'])}")
            for error in stats['errors'][:10]:  # Mostrar apenas os primeiros 10
                print(f"  - {error}")
            if len(stats['errors']) > 10:
                print(f"  ... e mais {len(stats['errors']) - 10} erros")
        
        if args.dry_run:
            print("\n⚠️  MODO DRY RUN - Nenhuma alteração foi feita")
            print("Execute sem --dry-run para aplicar as alterações")
        else:
            print("\n✅ Processo concluído!")
            print("\n📝 Próximos passos:")
            print("   1. Execute o script create_pt_br_translations.py para criar as traduções")
            print("   2. Verifique se os metadata.yml files foram atualizados corretamente")
        
        print("=" * 80)
        
        return 0 if len(stats['errors']) == 0 else 1
        
    except Exception as e:
        print(f"\n❌ Erro durante a execução: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == '__main__':
    sys.exit(main())
