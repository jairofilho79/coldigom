"""Drop user_preferences, praise_lists, and rooms tables

Revision ID: 010_drop_prefs_lists_rooms
Revises: 009_extended_metadata
Create Date: 2025-02-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '010_drop_prefs_lists_rooms'
down_revision = '009_extended_metadata'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop rooms-related tables (dependents first)
    op.drop_index('ix_room_join_requests_user_id', table_name='room_join_requests')
    op.drop_index('ix_room_join_requests_room_id', table_name='room_join_requests')
    op.drop_index('ix_room_join_requests_id', table_name='room_join_requests')
    op.drop_table('room_join_requests')
    sa.Enum(name='roomjoinrequeststatus').drop(op.get_bind(), checkfirst=True)

    op.drop_index('ix_room_praises_praise_id', table_name='room_praises')
    op.drop_index('ix_room_praises_room_id', table_name='room_praises')
    op.drop_index('ix_room_praises_id', table_name='room_praises')
    op.drop_table('room_praises')

    op.drop_index('ix_room_messages_created_at', table_name='room_messages')
    op.drop_index('ix_room_messages_user_id', table_name='room_messages')
    op.drop_index('ix_room_messages_room_id', table_name='room_messages')
    op.drop_index('ix_room_messages_id', table_name='room_messages')
    op.drop_table('room_messages')

    op.drop_index('ix_room_participants_user_id', table_name='room_participants')
    op.drop_index('ix_room_participants_room_id', table_name='room_participants')
    op.drop_index('ix_room_participants_id', table_name='room_participants')
    op.drop_table('room_participants')

    op.drop_index('ix_rooms_creator_id', table_name='rooms')
    op.drop_index('ix_rooms_code', table_name='rooms')
    op.drop_index('ix_rooms_id', table_name='rooms')
    op.drop_table('rooms')
    sa.Enum(name='roomaccesstype').drop(op.get_bind(), checkfirst=True)

    # Drop praise_lists-related tables
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

    # Drop user_material_kind_preferences
    op.drop_index('ix_user_material_kind_preferences_user_order', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_material_kind_id', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_user_id', table_name='user_material_kind_preferences')
    op.drop_index('ix_user_material_kind_preferences_id', table_name='user_material_kind_preferences')
    op.drop_table('user_material_kind_preferences')


def downgrade() -> None:
    # Recreate user_material_kind_preferences (006)
    from sqlalchemy.dialects import postgresql
    op.create_table(
        'user_material_kind_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('material_kind_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['material_kind_id'], ['material_kinds.id']),
        sa.UniqueConstraint('user_id', 'material_kind_id', name='uq_user_material_kind')
    )
    op.create_index('ix_user_material_kind_preferences_id', 'user_material_kind_preferences', ['id'])
    op.create_index('ix_user_material_kind_preferences_user_id', 'user_material_kind_preferences', ['user_id'])
    op.create_index('ix_user_material_kind_preferences_material_kind_id', 'user_material_kind_preferences', ['material_kind_id'])
    op.create_index('ix_user_material_kind_preferences_user_order', 'user_material_kind_preferences', ['user_id', 'order'])

    # Recreate praise_lists (007)
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

    # Recreate rooms (008)
    roomaccesstype = sa.Enum('PUBLIC', 'PASSWORD', 'APPROVAL', name='roomaccesstype')
    roomaccesstype.create(op.get_bind(), checkfirst=True)
    roomjoinrequeststatus = sa.Enum('PENDING', 'APPROVED', 'REJECTED', name='roomjoinrequeststatus')
    roomjoinrequeststatus.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'rooms',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(8), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('creator_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('access_type', roomaccesstype, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('is_open_for_requests', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('auto_destroy_on_empty', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('last_activity_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['creator_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_rooms_id', 'rooms', ['id'])
    op.create_index('ix_rooms_code', 'rooms', ['code'], unique=True)
    op.create_index('ix_rooms_creator_id', 'rooms', ['creator_id'])

    op.create_table(
        'room_participants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_room_participants_id', 'room_participants', ['id'])
    op.create_index('ix_room_participants_room_id', 'room_participants', ['room_id'])
    op.create_index('ix_room_participants_user_id', 'room_participants', ['user_id'])

    op.create_table(
        'room_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('message', sa.String(140), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_room_messages_id', 'room_messages', ['id'])
    op.create_index('ix_room_messages_room_id', 'room_messages', ['room_id'])
    op.create_index('ix_room_messages_user_id', 'room_messages', ['user_id'])
    op.create_index('ix_room_messages_created_at', 'room_messages', ['created_at'])

    op.create_table(
        'room_praises',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('praise_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['praise_id'], ['praises.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_room_praises_id', 'room_praises', ['id'])
    op.create_index('ix_room_praises_room_id', 'room_praises', ['room_id'])
    op.create_index('ix_room_praises_praise_id', 'room_praises', ['praise_id'])

    op.create_table(
        'room_join_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', roomjoinrequeststatus, nullable=False, server_default='PENDING'),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_room_join_requests_id', 'room_join_requests', ['id'])
    op.create_index('ix_room_join_requests_room_id', 'room_join_requests', ['room_id'])
    op.create_index('ix_room_join_requests_user_id', 'room_join_requests', ['user_id'])
