"""Add PostgreSQL unaccent extension for search

Revision ID: 014_unaccent
Revises: 013_rename_metadata
Create Date: 2026-02-18

"""
from alembic import op

revision = "014_unaccent"
down_revision = "013_rename_metadata"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent;")


def downgrade():
    op.execute("DROP EXTENSION IF EXISTS unaccent;")
