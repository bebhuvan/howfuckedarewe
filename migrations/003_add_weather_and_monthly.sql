-- Migration: Add weather data and monthly aggregates
-- Run this migration on the D1 database

-- ============================================================================
-- 1. Create monthly_aggregates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS monthly_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,  -- 1-12
    
    -- PM2.5 stats
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
    
    -- Weather averages
    avg_temperature REAL,
    avg_humidity REAL,
    avg_wind_speed REAL,
    
    -- Computed health metrics
    cigarettes_per_day REAL,      -- Daily cigarette equivalent
    cigarettes_per_month REAL,    -- Monthly packs (~30 days)
    who_violation_days INTEGER,   -- Days above WHO 5 µg/m³ limit
    years_lost_per_year REAL,     -- AQLI calculation
    
    -- Worst day tracking
    worst_day TEXT,               -- Date of worst day (YYYY-MM-DD)
    worst_day_pm25 REAL,
    best_day TEXT,                -- Date of best day
    best_day_pm25 REAL,
    
    -- Metadata
    days_with_data INTEGER,
    
    UNIQUE(city_id, year, month),
    FOREIGN KEY(city_id) REFERENCES cities(id)
);

-- ============================================================================
-- 2. Add indexes for efficient queries
-- ============================================================================

-- Index for cleaning up old snapshots
CREATE INDEX IF NOT EXISTS idx_city_snapshots_recorded_at 
ON city_snapshots(recorded_at);

-- Index for daily aggregation queries
CREATE INDEX IF NOT EXISTS idx_city_snapshots_city_date 
ON city_snapshots(city_id, DATE(recorded_at));

-- Index for monthly aggregation queries
CREATE INDEX IF NOT EXISTS idx_daily_aggregates_city_date 
ON daily_aggregates(city_id, date);

-- Index for monthly lookups
CREATE INDEX IF NOT EXISTS idx_monthly_aggregates_city_year_month 
ON monthly_aggregates(city_id, year, month);
