"""Add changelog_entries table for offline-first sync

Revision ID: 015_changelog
Revises: 014_unaccent
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa

revision = "015_changelog"
down_revision = "014_unaccent"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "changelog_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_changelog_entries_entity_type",
        "changelog_entries",
        ["entity_type"],
    )


def downgrade():
    op.drop_index("ix_changelog_entries_entity_type", table_name="changelog_entries")
    op.drop_table("changelog_entries")
