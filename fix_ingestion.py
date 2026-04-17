#!/usr/bin/env python3
import csv

output_lines = []

def escape_sql_value(value: str) -> str:
    if value is None:
        return ''
    return value.replace("'", "''")

with open('storage/material_kinds_unique.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        mk_id = row['material_kind_id']
        name = row['material_kind_name']
        output_lines.append(f"INSERT INTO material_kinds (id, name) VALUES ('{escape_sql_value(mk_id)}', '{escape_sql_value(name)}');")

with open('storage/praise_tags_unique.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        tag_id = row['praise_tag_id']
        name = row['praise_tag_name']
        output_lines.append(f"INSERT INTO tags (id, name) VALUES ('{escape_sql_value(tag_id)}', '{escape_sql_value(name)}');")

with open('ingestion.sql', 'r', encoding='utf-8') as f:
    content = f.read()

if 'INSERT INTO material_kinds' not in content or 'INSERT INTO tags' not in content:
    insert_block = '-- Lookup table data (material_kinds and tags)\n\n' + '\n'.join(output_lines) + '\n\n'
    
    if 'BEGIN TRANSACTION;' in content:
        parts = content.split('BEGIN TRANSACTION;', 1)
        new_content = parts[0] + 'BEGIN TRANSACTION;\n\n' + insert_block + parts[1]
    else:
        new_content = insert_block + content
    
    with open('ingestion.sql', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f'Fixed ingestion.sql - added {len(output_lines)} lookup table inserts')
else:
    print('Lookup table data already present in ingestion.sql')