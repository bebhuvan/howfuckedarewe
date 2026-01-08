-- Cities table
CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    coordinates TEXT NOT NULL, -- JSON {lat, lng}
    population INTEGER,
    timezone TEXT DEFAULT 'Asia/Kolkata'
);

-- City Snapshots (Hourly data)
CREATE TABLE IF NOT EXISTS city_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL, -- ISO 8601
    
    -- Aggregates (computed from stations)
    avg_pm25 REAL,
    min_pm25 REAL,
    max_pm25 REAL,
    median_pm25 REAL,
    
    -- Pollutants (AQI sub-indices)
    avg_pm10 REAL,
    avg_o3 REAL,
    avg_no2 REAL,
    avg_so2 REAL,
    avg_co REAL,
    
    -- Metadata
    total_stations INTEGER,
    valid_stations INTEGER,
    dominant_pollutant TEXT,
    quality_status TEXT, -- 'healthy', 'degraded', 'critical'
    
    FOREIGN KEY(city_id) REFERENCES cities(id)
);

-- Daily Aggregates (Historical)
CREATE TABLE IF NOT EXISTS daily_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    
    avg_pm25 REAL,
    max_pm25 REAL,
    min_pm25 REAL,
    
    data_points INTEGER, -- How many hourly snapshots contributed
    quality_score REAL,
    
    UNIQUE(city_id, date),
    FOREIGN KEY(city_id) REFERENCES cities(id)
);
