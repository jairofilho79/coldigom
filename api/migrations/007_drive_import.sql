-- Google Drive import: OAuth credentials, scan staging, durable import jobs

CREATE TABLE IF NOT EXISTS google_drive_credentials (
    user_sub TEXT PRIMARY KEY,
    refresh_token_enc TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_scans (
    id TEXT PRIMARY KEY,
    user_sub TEXT NOT NULL,
    source_url TEXT NOT NULL,
    root_id TEXT NOT NULL,
    root_kind TEXT NOT NULL, -- folder | file
    status TEXT NOT NULL, -- pending | running | done | failed
    error TEXT,
    skipped_json TEXT, -- JSON array of { path, reason }
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_scans_user ON drive_scans(user_sub);

CREATE TABLE IF NOT EXISTS drive_scan_files (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    FOREIGN KEY (scan_id) REFERENCES drive_scans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_drive_scan_files_scan ON drive_scan_files(scan_id);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    praise_id TEXT NOT NULL,
    user_sub TEXT NOT NULL,
    status TEXT NOT NULL, -- pending | running | done | completed_with_errors | failed
    total_count INTEGER NOT NULL DEFAULT 0,
    done_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (praise_id) REFERENCES praises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_praise ON import_jobs(praise_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_sub);

CREATE TABLE IF NOT EXISTS import_job_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    material_kind TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path_legacy TEXT,
    status TEXT NOT NULL, -- pending | running | done | failed
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    material_id TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_import_job_items_job ON import_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_items_status ON import_job_items(job_id, status);
