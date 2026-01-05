# Project Learnings & Decisions

Documentation of key learnings, decisions, and discoveries made during development.

## Data Sources

### WAQI (World Air Quality Index) - CHOSEN
- **Pros:**
  - **Real-time data** - updates every hour
  - Global coverage
  - Includes AQI calculation
  - Has 7-day forecast
  - 10 Bangalore stations with current data

- **Cons:**
  - Returns AQI not raw PM2.5 (need conversion)
  - No historical data via API
  - `demo` token only returns Shanghai - need real token

### OpenAQ - NOT SUITABLE FOR BANGALORE
- **Pros:**
  - Direct PM2.5 µg/m³ values
  - Open data philosophy
  - Good rate limits (60/min, 2000/hour)

- **Cons:**
  - **CRITICAL: Bangalore data is STALE** (2018-2025)
  - `datetimeLast` metadata is misleading - shows recent dates but actual measurements are years old
  - Most KSPCB sensors haven't reported since 2018
  - Newer sensors (2025) have sporadic data

**Decision:** Use WAQI as primary source. OpenAQ Bangalore data is not current despite API metadata suggesting otherwise. Discovered this after extensive testing - see "OpenAQ Investigation" below.

## Bangalore Air Quality Stations

### Station Discovery Process

1. Query OpenAQ for Bangalore coordinates:
   ```
   GET /v3/locations?coordinates=12.9716,77.5946&radius=25000
   ```

2. Filter for stations with:
   - PM2.5 sensor
   - Recent data (2025-2026)

3. Found 14 active stations with PM2.5

### Station Coverage

Good geographic spread:
- **Industrial:** Peenya, Jigani, Shivapura
- **IT Hubs:** Bellandur, Kadabesanahalli
- **Residential:** Jayanagar, BTM, Kasturi Nagar
- **Traffic:** Silk Board
- **Mixed:** Hebbal

Note: Some stations have gaps in data. The collector handles this gracefully.

## The Fucked Index Formula

### Design Goals
1. Compound multiple safety standards
2. Scale non-linearly (worse gets much worse)
3. Easy to understand intuitively

### Formula
```
Fucked Index = (PM2.5/5 × PM2.5/12) / 10
             = PM2.5² / 600
```

Where:
- 5 = WHO annual guideline (µg/m³)
- 12 = US EPA annual standard (µg/m³)

### Why This Works

1. **At safe levels (PM2.5 ≤ 5):** Index is tiny (0.04)
2. **At moderate (PM2.5 = 30):** Index is 1.5 (scary but not horrifying)
3. **At severe (PM2.5 = 100):** Index is 16.7 (terrifying)

The squared relationship means pollution doesn't just add up linearly - it compounds. This reflects the actual health impact better than simple multipliers.

## Architecture Decisions

### Why Cloudflare Workers?

1. **Edge deployment** - Low latency from India
2. **Free tier is generous** - We need ~300 req/day
3. **D1 + KV combo** - Perfect for our hybrid needs
4. **Cron triggers** - Built-in scheduling

### Why D1 + KV (not just one)?

| D1 (SQLite) | KV (Key-Value) |
|-------------|----------------|
| SQL queries | Simple key lookup |
| Historical aggregation | Real-time current |
| Slower (cold start) | Fast (edge cached) |
| Persistent | Cached (24h TTL) |

**Pattern:**
- KV for current data (fast reads)
- D1 for historical queries (SQL power)
- Collector updates both

### Why 3-hour Collection Interval?

1. OpenAQ updates ~hourly from KSPCB
2. Air quality doesn't change minute-to-minute
3. 8 collections/day is plenty for awareness
4. Reduces API calls and storage

Originally considered 15 minutes, but user feedback: "Let's do update every 3 hours or something."

### Why Not Real-time Websockets?

1. AQI awareness doesn't need real-time
2. Adds complexity
3. Higher costs
4. 3-hour updates are sufficient for the "awareness jolt" goal

## UI/UX Learnings

### Sardonic Tone
User wanted sardonic government advisory style:
- "Ministry of Denial, Department of Looking the Other Way"
- Gauge labels: Fine*, Cope**, Denial***, LOL
- Footnotes explaining the asterisks

### Local Flavor
- "Adjust Maadkoli" instead of "Moderate" (Kannada phrase meaning "adjust it")
- Bangalore-specific references

### Design Iterations
1. Initial meter was too simple
2. Added sardonic elements
3. User: "You just made it bigger" - scaled back
4. Kept the humor, reduced visual weight

### Readability
- User complained text was "too hard to read"
- Increased font sizes from 0.5rem to 0.625-0.6875rem
- Lesson: Dark UI + small text = bad

## Data Quirks

### Seasonal Variation
- Current data (Jan 2026) shows lower PM2.5 (~30-50)
- Monsoon season typically has cleaner air
- Winter (Nov-Feb) is typically worse
- Need historical chart to show this pattern

### Station Reliability
- Some stations report intermittently
- KSPCB stations (2224-2230) more reliable
- Newer sensors (1510xxx) sometimes have gaps
- Collector handles missing data gracefully

## Security Considerations

### API Key Management
- OpenAQ key stored in `.env` (gitignored)
- Worker uses `wrangler secret` for production
- Never exposed in client-side code

### CORS
- API only allows specific origins
- `howfuckedarewe.in` + localhost for dev

## Performance Notes

### D1 Query Performance
- Daily aggregation queries are fast (<50ms)
- 90-day history query acceptable (~100ms)
- Indexes on timestamp and date columns essential

### KV Read Performance
- Sub-10ms reads from edge
- 24h TTL balances freshness vs cache hits

## Future Considerations

### Forecast Data
- OpenAQ doesn't have forecasts
- WAQI has 7-day forecast but different format
- Could add as secondary source later

### Push Notifications
- Could alert when Fucked Index exceeds threshold
- Web Push API + service worker
- Deferred for v2

### Historical Analysis
- Year-over-year comparison
- Seasonal patterns
- Correlation with events (Diwali, construction, etc.)

## Code Organization

### Shared Code Strategy
```
/shared
  ├── types.ts        # TypeScript interfaces
  ├── calculations.ts # Fucked Index, cigarettes, etc.
  └── stations.ts     # Station config

Both workers import from shared
```

### Why Duplicate Station Config in Worker?
- Workers can't easily import from outside their directory
- Simpler to have station config inline
- Source of truth is `shared/stations.ts`

## Testing

### Manual Testing
```bash
# Trigger collection
curl https://aqi-collector.<subdomain>.workers.dev/trigger

# Check status
curl https://aqi-collector.<subdomain>.workers.dev/status

# Test API
curl https://aqi-api.<subdomain>.workers.dev/api/current
curl https://aqi-api.<subdomain>.workers.dev/api/health
```

### Local Dev
```bash
cd workers/collector
wrangler dev --test-scheduled  # Test cron locally
```

## Mistakes Made

1. **OpenAQ assumption** - Assumed OpenAQ had current data based on `datetimeLast` metadata
2. **SVG chart illegibility** - First chart attempt was hard to read, switched to CSS bar chart
3. **Meter size** - Made design too big trying to "elevate" it
4. **Small text** - Initial text sizes too small on dark background
5. **Wrong sensor IDs** - Initially used old OpenAQ sensor IDs that returned 2016 data

## What Worked Well

1. **Plan-first approach** - Architecture plan saved time
2. **User feedback loops** - Quick iterations on design
3. **Cloudflare stack** - Simple, free, fast
4. **Compound Fucked Index** - Effectively communicates severity
5. **Thorough data source testing** - Caught OpenAQ staleness before deployment

## OpenAQ Investigation (January 2026)

### The Problem
After building the entire Worker architecture around OpenAQ, discovered that Bangalore data is stale.

### What We Found

**OpenAQ Location Metadata (misleading):**
```
GET /v3/locations?coordinates=12.9716,77.5946&radius=25000
```
Returns locations with `datetimeLast: "2026-01-05T12:00:00"` suggesting current data.

**Actual Measurement Data (stale):**
```
GET /v3/sensors/{id}/measurements?limit=1
```
Returns measurements from 2016-2018 for most KSPCB sensors:
- BTM Layout (sensor 4042): Last real data 2016-03-06
- Peenya (sensor 4046): Last real data 2016-03-06
- Jayanagar (sensor 4045): Last real data 2016-03-06

**Root Cause:**
The `datetimeLast` field in OpenAQ appears to track when the station metadata was last updated, NOT when actual measurements were recorded. This is a significant API design issue that makes data freshness discovery difficult.

### Sensor ID Confusion
OpenAQ has multiple sensor IDs for the same station:
- Old KSPCB sensors (4042, 4046, etc.) - data from 2016-2018
- New CPCB sensors (14635, 14859, etc.) - data from 2018
- Newer sensors (12235240, etc.) - sporadic 2025 data

None have consistent real-time data as of January 2026.

### Recommendation
For Bangalore AQI data, use WAQI which has verified real-time feeds from CPCB/KSPCB stations. OpenAQ may work for other cities but is not reliable for Bangalore.
