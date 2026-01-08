# howfuckedarewe.in v2 - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                                   │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                    Ingestion Worker                               │  │
│   │                                                                   │  │
│   │  Cron: Every hour (0 * * * *)                                     │  │
│   │                                                                   │  │
│   │  1. Fetch all 10 cities from WAQI API (batched, 5 concurrent)     │  │
│   │  2. Validate & process data                                       │  │
│   │  3. Store in D1 (city_snapshots table)                            │  │
│   │  4. Update daily_aggregates                                       │  │
│   │                                                                   │  │
│   │  Rate limit protection:                                           │  │
│   │  - 100ms delay between batches                                    │  │
│   │  - Retry with exponential backoff                                 │  │
│   │  - Max 3 retries per station                                      │  │
│   └────────────────────────────────────────────────────────────────┬─┘  │
│                                                                     │    │
│                                                                     ▼    │
│   ┌────────────────────────────────────────────────────────────────────┐│
│   │                       D1 Database                                  ││
│   │                    (Single Source of Truth)                        ││
│   │                                                                    ││
│   │  Tables:                                                           ││
│   │  • cities          - City metadata (slug, name, population)        ││
│   │  • stations        - Station registry                              ││
│   │  • city_snapshots  - Hourly aggregates (30 days retention)         ││
│   │  • daily_aggregates - Daily rollups (1 year retention)             ││
│   │  • readings        - Raw station readings (7 days retention)       ││
│   └────────────────────────────────────────────────────────────────┬───┘│
│                                                                     │    │
│                                                                     ▼    │
│   ┌────────────────────────────────────────────────────────────────────┐│
│   │                       Astro Site (SSR)                             ││
│   │                                                                    ││
│   │  Homepage:                                                         ││
│   │  - Reads from D1 only (< 50ms)                                     ││
│   │  - Zero WAQI API calls                                             ││
│   │  - Shows all 10 cities reliably                                    ││
│   │                                                                    ││
│   │  City Pages:                                                       ││
│   │  - Reads from D1 (primary)                                         ││
│   │  - Optional: live refresh button for user                          ││
│   │                                                                    ││
│   │  Fallback:                                                         ││
│   │  - Only if D1 is empty (first deploy/dev mode)                     ││
│   │  - Uses batched WAQI API calls with rate limiting                  ││
│   └────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. D1 as Single Source of Truth
- **Why**: Eliminates rate limiting on homepage (was making 100+ API calls)
- **How**: Ingestion worker populates D1 hourly, site reads from D1
- **Trade-off**: Data is up to 1 hour stale (acceptable for AQI)

### 2. Batched API Requests
- **Why**: WAQI rate limits aggressive requests
- **How**: Max 5 concurrent requests, 100ms delay between batches
- **Retry**: Exponential backoff (1s, 2s, 4s) with max 10s cap

### 3. Graceful Degradation
- **If D1 empty**: Falls back to live API (dev mode, first deploy)
- **If station fails**: Other stations still processed
- **If all fail**: Shows "Data unavailable" per city

## Data Flow

### Ingestion (Background)
```
WAQI API → Ingestion Worker → D1 Database
           (hourly cron)      
```

### User Request
```
User → Astro Site → D1 Database → Response
                    (< 50ms)
```

### Fallback (rare)
```
User → Astro Site → WAQI API (batched) → Response
                    (only if D1 empty)
```

## File Structure

```
aqi-v2/
├── src/
│   ├── lib/
│   │   ├── calculations.ts  # AQI metrics, cigarettes, years lost
│   │   ├── cities.ts        # City configs with station IDs
│   │   ├── constants.ts     # WHO limits, breakpoints
│   │   ├── db.ts            # D1 query functions
│   │   ├── types.ts         # TypeScript interfaces
│   │   └── waqi.ts          # WAQI API client with batching
│   ├── layouts/
│   │   └── CityLayout.astro # Shared layout
│   ├── components/
│   │   └── Navigation.astro # Nav bar
│   └── pages/
│       ├── index.astro      # Homepage (D1-first)
│       └── [city].astro     # City pages
├── workers/
│   └── ingestion/           # Unified ingestion worker
├── migrations/              # D1 schema SQL
├── wrangler.toml            # Cloudflare config
└── astro.config.mjs         # Astro config (SSR mode)
```

## Rate Limiting Strategy

| Scenario | Requests/Hour | Safe? |
|----------|---------------|-------|
| Old homepage | 100+ per page view | ❌ Gets rate limited |
| New homepage | 0 (reads D1) | ✅ |
| Ingestion worker | ~100 per hour | ✅ Within limits |
| City page (live) | ~15 per view | ⚠️ Only as fallback |

## Debugging Guide

### "No data" on homepage
1. Check D1: `wrangler d1 execute aqi-historical --command "SELECT * FROM city_snapshots ORDER BY recorded_at DESC LIMIT 10"`
2. If empty: Ingestion worker hasn't run. Trigger manually.
3. If old: Check ingestion worker logs.

### Ingestion failures
1. Check worker logs: `wrangler tail aqi-ingestion`
2. Common causes: WAQI API down, rate limited, network timeout
3. Solution: Worker has retry logic, wait for next run

### Data mismatch between cities
1. Check station count: Each city has different # of stations
2. Some stations may be offline
3. Check `valid_stations` vs `total_stations` in D1

---
**Last updated:** 2026-01-06
