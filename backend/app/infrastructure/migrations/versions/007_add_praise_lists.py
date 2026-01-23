"""add_praise_lists

Revision ID: 007_praise_lists
Revises: 006_user_preferences
Create Date: 2024-01-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007_praise_lists'
down_revision = '006_user_preferences'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create praise_lists table
    op.create_table(
        'praise_lists',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_praise_lists_id', 'praise_lists', ['id'])
    op.create_index('ix_praise_lists_name', 'praise_lists', ['name'])
    op.create_index('ix_praise_lists_user_id', 'praise_lists', ['user_id'])

    # Create praise_list_praise association table
    op.create_table(
        'praise_list_praise',
        sa.Column('praise_list_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('praise_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['praise_list_id'], ['praise_lists.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['praise_id'], ['praises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('praise_list_id', 'praise_id')
    )
    op.create_index('ix_praise_list_praise_list_id', 'praise_list_praise', ['praise_list_id'])
    op.create_index('ix_praise_list_praise_praise_id', 'praise_list_praise', ['praise_id'])

    # Create praise_list_follows table
    op.create_table(
        'praise_list_follows',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('praise_list_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['praise_list_id'], ['praise_lists.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'praise_list_id', name='uq_user_praise_list_follow')
    )
    op.create_index('ix_praise_list_follows_id', 'praise_list_follows', ['id'])
    op.create_index('ix_praise_list_follows_user_id', 'praise_list_follows', ['user_id'])
    op.create_index('ix_praise_list_follows_praise_list_id', 'praise_list_follows', ['praise_list_id'])


def downgrade() -> None:
    op.drop_index('ix_praise_list_follows_praise_list_id', table_name='praise_list_follows')
    op.drop_index('ix_praise_list_follows_user_id', table_name='praise_list_follows')
    op.drop_index('ix_praise_list_follows_id', table_name='praise_list_follows')
    op.drop_table('praise_list_follows')
    
    op.drop_index('ix_praise_list_praise_praise_id', table_name='praise_list_praise')
    op.drop_index('ix_praise_list_praise_list_id', table_name='praise_list_praise')
    op.drop_table('praise_list_praise')
    
    op.drop_index('ix_praise_lists_user_id', table_name='praise_lists')
    op.drop_index('ix_praise_lists_name', table_name='praise_lists')
    op.drop_index('ix_praise_lists_id', table_name='praise_lists')
    op.drop_table('praise_lists')
