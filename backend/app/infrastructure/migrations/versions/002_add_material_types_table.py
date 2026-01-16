"""add_material_types_table

Revision ID: 002_material_types
Revises: 001_initial
Create Date: 2024-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
import os
import sys

# revision identifiers, used by Alembic.
revision = '002_material_types'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create material_types table
    op.create_table(
        'material_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
    )
    op.create_index('ix_material_types_id', 'material_types', ['id'])
    op.create_index('ix_material_types_name', 'material_types', ['name'])

    # Insert initial material types
    # Note: Using raw SQL to insert with generated UUIDs
    connection = op.get_bind()
    
    initial_types = [
        ('pdf', uuid.uuid4()),
        ('audio', uuid.uuid4()),
        ('youtube', uuid.uuid4()),
        ('spotify', uuid.uuid4()),
        ('text', uuid.uuid4()),
    ]
    
    type_id_map = {}
    for name, type_id in initial_types:
        connection.execute(
            sa.text("INSERT INTO material_types (id, name) VALUES (:id, :name)"),
            {"id": type_id, "name": name}
        )
        type_id_map[name] = type_id
    
    # Add material_type_id column to praise_materials (temporarily nullable)
    op.add_column('praise_materials', 
                  sa.Column('material_type_id', postgresql.UUID(as_uuid=True), nullable=True))

    # Migrate existing data: map enum values to material_type_ids
    # For FILE type: detect extension and map to PDF or AUDIO
    # For other types: map directly
    
    # Get all praise_materials with their current type enum value
    materials = connection.execute(
        sa.text("SELECT id, type, path FROM praise_materials")
    ).fetchall()
    
    audio_extensions = {'.mp3', '.wav', '.m4a', '.wma', '.ogg', '.flac'}
    
    for material_id, material_type_enum, path in materials:
        material_type_name = None
        
        if material_type_enum == 'FILE':
            # Detect extension from path
            if path:
                ext = os.path.splitext(path.lower())[1]
                if ext == '.pdf':
                    material_type_name = 'pdf'
                elif ext in audio_extensions:
                    material_type_name = 'audio'
                else:
                    # Default to PDF if extension not recognized
                    material_type_name = 'pdf'
            else:
                # No path? Default to PDF
                material_type_name = 'pdf'
        elif material_type_enum == 'YOUTUBE':
            material_type_name = 'youtube'
        elif material_type_enum == 'SPOTIFY':
            material_type_name = 'spotify'
        elif material_type_enum == 'TEXT':
            material_type_name = 'text'
        else:
            # Unknown type, default to text
            material_type_name = 'text'
        
        if material_type_name and material_type_name in type_id_map:
            type_id = type_id_map[material_type_name]
            connection.execute(
                sa.text("UPDATE praise_materials SET material_type_id = :type_id WHERE id = :material_id"),
                {"type_id": type_id, "material_id": material_id}
            )
    
    # Make material_type_id NOT NULL after data migration
    op.alter_column('praise_materials', 'material_type_id', nullable=False)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_praise_materials_material_type_id',
        'praise_materials',
        'material_types',
        ['material_type_id'],
        ['id']
    )
    
    # Add index on material_type_id
    op.create_index('ix_praise_materials_material_type_id', 'praise_materials', ['material_type_id'])
    
    # Remove old type column (enum)
    op.drop_column('praise_materials', 'type')
    
    # Drop enum type (if it exists)
    op.execute('DROP TYPE IF EXISTS materialtype')


def downgrade() -> None:
    # Recreate enum type
    op.execute("CREATE TYPE materialtype AS ENUM ('FILE', 'YOUTUBE', 'SPOTIFY', 'TEXT')")
    
    # Add type column back
    op.add_column('praise_materials',
                  sa.Column('type', sa.Enum('FILE', 'YOUTUBE', 'SPOTIFY', 'TEXT', name='materialtype'), 
                           nullable=True))
    
    # Migrate data back from material_type_id to type enum
    connection = op.get_bind()
    
    # Get material types mapping
    material_types = connection.execute(
        sa.text("SELECT id, name FROM material_types")
    ).fetchall()
    
    type_name_map = {str(type_id): name for type_id, name in material_types}
    
    # Update praise_materials.type based on material_type_id
    materials = connection.execute(
        sa.text("SELECT id, material_type_id FROM praise_materials WHERE material_type_id IS NOT NULL")
    ).fetchall()
    
    for material_id, material_type_id in materials:
        type_name = type_name_map.get(str(material_type_id))
        if type_name:
            # Map back to enum value
            if type_name in ['pdf', 'audio']:
                enum_value = 'FILE'
            elif type_name == 'youtube':
                enum_value = 'YOUTUBE'
            elif type_name == 'spotify':
                enum_value = 'SPOTIFY'
            elif type_name == 'text':
                enum_value = 'TEXT'
            else:
                enum_value = 'FILE'  # Default
            
            connection.execute(
                sa.text("UPDATE praise_materials SET type = :enum_value WHERE id = :material_id"),
                {"enum_value": enum_value, "material_id": material_id}
            )
    
    # Make type NOT NULL
    op.alter_column('praise_materials', 'type', nullable=False)
    
    # Remove foreign key and index
    op.drop_constraint('fk_praise_materials_material_type_id', 'praise_materials', type_='foreignkey')
    op.drop_index('ix_praise_materials_material_type_id', table_name='praise_materials')
    
    # Remove material_type_id column
    op.drop_column('praise_materials', 'material_type_id')
    
    # Drop material_types table
    op.drop_index('ix_material_types_name', table_name='material_types')
    op.drop_index('ix_material_types_id', table_name='material_types')
    op.drop_table('material_types')
