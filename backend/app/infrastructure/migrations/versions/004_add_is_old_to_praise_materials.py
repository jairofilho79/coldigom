"""add_is_old_to_praise_materials

Revision ID: 004_is_old
Revises: 003_i18n
Create Date: 2024-01-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004_is_old'
down_revision = '003_i18n'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'praise_materials',
        sa.Column('is_old', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'praise_materials',
        sa.Column('old_description', sa.String(2000), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('praise_materials', 'old_description')
    op.drop_column('praise_materials', 'is_old')
