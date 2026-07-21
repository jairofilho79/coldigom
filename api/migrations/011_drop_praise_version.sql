-- Remove praise-level version (editions are subtags). Skip if column never applied.
-- Apply: wrangler d1 execute coldigom --remote --file=migrations/011_drop_praise_version.sql

ALTER TABLE praises DROP COLUMN version;
