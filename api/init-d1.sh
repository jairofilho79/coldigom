#!/bin/bash
# Initialize D1 database with schema
# Run this in your terminal where wrangler is authenticated
# Usage: ./init-d1.sh

echo "=========================================="
echo "D1 Database Initialization Script"
echo "=========================================="
echo ""

cd api || exit 1

DATABASE_NAME="coldigom"

echo "Creating/pushing schema to D1 database: $DATABASE_NAME..."
wrangler d1 execute "$DATABASE_NAME" --remote --file=schema.sql

echo ""
echo "D1 initialization complete!"
echo ""
echo "Note: You may also need to run the ingest script to populate data:"
echo "  wrangler d1 execute $DATABASE_NAME --remote --file=path/to/ingest-data.sql"
