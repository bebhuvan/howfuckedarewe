# Architecture Overview

howfuckedarewe.in is built on Cloudflare's edge platform for maximum performance and reliability.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                              │
│                                                                     │
│  ┌─────────────────────┐           ┌─────────────────────────────┐ │
│  │   Ingestion Worker  │           │     Astro Site (SSR)        │ │
│  │   (Scheduled)       │           │     (Cloudflare Workers)    │ │
│  │                     │           │                             │ │
│  │  • Runs every hour  │           │  • Server-side rendered     │ │
│  │  • Fetches WAQI API │           │  • Queries D1 for data      │ │
│  │  • Validates data   │           │  • Falls back to live API   │ │
│  │  • Stores to D1     │           │  • Serves dynamic pages     │ │
│  └──────────┬──────────┘           └──────────────┬──────────────┘ │
│             │                                     │                 │
│             │         ┌───────────────┐          │                 │
│             └────────▶│ Cloudflare D1 │◀─────────┘                 │
│                       │   (SQLite)    │                            │
│                       │               │                            │
│                       │ • readings    │                            │
│                       │ • snapshots   │                            │
│                       │ • aggregates  │                            │
│                       └───────────────┘                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
                    ┌───────────────────┐
                    │    WAQI API       │
                    │  (Data Source)    │
                    └───────────────────┘
```

## Components

### 1. Astro Site (Main Application)

- **Framework**: Astro 5.x with SSR
- **Adapter**: `@astrojs/cloudflare`
- **Deployment**: Cloudflare Workers
- **Features**:
  - Server-side rendering for dynamic data
  - Queries D1 for historical trends
  - Falls back to live WAQI API if D1 is empty
  - Responsive design with sardonic messaging

### 2. Ingestion Worker

- **Runtime**: Cloudflare Workers (scheduled)
- **Schedule**: Every hour (cron: `0 * * * *`)
- **Responsibilities**:
  - Fetch air quality data from WAQI API
  - Validate and clean incoming data
  - Store raw readings in D1
  - Compute city-level aggregates
  - Update daily statistics

### 3. D1 Database

- **Engine**: SQLite (Cloudflare D1)
- **Tables**:
  - `cities` - Reference data for monitored cities
  - `stations` - Individual monitoring stations
  - `readings` - Raw hourly readings per station
  - `city_snapshots` - Hourly city-level aggregates
  - `daily_aggregates` - Daily statistics and metrics

## Data Flow

### Ingestion Flow (Hourly)

1. Cron triggers ingestion worker
2. Worker fetches data for each city from WAQI API
3. Data is validated (outlier detection, staleness check)
4. Raw readings stored in `readings` table
5. City aggregates computed and stored in `city_snapshots`
6. Daily aggregates updated in `daily_aggregates`

### Request Flow (User Visit)

1. User requests page (e.g., `/delhi`)
2. Cloudflare routes to Astro Worker
3. Worker queries D1 for:
   - Latest city snapshot
   - Historical trends (24h, 7d)
4. If D1 is empty, falls back to live WAQI API
5. Page rendered with data
6. Response served from edge

## Key Design Decisions

### Why Cloudflare Workers?

- **Edge performance**: Data served from 300+ global locations
- **No cold starts**: Always-on, sub-millisecond startup
- **Integrated D1**: Native SQLite with automatic replication
- **Cost effective**: Generous free tier, pay-per-request

### Why D1 over other databases?

- **Native integration**: No network latency within Cloudflare
- **SQLite compatibility**: Familiar query patterns
- **Automatic backups**: Built-in durability
- **Read replicas**: Automatic edge caching

### Why still use WAQI API directly?

- **Fallback**: Graceful degradation if D1 is empty
- **Real-time**: Can show live data during initial setup
- **Station-level detail**: D1 stores aggregates, WAQI has granular data

## Scalability

The architecture scales automatically:

- **Workers**: Scales to millions of requests
- **D1**: Read replicas at edge for low latency
- **Ingestion**: Single worker, rate-limited to WAQI limits
- **Storage**: D1 handles billions of rows efficiently

## Monitoring

### Ingestion Worker

- Logs available via `wrangler tail aqi-ingestion`
- `/health` endpoint for uptime monitoring
- `/stats` endpoint for ingestion statistics

### Main Site

- Cloudflare Analytics dashboard
- Worker logs via `wrangler tail howfuckedarewe`
- D1 query analytics in Cloudflare dashboard

## Security

- **No secrets in code**: All credentials via Cloudflare secrets
- **Rate limiting**: Built-in Cloudflare protection
- **HTTPS only**: Automatic SSL/TLS
- **Input validation**: All WAQI data validated before storage
