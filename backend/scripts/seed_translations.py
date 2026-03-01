#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para importar traduções de material_kinds a partir de CSV gerado do banco local.

CSV format (sem header):
  translation_id, material_kind_id, language_code, translated_name

Uso:
  python scripts/seed_translations.py
  python scripts/seed_translations.py --dry-run
  python scripts/seed_translations.py --csv /custom/path.csv
"""

import sys
import os
import csv
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind_translation import MaterialKindTranslation
from app.domain.models.material_kind import MaterialKind
from app.domain.models.language import Language


def ensure_language(db: Session, code: str, name: str) -> None:
    lang = db.query(Language).filter(Language.code == code).first()
    if not lang:
        db.add(Language(code=code, name=name, is_active=True))
        db.flush()
        print(f"  ✅ Idioma criado: {code} ({name})")
    else:
        print(f"  ⏭️  Idioma já existe: {code}")


def import_translations(csv_path: str, db: Session, dry_run: bool = False) -> tuple[int, int, int]:
    created = updated = skipped = 0

    if not os.path.exists(csv_path):
        print(f"❌ Arquivo não encontrado: {csv_path}")
        return 0, 0, 0

    print(f"\n📋 Importando traduções de: {csv_path}")
    if dry_run:
        print("⚠️  MODO DRY RUN - Nenhuma alteração será feita")
    print()

    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 4:
                print(f"⏭️  Linha inválida ignorada: {row}")
                skipped += 1
                continue

            translation_id_str, material_kind_id_str, language_code, translated_name = (
                row[0].strip(), row[1].strip(), row[2].strip(), row[3].strip()
            )

            try:
                translation_id = UUID(translation_id_str)
                material_kind_id = UUID(material_kind_id_str)
            except ValueError as e:
                print(f"❌ UUID inválido: {e}")
                skipped += 1
                continue

            # Verificar se material_kind existe na VPS
            kind = db.query(MaterialKind).filter(MaterialKind.id == material_kind_id).first()
            if not kind:
                print(f"⚠️  material_kind {material_kind_id} não encontrado — ignorado ({translated_name})")
                skipped += 1
                continue

            # Verificar se tradução já existe (por material_kind_id + language_code — unique constraint)
            existing = (
                db.query(MaterialKindTranslation)
                .filter(
                    MaterialKindTranslation.material_kind_id == material_kind_id,
                    MaterialKindTranslation.language_code == language_code,
                )
                .first()
            )

            if existing:
                if existing.translated_name != translated_name:
                    if dry_run:
                        print(f"  [DRY RUN] Atualizaria: {kind.name} [{language_code}] "
                              f"'{existing.translated_name}' -> '{translated_name}'")
                    else:
                        existing.translated_name = translated_name
                        db.flush()
                        print(f"🔄 Atualizado: {kind.name} [{language_code}] -> '{translated_name}'")
                    updated += 1
                else:
                    skipped += 1
                continue

            # Criar nova tradução
            if dry_run:
                print(f"  [DRY RUN] Criaria: {kind.name} [{language_code}] = '{translated_name}'")
            else:
                db.add(MaterialKindTranslation(
                    id=translation_id,
                    material_kind_id=material_kind_id,
                    language_code=language_code,
                    translated_name=translated_name,
                ))
                db.flush()
                print(f"✅ Criado: {kind.name} [{language_code}] = '{translated_name}'")
            created += 1

    return created, updated, skipped


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Importa traduções de material_kinds de CSV seed')
    parser.add_argument('--csv', type=str, help='Caminho para o CSV (padrão: auto-detectado)')
    parser.add_argument('--dry-run', action='store_true', help='Simulação sem alterações')
    args = parser.parse_args()

    # Auto-detectar caminho do CSV
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_root = os.path.dirname(script_dir)

    csv_path = args.csv
    if not csv_path:
        candidates = [
            os.path.join(app_root, 'material_kind_translations_seed.csv'),
            os.path.join(script_dir, '../material_kind_translations_seed.csv'),
        ]
        csv_path = next((p for p in candidates if os.path.exists(p)), candidates[0])

    db: Session = SessionLocal()
    try:
        print("=" * 60)
        print("🌍 Seed de Traduções de Material Kinds")
        print("=" * 60)

        # Garantir que os idiomas necessários existem
        print("\n📌 Verificando idiomas...")
        required_languages = {
            'pt':    'Português (Brasil)',
            'pt-BR': 'Português (Brasil)',
            'en-US': 'English (United States)',
            'es-ES': 'Español (España)',
        }
        if not args.dry_run:
            for code, name in required_languages.items():
                ensure_language(db, code, name)
            db.flush()

        created, updated, skipped = import_translations(csv_path, db, args.dry_run)

        if not args.dry_run:
            db.commit()
            print("\n💾 Commit realizado")

        print(f"\n{'=' * 60}")
        print("📊 RESUMO")
        print(f"{'=' * 60}")
        print(f"✅ Criados:     {created}")
        print(f"🔄 Atualizados: {updated}")
        print(f"⏭️  Ignorados:  {skipped}")
        print(f"📈 Total:       {created + updated + skipped}")
        print(f"{'=' * 60}\n")

    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
