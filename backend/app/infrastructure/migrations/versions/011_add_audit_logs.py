"""Add audit_logs table

Revision ID: 011_add_audit_logs
Revises: 010_drop_prefs_lists_rooms
Create Date: 2026-02-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '011_add_audit_logs'
down_revision = '010_drop_prefs_lists_rooms'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create AuditActionType enum (only if it doesn't exist)
    # Use raw SQL to avoid issues with Alembic and existing types
    conn = op.get_bind()
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE auditactiontype AS ENUM (
                'create', 'update', 'delete', 'read', 'login', 'logout',
                'download', 'upload', 'export', 'import',
                'review_start', 'review_finish', 'review_cancel'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    
    # Create enum type reference for SQLAlchemy
    audit_action_type = postgresql.ENUM(
        'create', 'update', 'delete', 'read', 'login', 'logout',
        'download', 'upload', 'export', 'import',
        'review_start', 'review_finish', 'review_cancel',
        name='auditactiontype',
        create_type=False  # Type already exists, just reference it
    )
    
    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('action', audit_action_type, nullable=False),
        sa.Column('resource_type', sa.String(), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resource_name', sa.String(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('request_method', sa.String(), nullable=True),
        sa.Column('request_path', sa.String(), nullable=True),
        sa.Column('changes', postgresql.JSON, nullable=True),
        sa.Column('metadata', postgresql.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    
    # Create indexes
    op.create_index('ix_audit_logs_id', 'audit_logs', ['id'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_resource_type', 'audit_logs', ['resource_type'])
    op.create_index('ix_audit_logs_resource_id', 'audit_logs', ['resource_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_resource_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_resource_type', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_id', table_name='audit_logs')
    op.drop_table('audit_logs')
    sa.Enum(name='auditactiontype').drop(op.get_bind(), checkfirst=True)
