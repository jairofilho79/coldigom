-- Run once on existing D1 databases: wrangler d1 execute coldigom --remote --file=scripts/migration-auth-refresh.sql

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id TEXT PRIMARY KEY,
    user_sub TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    replaced_by TEXT,
    user_claims TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (replaced_by) REFERENCES auth_refresh_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user_sub ON auth_refresh_tokens(user_sub);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_expires ON auth_refresh_tokens(expires_at);
