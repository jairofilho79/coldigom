"""add_user_material_kind_preferences

Revision ID: 006_user_preferences
Revises: 005_in_review
Create Date: 2024-01-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_user_preferences'
down_revision = '005_in_review'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_material_kind_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('material_kind_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['material_kind_id'], ['material_kinds.id'], ),
        sa.UniqueConstraint('user_id', 'material_kind_id', name='uq_user_material_kind')
    )
    op.create_index('ix_user_material_kind_preferences_id', 'user_material_kind_preferences', ['id'])
    op.create_index('ix_user_material_kind_preferences_user_id', 'user_material_kind_preferences', ['user_id'])
    op.create_index('ix_user_material_kind_preferences_material_kind_id', 'user_material_kind_preferences', ['material_kind_id'])
    op.create_index('ix_user_material_kind_preferences_user_order', 'user_material_kind_preferences', ['user_id', 'order'])


def downgrade() -> None:
    op.drop_index('ix_user_material_kind_preferences_user_order', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_material_kind_id', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_user_id', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_id', table_name='user_material_kind_preferences')
    op.drop_table('user_material_kind_preferences')
