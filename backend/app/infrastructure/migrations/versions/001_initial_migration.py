"""Initial migration

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)

    # Create praise_tags table
    op.create_table(
        'praise_tags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
    )
    op.create_index('ix_praise_tags_id', 'praise_tags', ['id'])
    op.create_index('ix_praise_tags_name', 'praise_tags', ['name'])

    # Create material_kinds table
    op.create_table(
        'material_kinds',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
    )
    op.create_index('ix_material_kinds_id', 'material_kinds', ['id'])
    op.create_index('ix_material_kinds_name', 'material_kinds', ['name'])

    # Create praises table
    op.create_table(
        'praises',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('number', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_praises_id', 'praises', ['id'])
    op.create_index('ix_praises_name', 'praises', ['name'])
    op.create_index('ix_praises_number', 'praises', ['number'])

    # Create praise_tag_association table (many-to-many)
    op.create_table(
        'praise_tag_association',
        sa.Column('praise_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tag_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['praise_id'], ['praises.id'], ),
        sa.ForeignKeyConstraint(['tag_id'], ['praise_tags.id'], ),
        sa.PrimaryKeyConstraint('praise_id', 'tag_id')
    )

    # Create praise_materials table
    op.create_table(
        'praise_materials',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('material_kind_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('path', sa.String(), nullable=False),
        sa.Column('type', sa.Enum('FILE', 'YOUTUBE', 'SPOTIFY', 'TEXT', name='materialtype'), nullable=False),
        sa.Column('praise_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['material_kind_id'], ['material_kinds.id'], ),
        sa.ForeignKeyConstraint(['praise_id'], ['praises.id'], ),
    )
    op.create_index('ix_praise_materials_id', 'praise_materials', ['id'])


def downgrade() -> None:
    op.drop_index('ix_praise_materials_id', table_name='praise_materials')
    op.drop_table('praise_materials')
    op.drop_table('praise_tag_association')
    op.drop_index('ix_praises_number', table_name='praises')
    op.drop_index('ix_praises_name', table_name='praises')
    op.drop_index('ix_praises_id', table_name='praises')
    op.drop_table('praises')
    op.drop_index('ix_material_kinds_name', table_name='material_kinds')
    op.drop_index('ix_material_kinds_id', table_name='material_kinds')
    op.drop_table('material_kinds')
    op.drop_index('ix_praise_tags_name', table_name='praise_tags')
    op.drop_index('ix_praise_tags_id', table_name='praise_tags')
    op.drop_table('praise_tags')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_id', table_name='users')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS materialtype')






