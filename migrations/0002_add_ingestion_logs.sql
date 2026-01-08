-- Ingestion Logs table
CREATE TABLE IF NOT EXISTS ingestion_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL, -- 'running', 'completed', 'failed'
    cities_processed INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    source TEXT DEFAULT 'scheduled', -- 'scheduled', 'manual', 'startup'
    error TEXT
);

-- Index for faster retrieval of recent logs
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_started_at ON ingestion_logs(started_at DESC);
