# Database Schema

Cloudflare D1 (SQLite) schema for historical air quality data.

## Tables

### cities

Reference table for monitored cities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `slug` | TEXT | URL-safe identifier (unique) |
| `name` | TEXT | Display name |
| `local_name` | TEXT | Name in local script |
| `state` | TEXT | Indian state |
| `population` | INTEGER | Metro population |
| `latitude` | REAL | City center latitude |
| `longitude` | REAL | City center longitude |
| `waqi_station_id` | TEXT | Primary WAQI station ID |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### stations

Individual monitoring stations within each city.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `city_id` | INTEGER | Foreign key to cities |
| `waqi_id` | TEXT | WAQI station identifier (unique) |
| `name` | TEXT | Station name/location |
| `latitude` | REAL | Station latitude |
| `longitude` | REAL | Station longitude |
| `is_active` | INTEGER | 1 if actively reporting |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### readings

Raw hourly readings from each station.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `station_id` | INTEGER | Foreign key to stations |
| `recorded_at` | TEXT | ISO timestamp from source |
| `ingested_at` | TEXT | When we stored it |
| `pm25` | REAL | PM2.5 in µg/m³ |
| `pm10` | REAL | PM10 in µg/m³ |
| `o3` | REAL | Ozone in ppb |
| `no2` | REAL | NO2 in ppb |
| `so2` | REAL | SO2 in ppb |
| `co` | REAL | CO in ppm |
| `aqi` | INTEGER | Computed AQI value |
| `dominant_pollutant` | TEXT | Main pollutant driving AQI |
| `is_valid` | INTEGER | 1 if passed validation |
| `quality_flags` | TEXT | JSON with any anomaly flags |

**Unique constraint**: `(station_id, recorded_at)`

### city_snapshots

Aggregated hourly data per city (computed from readings).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `city_id` | INTEGER | Foreign key to cities |
| `recorded_at` | TEXT | Hour timestamp (truncated) |
| `ingested_at` | TEXT | When we computed it |
| `avg_pm25` | REAL | Average PM2.5 across stations |
| `min_pm25` | REAL | Minimum PM2.5 |
| `max_pm25` | REAL | Maximum PM2.5 |
| `median_pm25` | REAL | Median PM2.5 |
| `avg_pm10` | REAL | Average PM10 |
| `avg_o3` | REAL | Average ozone |
| `avg_no2` | REAL | Average NO2 |
| `avg_so2` | REAL | Average SO2 |
| `avg_co` | REAL | Average CO |
| `total_stations` | INTEGER | Stations in city |
| `valid_stations` | INTEGER | Stations reporting valid data |
| `dominant_pollutant` | TEXT | Most common dominant pollutant |
| `quality_status` | TEXT | 'healthy', 'degraded', 'critical' |

**Unique constraint**: `(city_id, recorded_at)`

### daily_aggregates

Daily statistics per city (for faster historical queries).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `city_id` | INTEGER | Foreign key to cities |
| `date` | TEXT | YYYY-MM-DD format |
| `avg_pm25` | REAL | Daily average PM2.5 |
| `min_pm25` | REAL | Daily minimum |
| `max_pm25` | REAL | Daily maximum |
| `peak_hour` | INTEGER | Hour (0-23) with highest PM2.5 |
| `peak_pm25` | REAL | PM2.5 at peak hour |
| `avg_pm10` | REAL | Daily average PM10 |
| `avg_o3` | REAL | Daily average ozone |
| `avg_no2` | REAL | Daily average NO2 |
| `cigarettes_equivalent` | REAL | Cigs/day based on avg PM2.5 |
| `years_lost_per_year` | REAL | AQLI life years calculation |
| `who_violation_factor` | REAL | How many times over WHO limit |
| `hours_with_data` | INTEGER | Hours (of 24) with data |
| `created_at` | TEXT | ISO timestamp |

**Unique constraint**: `(city_id, date)`

## Indexes

```sql
-- Optimized for time-series queries
CREATE INDEX idx_readings_station_time ON readings(station_id, recorded_at DESC);
CREATE INDEX idx_readings_time ON readings(recorded_at DESC);
CREATE INDEX idx_city_snapshots_city_time ON city_snapshots(city_id, recorded_at DESC);
CREATE INDEX idx_city_snapshots_time ON city_snapshots(recorded_at DESC);
CREATE INDEX idx_daily_aggregates_city_date ON daily_aggregates(city_id, date DESC);
CREATE INDEX idx_daily_aggregates_date ON daily_aggregates(date DESC);
CREATE INDEX idx_stations_city ON stations(city_id);
```

## Common Queries

### Get latest snapshot for a city

```sql
SELECT * FROM city_snapshots
WHERE city_id = (SELECT id FROM cities WHERE slug = 'delhi')
ORDER BY recorded_at DESC
LIMIT 1;
```

### Get last 24 hours of data

```sql
SELECT * FROM city_snapshots cs
JOIN cities c ON cs.city_id = c.id
WHERE c.slug = 'mumbai'
  AND cs.recorded_at >= datetime('now', '-24 hours')
ORDER BY cs.recorded_at ASC;
```

### Get 7-day daily averages

```sql
SELECT * FROM daily_aggregates da
JOIN cities c ON da.city_id = c.id
WHERE c.slug = 'bangalore'
  AND da.date >= date('now', '-7 days')
ORDER BY da.date ASC;
```

### Compare today vs last week

```sql
SELECT 
  da_today.avg_pm25 as today,
  da_week.avg_pm25 as last_week,
  (da_today.avg_pm25 - da_week.avg_pm25) as change
FROM daily_aggregates da_today
JOIN daily_aggregates da_week ON da_today.city_id = da_week.city_id
JOIN cities c ON da_today.city_id = c.id
WHERE c.slug = 'chennai'
  AND da_today.date = date('now')
  AND da_week.date = date('now', '-7 days');
```

### Get worst 5 days in last month

```sql
SELECT date, avg_pm25, peak_pm25, peak_hour
FROM daily_aggregates da
JOIN cities c ON da.city_id = c.id
WHERE c.slug = 'delhi'
  AND da.date >= date('now', '-30 days')
ORDER BY da.avg_pm25 DESC
LIMIT 5;
```

### City rankings by current PM2.5

```sql
SELECT c.name, cs.avg_pm25
FROM city_snapshots cs
JOIN cities c ON cs.city_id = c.id
WHERE cs.recorded_at = (
  SELECT MAX(recorded_at) FROM city_snapshots
)
ORDER BY cs.avg_pm25 DESC;
```

## Data Retention

Consider implementing retention policies for older data:

```sql
-- Delete readings older than 90 days
DELETE FROM readings
WHERE recorded_at < datetime('now', '-90 days');

-- Keep daily aggregates indefinitely (small footprint)
-- Or delete older than 2 years:
DELETE FROM daily_aggregates
WHERE date < date('now', '-2 years');
```

## Migration History

| Version | File | Description |
|---------|------|-------------|
| 0001 | `0001_initial_schema.sql` | Initial tables, indexes, seed data |

To run migrations:

```bash
wrangler d1 execute aqi-historical --file=./migrations/0001_initial_schema.sql
```
