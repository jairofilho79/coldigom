"""Add user_consents table

Revision ID: 012_add_user_consents
Revises: 011_add_audit_logs
Create Date: 2026-02-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '012_add_user_consents'
down_revision = '011_add_audit_logs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_consents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('consent_type', sa.String(), nullable=False),
        sa.Column('granted', sa.String(), nullable=False, server_default='true'),
        sa.Column('granted_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('consent_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    
    op.create_index('ix_user_consents_id', 'user_consents', ['id'])
    op.create_index('ix_user_consents_user_id', 'user_consents', ['user_id'])
    op.create_index('ix_user_consents_consent_type', 'user_consents', ['consent_type'])


def downgrade() -> None:
    op.drop_index('ix_user_consents_consent_type', table_name='user_consents')
    op.drop_index('ix_user_consents_user_id', table_name='user_consents')
    op.drop_index('ix_user_consents_id', table_name='user_consents')
    op.drop_table('user_consents')
