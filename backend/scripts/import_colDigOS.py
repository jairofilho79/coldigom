#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para importar arquivos do ColDigOS para Wasabi e banco de dados
Este script:
1. Lê metadados YAML de cada praise
2. Faz upload dos arquivos para Wasabi
3. Cria/atualiza registros no banco de dados PostgreSQL
"""

import sys
import os
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4
import mimetypes

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.praise import Praise
from app.domain.models.praise_material import PraiseMaterial, MaterialType
from app.domain.models.praise_tag import PraiseTag
from app.domain.models.material_kind import MaterialKind
from app.infrastructure.storage.storage_factory import get_storage_client
from app.infrastructure.storage.storage_client import StorageClient
from app.application.services.praise_service import PraiseService
from app.application.services.praise_tag_service import PraiseTagService
from app.application.services.material_kind_service import MaterialKindService
from app.application.services.praise_material_service import PraiseMaterialService
from app.infrastructure.database.repositories.material_kind_repository import MaterialKindRepository
from app.infrastructure.database.repositories.praise_tag_repository import PraiseTagRepository
from app.infrastructure.database.repositories.praise_repository import PraiseRepository
from app.infrastructure.database.repositories.praise_material_repository import PraiseMaterialRepository


# Mapeamento de tipos em português (do YAML) para MaterialKind em inglês
TYPE_MAPPING: Dict[str, str] = {
    # Partituras
    'partitura': 'Sheet Music',
    'coro': 'Choir',
    'c. capa': 'Choir',
    'capa': 'Choir',
    'grade': 'Score',
    'cifra': 'Chord Chart',
    'base': 'Base',
    'harmonia': 'Harmony',
    
    # MIDI
    'midi coro': 'MIDI Choir',
    'midi 1ª voz': 'MIDI First Voice',
    'midi voz': 'MIDI Voice',
    'midi geral': 'MIDI General',
    'midi baixo': 'MIDI Bass',
    'midi tenor': 'MIDI Tenor',
    'midi alto': 'MIDI Alto',
    'midi soprano': 'MIDI Soprano',
    
    # Vozes
    'voz cantada': 'Sung Voice',
    'voz 1ª voz': 'First Voice',
    '1ª voz': 'First Voice',
    'voz': 'Sung Voice',
    
    # Áudio
    'versão ensaio': 'Rehearsal Version',
    'áudio geral': 'Audio General',
    'audio geral': 'Audio General',
    'playback': 'Playback',
    
    # Padrões baseados em extensão
    'pdf': 'Sheet Music',
    'mp3': 'Audio',
}


def normalize_material_kind_name(type_str: str, file_extension: str = '') -> str:
    """
    Normaliza o nome do tipo de material para o padrão MaterialKind
    """
    if not type_str:
        # Tenta inferir pela extensão
        if file_extension.lower() == '.pdf':
            return 'Sheet Music'
        elif file_extension.lower() in ['.mp3', '.wav', '.m4a', '.wma']:
            return 'Audio'
        return 'Unknown'
    
    type_lower = type_str.lower().strip()
    
    # Busca direta no mapeamento
    if type_lower in TYPE_MAPPING:
        return TYPE_MAPPING[type_lower]
    
    # Busca parcial
    for key, value in TYPE_MAPPING.items():
        if key in type_lower:
            return value
    
    return 'Unknown'


def get_or_create_material_kind(db: Session, name: str) -> MaterialKind:
    """Obtém ou cria um MaterialKind"""
    repo = MaterialKindRepository(db)
    
    # Busca por nome usando repositório (não lança exceção)
    material_kind = repo.get_by_name(name)
    if material_kind:
        return material_kind
    
    # Cria novo se não existir usando repositório diretamente
    material_kind = MaterialKind(name=name)
    return repo.create(material_kind)


def get_or_create_praise_tag(db: Session, tag_id: UUID, tag_name: Optional[str] = None) -> PraiseTag:
    """Obtém ou cria uma PraiseTag"""
    repo = PraiseTagRepository(db)
    
    # Tenta buscar por ID primeiro (usando repositório)
    tag = repo.get_by_id(tag_id)
    if tag:
        return tag
    
    # Se não encontrou por ID e tem nome, busca por nome
    if tag_name:
        tag = repo.get_by_name(tag_name)
        if tag:
            return tag
    
    # Cria novo se não existir (usa ID fornecido)
    tag = PraiseTag(id=tag_id, name=tag_name if tag_name else f"Tag {tag_id}")
    return repo.create(tag)


def load_metadata_file(metadata_path: Path) -> Optional[Dict]:
    """Carrega e parseia um arquivo de metadados YAML"""
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = yaml.safe_load(f)
            return metadata
    except Exception as e:
        print(f"Erro ao carregar {metadata_path}: {e}")
        return None


def process_praise_folder(
    db: Session,
    storage_client: StorageClient,
    praise_folder: Path,
    dry_run: bool = False
) -> Tuple[bool, str]:
    """
    Processa uma pasta de praise:
    - Lê metadata.yml
    - Faz upload dos arquivos para Wasabi
    - Cria/atualiza registros no banco
    """
    metadata_path = praise_folder / "metadata.yml"
    
    if not metadata_path.exists():
        return False, f"metadata.yml não encontrado em {praise_folder}"
    
    metadata = load_metadata_file(metadata_path)
    if not metadata:
        return False, f"Erro ao carregar metadados de {metadata_path}"
    
    praise_id_str = metadata.get('praise_id')
    if not praise_id_str:
        return False, f"praise_id não encontrado em {metadata_path}"
    
    try:
        praise_id = UUID(praise_id_str)
    except ValueError:
        return False, f"praise_id inválido: {praise_id_str}"
    
    praise_name = metadata.get('praise_name', '')
    praise_number = metadata.get('praise_number', '')
    
    print(f"\n📁 Processando: {praise_name} ({praise_id})")
    
    if dry_run:
        print(f"  [DRY RUN] Criaria Praise: {praise_name}")
    else:
        # Criar ou atualizar Praise
        praise_repo = PraiseRepository(db)
        praise = praise_repo.get_by_id(praise_id)
        
        if praise:
            # Atualizar praise existente
            from app.domain.schemas.praise import PraiseUpdate
            praise_service = PraiseService(db)
            praise_update = PraiseUpdate(
                name=praise_name,
                number=int(praise_number) if praise_number and praise_number.isdigit() else None
            )
            praise = praise_service.update(praise_id, praise_update)
            print(f"  ✅ Praise atualizado: {praise_name}")
        else:
            # Criar novo praise
            from app.domain.schemas.praise import PraiseCreate
            praise_service = PraiseService(db)
            praise_data = PraiseCreate(
                name=praise_name,
                number=int(praise_number) if praise_number and praise_number.isdigit() else None
            )
            # Usar repositório diretamente para definir ID customizado
            praise = Praise(
                id=praise_id,
                name=praise_name,
                number=int(praise_number) if praise_number and praise_number.isdigit() else None
            )
            praise = praise_repo.create(praise)
            print(f"  ✅ Praise criado: {praise_name}")
    
    # Processar tags
    tag_ids = metadata.get('praise_tags', [])
    if tag_ids:
        print(f"  📌 Tags: {len(tag_ids)}")
        if not dry_run:
            processed_tag_ids = []
            for tag_id_str in tag_ids:
                try:
                    tag_id = UUID(tag_id_str)
                    tag = get_or_create_praise_tag(db, tag_id)
                    processed_tag_ids.append(tag.id)
                except Exception as e:
                    print(f"    ⚠️  Erro ao processar tag {tag_id_str}: {e}")
            
            # Atualizar praise com todas as tags
            if processed_tag_ids:
                from app.domain.schemas.praise import PraiseUpdate
                praise_service = PraiseService(db)
                praise_update = PraiseUpdate(tag_ids=processed_tag_ids)
                praise = praise_service.update(praise_id, praise_update)
                print(f"    ✅ {len(processed_tag_ids)} tags associadas")
    
    # Processar materiais
    materials = metadata.get('praise_materiais', [])
    if materials:
        print(f"  📎 Materiais: {len(materials)}")
        
        for material_meta in materials:
            material_id_str = material_meta.get('praise_material_id')
            if not material_id_str:
                continue
            
            try:
                material_id = UUID(material_id_str)
            except ValueError:
                print(f"    ⚠️  ID de material inválido: {material_id_str}")
                continue
            
            # Buscar arquivo físico
            file_path_legacy = material_meta.get('file_path_legacy', '')
            material_kind_id_str = material_meta.get('material_kind')
            material_type_str = material_meta.get('type', '')
            
            # Procurar arquivo na pasta
            file_found = None
            for ext in ['.pdf', '.mp3', '.mid', '.wav', '.m4a', '.wma', '.enc']:
                potential_file = praise_folder / f"{material_id}{ext}"
                if potential_file.exists():
                    file_found = potential_file
                    break
            
            if not file_found:
                print(f"    ⚠️  Arquivo não encontrado para material {material_id}")
                continue
            
            if dry_run:
                print(f"    [DRY RUN] Faria upload: {file_found.name}")
            else:
                # Normalizar material kind name
                material_kind_name = normalize_material_kind_name(
                    material_type_str,
                    file_found.suffix
                )
                material_kind = get_or_create_material_kind(db, material_kind_name)
                
                # Fazer upload para storage (Wasabi ou Local)
                try:
                    with open(file_found, 'rb') as f:
                        content_type, _ = mimetypes.guess_type(str(file_found))
                        storage_path = storage_client.upload_file(
                            f,
                            file_found.name,
                            content_type=content_type,
                            folder=f"praises/{praise_id}",
                            material_id=material_id
                        )
                    print(f"    ✅ Upload: {file_found.name} → {storage_path}")
                except Exception as e:
                    print(f"    ❌ Erro no upload de {file_found.name}: {e}")
                    continue
                
                # Criar ou atualizar PraiseMaterial
                material_repo = PraiseMaterialRepository(db)
                material = material_repo.get_by_id(material_id)
                
                if material:
                    # Atualizar material existente
                    material.material_kind_id = material_kind.id
                    material.path = storage_path
                    material.type = MaterialType.FILE
                    material = material_repo.update(material)
                    print(f"    ✅ Material atualizado: {material_id}")
                else:
                    # Criar novo material com ID customizado
                    material = PraiseMaterial(
                        id=material_id,
                        material_kind_id=material_kind.id,
                        path=storage_path,
                        type=MaterialType.FILE,
                        praise_id=praise_id
                    )
                    material = material_repo.create(material)
                    print(f"    ✅ Material criado: {material_id}")
    
    return True, "Processado com sucesso"


def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Importa arquivos do ColDigOS para Wasabi e banco de dados')
    parser.add_argument('--colDigOS-path', type=str, required=True, help='Caminho para a pasta ColDigOS')
    parser.add_argument('--dry-run', action='store_true', help='Modo de simulação (não faz alterações)')
    parser.add_argument('--limit', type=int, help='Limitar número de praises a processar (útil para testes)')
    
    args = parser.parse_args()
    
    colDigOS_path = Path(args.colDigOS_path)
    if not colDigOS_path.exists():
        print(f"❌ Erro: Caminho não encontrado: {colDigOS_path}")
        return 1
    
    praise_folder = colDigOS_path / "praise"
    if not praise_folder.exists():
        print(f"❌ Erro: Pasta 'praise' não encontrada em {colDigOS_path}")
        return 1
    
    print(f"🚀 Iniciando importação de {praise_folder}")
    if args.dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print()
    
    # Inicializar serviços
    db: Session = SessionLocal()
    storage_client = get_storage_client()
    
    try:
        # Encontrar todas as pastas de praise
        praise_folders = [d for d in praise_folder.iterdir() if d.is_dir()]
        total = len(praise_folders)
        
        if args.limit:
            praise_folders = praise_folders[:args.limit]
            print(f"📊 Processando {len(praise_folders)} de {total} praises (limitado)")
        else:
            print(f"📊 Processando {total} praises")
        
        success_count = 0
        error_count = 0
        
        for i, folder in enumerate(praise_folders, 1):
            print(f"\n[{i}/{len(praise_folders)}] {folder.name}")
            success, message = process_praise_folder(db, storage_client, folder, args.dry_run)
            
            if success:
                success_count += 1
            else:
                error_count += 1
                print(f"  ❌ Erro: {message}")
            
            # Commit periódico
            if not args.dry_run and i % 10 == 0:
                db.commit()
                print(f"  💾 Commit periódico ({i} praises processados)")
        
        # Commit final
        if not args.dry_run:
            db.commit()
            print(f"\n💾 Commit final realizado")
        
        print(f"\n{'='*60}")
        print(f"✅ Sucesso: {success_count}")
        print(f"❌ Erros: {error_count}")
        print(f"📊 Total: {len(praise_folders)}")
        
    except Exception as e:
        print(f"\n❌ Erro fatal: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()
    
    return 0


if __name__ == "__main__":
    exit(main())
