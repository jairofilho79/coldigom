"""Add extended praise metadata (author, rhythm, tonality, category)

Revision ID: 009_extended_metadata
Revises: 008_add_rooms
Create Date: 2024-02-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '009_extended_metadata'
down_revision = '008_add_rooms'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('praises', sa.Column('author', sa.String(255), nullable=True))
    op.add_column('praises', sa.Column('rhythm', sa.String(100), nullable=True))
    op.add_column('praises', sa.Column('tonality', sa.String(50), nullable=True))
    op.add_column('praises', sa.Column('category', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('praises', 'category')
    op.drop_column('praises', 'tonality')
    op.drop_column('praises', 'rhythm')
    op.drop_column('praises', 'author')
