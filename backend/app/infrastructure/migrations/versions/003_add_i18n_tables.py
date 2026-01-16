"""add_i18n_tables

Revision ID: 003_i18n
Revises: 002_material_types
Create Date: 2024-01-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003_i18n'
down_revision = '002_material_types'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create languages table
    op.create_table(
        'languages',
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('code')
    )
    op.create_index('ix_languages_code', 'languages', ['code'])

    # Insert initial languages
    connection = op.get_bind()
    initial_languages = [
        ('pt-BR', 'Português (Brasil)', True),
        ('en-US', 'English (United States)', True),
        ('es-ES', 'Español (España)', True),
    ]
    
    for code, name, is_active in initial_languages:
        connection.execute(
            sa.text("INSERT INTO languages (code, name, is_active) VALUES (:code, :name, :is_active)"),
            {"code": code, "name": name, "is_active": is_active}
        )

    # Create material_kind_translations table
    op.create_table(
        'material_kind_translations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('material_kind_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('language_code', sa.String(), nullable=False),
        sa.Column('translated_name', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['material_kind_id'], ['material_kinds.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_code'], ['languages.code'], ondelete='CASCADE'),
        sa.UniqueConstraint('material_kind_id', 'language_code', name='uq_material_kind_translation')
    )
    op.create_index('ix_material_kind_translations_material_kind_id', 'material_kind_translations', ['material_kind_id'])
    op.create_index('ix_material_kind_translations_language_code', 'material_kind_translations', ['language_code'])

    # Create praise_tag_translations table
    op.create_table(
        'praise_tag_translations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('praise_tag_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('language_code', sa.String(), nullable=False),
        sa.Column('translated_name', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['praise_tag_id'], ['praise_tags.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_code'], ['languages.code'], ondelete='CASCADE'),
        sa.UniqueConstraint('praise_tag_id', 'language_code', name='uq_praise_tag_translation')
    )
    op.create_index('ix_praise_tag_translations_praise_tag_id', 'praise_tag_translations', ['praise_tag_id'])
    op.create_index('ix_praise_tag_translations_language_code', 'praise_tag_translations', ['language_code'])

    # Create material_type_translations table
    op.create_table(
        'material_type_translations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('material_type_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('language_code', sa.String(), nullable=False),
        sa.Column('translated_name', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['material_type_id'], ['material_types.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_code'], ['languages.code'], ondelete='CASCADE'),
        sa.UniqueConstraint('material_type_id', 'language_code', name='uq_material_type_translation')
    )
    op.create_index('ix_material_type_translations_material_type_id', 'material_type_translations', ['material_type_id'])
    op.create_index('ix_material_type_translations_language_code', 'material_type_translations', ['language_code'])


def downgrade() -> None:
    # Drop translation tables
    op.drop_index('ix_material_type_translations_language_code', table_name='material_type_translations')
    op.drop_index('ix_material_type_translations_material_type_id', table_name='material_type_translations')
    op.drop_table('material_type_translations')
    
    op.drop_index('ix_praise_tag_translations_language_code', table_name='praise_tag_translations')
    op.drop_index('ix_praise_tag_translations_praise_tag_id', table_name='praise_tag_translations')
    op.drop_table('praise_tag_translations')
    
    op.drop_index('ix_material_kind_translations_language_code', table_name='material_kind_translations')
    op.drop_index('ix_material_kind_translations_material_kind_id', table_name='material_kind_translations')
    op.drop_table('material_kind_translations')
    
    # Drop languages table
    op.drop_index('ix_languages_code', table_name='languages')
    op.drop_table('languages')
