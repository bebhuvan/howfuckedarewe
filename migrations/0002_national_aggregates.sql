-- National Aggregates & Historical Data Schema
-- Migration: 0002_national_aggregates
-- Created: 2026-01-06

-- National daily aggregates - pre-computed All India metrics
-- Avoids computing from city data on every request
CREATE TABLE IF NOT EXISTS national_daily_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD format

    -- PM2.5 stats
    avg_pm25 REAL,              -- Simple average across cities
    weighted_avg_pm25 REAL,     -- Population-weighted average (more meaningful)
    min_pm25 REAL,              -- Best city's daily average
    max_pm25 REAL,              -- Worst city's daily average

    -- Coverage metrics
    cities_reporting INTEGER,           -- Number of cities with data
    total_population_covered INTEGER,   -- Sum of reporting cities' populations

    -- Computed health impact metrics (based on weighted average)
    cigarettes_equivalent REAL,
    years_lost_per_year REAL,
    who_violation_factor REAL,

    -- Extremes tracking
    worst_city_id INTEGER,
    best_city_id INTEGER,

    -- Metadata
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (worst_city_id) REFERENCES cities(id),
    FOREIGN KEY (best_city_id) REFERENCES cities(id)
);

-- OpenAQ station mapping - links OpenAQ locations to our cities
CREATE TABLE IF NOT EXISTS openaq_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    openaq_location_id INTEGER UNIQUE NOT NULL,
    openaq_sensor_id INTEGER,           -- PM2.5 sensor ID for this location
    city_id INTEGER,                    -- Our city (by geocoding match)
    station_id INTEGER,                 -- Link to stations table if matched by name
    name TEXT,
    latitude REAL,
    longitude REAL,
    is_active INTEGER DEFAULT 1,
    last_value REAL,
    last_updated TEXT,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (city_id) REFERENCES cities(id),
    FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Backfill progress tracking - for resumable historical imports
CREATE TABLE IF NOT EXISTS backfill_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,               -- 'openaq', 'waqi', etc.
    city_slug TEXT,                     -- NULL for national, otherwise city
    start_date TEXT,                    -- Target range start
    end_date TEXT,                      -- Target range end
    last_processed_date TEXT,           -- Resume point
    records_imported INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',      -- pending, running, completed, failed
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Data ingestion log - track when data was last fetched
CREATE TABLE IF NOT EXISTS ingestion_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,               -- 'waqi', 'openaq'
    ingestion_type TEXT NOT NULL,       -- 'hourly', 'daily', 'backfill'
    started_at TEXT NOT NULL,
    completed_at TEXT,
    records_processed INTEGER DEFAULT 0,
    cities_processed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',      -- running, completed, failed
    error_message TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_national_daily_date ON national_daily_aggregates(date DESC);
CREATE INDEX IF NOT EXISTS idx_openaq_stations_city ON openaq_stations(city_id);
CREATE INDEX IF NOT EXISTS idx_openaq_stations_location ON openaq_stations(openaq_location_id);
CREATE INDEX IF NOT EXISTS idx_backfill_progress_source ON backfill_progress(source, city_slug);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_source ON ingestion_log(source, started_at DESC);

-- Add new cities from the recent expansion
INSERT OR IGNORE INTO cities (slug, name, local_name, state, population, latitude, longitude) VALUES
    ('hyderabad', 'Hyderabad', 'హైదరాబాద్', 'Telangana', 10000000, 17.3850, 78.4867),
    ('ahmedabad', 'Ahmedabad', 'અમદાવાદ', 'Gujarat', 8000000, 23.0225, 72.5714),
    ('patna', 'Patna', 'पटना', 'Bihar', 2500000, 25.5941, 85.1376),
    ('lucknow', 'Lucknow', 'लखनऊ', 'Uttar Pradesh', 3500000, 26.8467, 80.9462),
    ('agra', 'Agra', 'आगरा', 'Uttar Pradesh', 1800000, 27.1767, 78.0081);
