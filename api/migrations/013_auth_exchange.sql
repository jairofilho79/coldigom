CREATE TABLE IF NOT EXISTS oauth_pending (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    redirect_to TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires ON oauth_pending(expires_at);

CREATE TABLE IF NOT EXISTS auth_exchange_codes (
    code TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    user_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_exchange_expires ON auth_exchange_codes(expires_at);
