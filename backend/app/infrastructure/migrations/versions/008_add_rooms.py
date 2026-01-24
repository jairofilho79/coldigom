"""Add rooms tables

Revision ID: 008_add_rooms
Revises: 007_add_praise_lists
Create Date: 2024-01-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008_add_rooms'
down_revision = '007_praise_lists'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create rooms table
    op.create_table(
        'rooms',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(8), nullable=False, unique=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('creator_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('access_type', sa.Enum('PUBLIC', 'PASSWORD', 'APPROVAL', name='roomaccesstype'), nullable=False),
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

    # Create room_participants table
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

    # Create room_messages table
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

    # Create room_praises table
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

    # Create room_join_requests table
    op.create_table(
        'room_join_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', name='roomjoinrequeststatus'), nullable=False, server_default='PENDING'),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_room_join_requests_id', 'room_join_requests', ['id'])
    op.create_index('ix_room_join_requests_room_id', 'room_join_requests', ['room_id'])
    op.create_index('ix_room_join_requests_user_id', 'room_join_requests', ['user_id'])


def downgrade() -> None:
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
