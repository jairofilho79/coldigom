"""add_in_review_and_review_history_to_praises

Revision ID: 005_in_review
Revises: 004_is_old
Create Date: 2024-01-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005_in_review'
down_revision = '004_is_old'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'praises',
        sa.Column('in_review', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'praises',
        sa.Column('in_review_description', sa.String(2000), nullable=True)
    )
    op.add_column(
        'praises',
        sa.Column('review_history', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb"))
    )


def downgrade() -> None:
    op.drop_column('praises', 'review_history')
    op.drop_column('praises', 'in_review_description')
    op.drop_column('praises', 'in_review')
