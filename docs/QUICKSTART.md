# howfuckedarewe.in - Quick Start Guide

## Current State (January 2026)

- **Data Source:** WAQI API (real-time Bangalore data)
- **OpenAQ:** NOT used - Bangalore data is stale (2016-2025)
- **Workers:** Built but not deployed (designed for OpenAQ)

## Project Structure

```
AQI/
├── src/
│   ├── pages/
│   │   ├── index.astro      # Main page
│   │   └── methodology.astro
│   └── lib/
│       └── api.ts           # API client (OpenAQ + Worker API)
├── workers/
│   ├── collector/           # Cron worker (fetches data every 3h)
│   │   ├── src/index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── api/                 # REST API worker
│   │   ├── src/index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── schema.sql           # D1 database schema
│   └── setup.sh             # Deployment script
├── shared/
│   ├── types.ts             # TypeScript interfaces
│   ├── calculations.ts      # Fucked Index, cigarettes, etc.
│   └── stations.ts          # Bangalore station config
├── docs/
│   ├── ARCHITECTURE.md      # Full architecture documentation
│   ├── LEARNINGS.md         # Project decisions & learnings
│   └── QUICKSTART.md        # This file
└── .env                     # API keys (gitignored)
```

## Development

### Run Astro site locally
```bash
npm run dev
```

### Build site
```bash
npm run build
```

## Deploying Workers

### Prerequisites
1. Cloudflare account
2. Wrangler CLI: `npm install -g wrangler`
3. Login: `wrangler login`

### Step 1: Create Cloudflare resources
```bash
# Create D1 database
wrangler d1 create aqi-bangalore

# Create KV namespace
wrangler kv:namespace create AQI_CACHE
```

### Step 2: Update wrangler.toml files
Update both `workers/collector/wrangler.toml` and `workers/api/wrangler.toml`:
- `database_id` with D1 database ID
- `id` with KV namespace ID

### Step 3: Initialize database
```bash
cd workers
wrangler d1 execute aqi-bangalore --file=./schema.sql
```

### Step 4: Set OpenAQ API key
```bash
cd collector
wrangler secret put OPENAQ_API_KEY
# Paste: fd1f448933e016f1681815e31b60a150ca7d92925baed9716f7bc2c785ce3bf0
```

### Step 5: Deploy workers
```bash
# Deploy collector
cd workers/collector
npm install
wrangler deploy

# Deploy API
cd ../api
npm install
wrangler deploy
```

### Step 6: Test
```bash
# Health check
curl https://aqi-api.YOUR_SUBDOMAIN.workers.dev/api/health

# Trigger first data collection
curl https://aqi-collector.YOUR_SUBDOMAIN.workers.dev/trigger

# Get current data
curl https://aqi-api.YOUR_SUBDOMAIN.workers.dev/api/current
```

### Step 7: Update Astro site
In `.env`, uncomment and set:
```
PUBLIC_API_URL=https://aqi-api.YOUR_SUBDOMAIN.workers.dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/current` | Latest city-wide snapshot |
| `GET /api/history?days=30` | Daily averages |
| `GET /api/stations` | Per-station readings |
| `GET /api/health` | Service health |
| `GET /api/recent?hours=24` | Recent readings |

## Current Data Flow

**Until Workers deployed:**
- Astro fetches directly from OpenAQ at build time
- 14 Bangalore stations with PM2.5
- No historical chart (forecast section empty)

**After Workers deployed:**
- Collector runs every 3 hours
- Data stored in D1 + KV
- API serves cached current + historical data
- Astro can show historical Fucked Index chart

## Key Calculations

```typescript
// Fucked Index
const fuckedIndex = (pm25/5 * pm25/12) / 10;

// Cigarettes per day
const cigarettes = pm25 / 22;

// Years lost (per year of exposure)
const yearsLost = (pm25 - 5) / 10;
```

## Monitoring

```bash
# View collector logs
wrangler tail aqi-collector

# View API logs
wrangler tail aqi-api

# Check D1 data
wrangler d1 execute aqi-bangalore --command="SELECT * FROM collection_log ORDER BY timestamp DESC LIMIT 5"
```

## Environment Setup

Create `.env` in project root:
```bash
# WAQI API Token (required - get from https://aqicn.org/data-platform/token/)
WAQI_API_TOKEN=your_token_here

# OpenAQ API Key (optional - Bangalore data is stale)
OPENAQ_API_KEY=your_key_here
```

**IMPORTANT:** The `demo` WAQI token only returns Shanghai data. You MUST get a real token.

## Troubleshooting

**Getting Shanghai data instead of Bangalore:**
- You're using `WAQI_API_TOKEN=demo`
- Get a real token from https://aqicn.org/data-platform/token/

**No data showing:**
- Check WAQI token in `.env`
- Test: `curl "https://api.waqi.info/feed/@8190/?token=YOUR_TOKEN"`

**Build takes too long:**
- WAQI fetches 10 stations (~500ms total)
- If slower, check network connectivity

**Workers not collecting:**
- Check cron schedule: `0 */3 * * *` (every 3 hours)
- Manually trigger: `curl https://aqi-collector.X.workers.dev/trigger`
- Check logs: `wrangler tail aqi-collector`
