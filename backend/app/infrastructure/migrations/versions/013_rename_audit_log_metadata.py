"""Rename audit_log metadata column to extra_metadata

Revision ID: 013_rename_metadata
Revises: 012_add_user_consents
Create Date: 2026-02-16 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '013_rename_metadata'
down_revision = '012_add_user_consents'
branch_labels = None
depends_on = None


def upgrade():
    # Renomear coluna metadata para extra_metadata na tabela audit_logs
    op.alter_column('audit_logs', 'metadata',
                    new_column_name='extra_metadata',
                    existing_type=postgresql.JSON,
                    existing_nullable=True)


def downgrade():
    # Reverter: renomear extra_metadata de volta para metadata
    op.alter_column('audit_logs', 'extra_metadata',
                    new_column_name='metadata',
                    existing_type=postgresql.JSON,
                    existing_nullable=True)
