-- AQI Historical Data Schema
-- Migration: 0001_initial_schema
-- Created: 2025-01-05

-- Cities table - static reference data
CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    local_name TEXT,
    state TEXT NOT NULL,
    population INTEGER,
    latitude REAL,
    longitude REAL,
    waqi_station_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Stations table - monitoring stations per city
CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    waqi_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (city_id) REFERENCES cities(id)
);

-- Hourly readings - raw data from each station
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,  -- ISO timestamp from WAQI
    ingested_at TEXT DEFAULT (datetime('now')),

    -- Pollutant values (µg/m³ or ppb as reported)
    pm25 REAL,
    pm10 REAL,
    o3 REAL,
    no2 REAL,
    so2 REAL,
    co REAL,

    -- AQI values
    aqi INTEGER,
    dominant_pollutant TEXT,

    -- Data quality flags
    is_valid INTEGER DEFAULT 1,
    quality_flags TEXT,  -- JSON string for any anomalies

    FOREIGN KEY (station_id) REFERENCES stations(id),
    UNIQUE(station_id, recorded_at)
);

-- City snapshots - aggregated hourly data per city
CREATE TABLE IF NOT EXISTS city_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,  -- Hour timestamp (truncated to hour)
    ingested_at TEXT DEFAULT (datetime('now')),

    -- Aggregated PM2.5 stats
    avg_pm25 REAL,
    min_pm25 REAL,
    max_pm25 REAL,
    median_pm25 REAL,

    -- Other pollutants (averages)
    avg_pm10 REAL,
    avg_o3 REAL,
    avg_no2 REAL,
    avg_so2 REAL,
    avg_co REAL,

    -- Station coverage
    total_stations INTEGER,
    valid_stations INTEGER,

    -- Computed metrics
    dominant_pollutant TEXT,
    aqi INTEGER,

    -- Quality
    quality_status TEXT,  -- 'healthy', 'degraded', 'critical'

    FOREIGN KEY (city_id) REFERENCES cities(id),
    UNIQUE(city_id, recorded_at)
);

-- Daily aggregates - for faster historical queries
CREATE TABLE IF NOT EXISTS daily_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    date TEXT NOT NULL,  -- YYYY-MM-DD format

    -- PM2.5 stats for the day
    avg_pm25 REAL,
    min_pm25 REAL,
    max_pm25 REAL,

    -- Peak hour
    peak_hour INTEGER,  -- 0-23
    peak_pm25 REAL,

    -- Other pollutants
    avg_pm10 REAL,
    avg_o3 REAL,
    avg_no2 REAL,

    -- Computed metrics
    cigarettes_equivalent REAL,
    years_lost_per_year REAL,
    who_violation_factor REAL,

    -- Data completeness
    hours_with_data INTEGER,  -- out of 24

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (city_id) REFERENCES cities(id),
    UNIQUE(city_id, date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_readings_station_time ON readings(station_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_time ON readings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_city_snapshots_city_time ON city_snapshots(city_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_city_snapshots_time ON city_snapshots(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_aggregates_city_date ON daily_aggregates(city_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_aggregates_date ON daily_aggregates(date DESC);
CREATE INDEX IF NOT EXISTS idx_stations_city ON stations(city_id);

-- Insert initial cities data
INSERT OR IGNORE INTO cities (slug, name, local_name, state, population, waqi_station_id) VALUES
    ('delhi', 'Delhi', 'दिल्ली', 'Delhi', 32941000, '@7013'),
    ('mumbai', 'Mumbai', 'मुंबई', 'Maharashtra', 21297000, '@8482'),
    ('kolkata', 'Kolkata', 'কলকাতা', 'West Bengal', 15134000, '@12414'),
    ('bangalore', 'Bangalore', 'ಬೆಂಗಳೂರು', 'Karnataka', 13193000, '@12407'),
    ('chennai', 'Chennai', 'சென்னை', 'Tamil Nadu', 11503000, '@7614');
