#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Exporta material_kinds e material_kind_translations do banco local (Docker)
para CSVs usados como seeds na VPS.

Use com o banco local do coldigom (DATABASE_URL apontando para o Postgres do Docker).
Gera:
  - material_kinds_seed.csv  (header: material_kind_id, material_kind_name)
  - material_kind_translations_seed.csv (sem header: translation_id, material_kind_id, language_code, translated_name)

Uso:
  cd backend && python scripts/export_material_kinds_seeds.py
  cd backend && python scripts/export_material_kinds_seeds.py --output-dir ./seeds
"""

import sys
import os
import csv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.infrastructure.database.database import SessionLocal
from app.domain.models.material_kind import MaterialKind
from app.domain.models.material_kind_translation import MaterialKindTranslation


def export_material_kinds(db: Session, csv_path: str) -> int:
    """Exporta material_kinds para CSV (com header). Retorna quantidade exportada."""
    kinds = db.query(MaterialKind).order_by(MaterialKind.name).all()
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['material_kind_id', 'material_kind_name'])
        writer.writeheader()
        for k in kinds:
            writer.writerow({
                'material_kind_id': str(k.id),
                'material_kind_name': k.name,
            })
    return len(kinds)


def export_translations(db: Session, csv_path: str) -> int:
    """Exporta material_kind_translations para CSV (sem header, formato do seed_translations.py)."""
    rows = (
        db.query(MaterialKindTranslation)
        .order_by(MaterialKindTranslation.material_kind_id, MaterialKindTranslation.language_code)
        .all()
    )
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        for t in rows:
            writer.writerow([
                str(t.id),
                str(t.material_kind_id),
                t.language_code,
                t.translated_name,
            ])
    return len(rows)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Exporta material_kinds e traduções do banco local para CSVs seed'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default=None,
        help='Diretório de saída (default: backend/)',
    )
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_root = os.path.dirname(script_dir)
    out_dir = args.output_dir or app_root

    os.makedirs(out_dir, exist_ok=True)
    kinds_path = os.path.join(out_dir, 'material_kinds_seed.csv')
    trans_path = os.path.join(out_dir, 'material_kind_translations_seed.csv')

    db: Session = SessionLocal()
    try:
        print("=" * 60)
        print("📤 Exportando Material Kinds e Traduções (banco local → CSV)")
        print("=" * 60)

        n_kinds = export_material_kinds(db, kinds_path)
        print(f"✅ material_kinds: {n_kinds} registros → {kinds_path}")

        n_trans = export_translations(db, trans_path)
        print(f"✅ material_kind_translations: {n_trans} registros → {trans_path}")

        print()
        print("Na VPS, use:")
        print(f"  1. import_seed_data.py --material-kinds-csv {os.path.basename(kinds_path)}")
        print(f"  2. seed_translations.py --csv {os.path.basename(trans_path)}")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
