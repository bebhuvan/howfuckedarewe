# howfuckedarewe.in — Documentation

India Air Quality Dashboard with historical data storage.

## Quick Links

- [Architecture Overview](./ARCHITECTURE.md) - System design and data flow
- [Deployment Guide](./DEPLOYMENT.md) - Step-by-step deployment instructions
- [Database Schema](./DATABASE.md) - D1 table structures and queries

## Project Structure

```
/
├── src/                      # Astro site source
│   ├── components/           # UI components
│   ├── layouts/              # Page layouts
│   ├── lib/                  # Utilities & data fetching
│   │   ├── waqi.ts          # WAQI API client
│   │   ├── db.ts            # D1 database queries
│   │   ├── calculations.ts  # Health metrics
│   │   └── cities.ts        # City configuration
│   └── pages/                # Route pages
│
├── workers/                  # Cloudflare Workers
│   └── ingestion/           # Data ingestion worker
│       ├── src/
│       │   ├── index.ts     # Main worker entry
│       │   ├── config.ts    # Configuration
│       │   └── types.ts     # Type definitions
│       ├── wrangler.toml    # Worker config
│       └── package.json
│
├── migrations/               # D1 database migrations
│   └── 0001_initial_schema.sql
│
├── docs/                     # Documentation
│
├── wrangler.toml            # Main site Cloudflare config
├── astro.config.mjs         # Astro configuration
└── package.json
```

## Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Astro 5.x | Static + SSR site generation |
| Runtime | Cloudflare Workers | Edge compute |
| Database | Cloudflare D1 | Historical data storage |
| Data Source | WAQI API | Air quality data |
| Styling | Scoped CSS | Component-level styles |

## Data Sources

### WAQI (World Air Quality Index)

- **API**: `https://api.waqi.info`
- **Data**: Real-time PM2.5, PM10, O3, NO2, SO2, CO
- **Coverage**: 5 Indian cities with CPCB stations
- **Rate Limit**: ~1000 requests/minute (free tier)

### Health Metrics

| Metric | Source | Calculation |
|--------|--------|-------------|
| Cigarette equivalence | Berkeley Earth | PM2.5 ÷ 22 |
| Years of life lost | AQLI | (PM2.5 - 5) × 0.098 per 10 µg/m³ |
| WHO violation | WHO Guidelines | PM2.5 ÷ 5 |

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Database Management

```bash
# Run migrations
npm run db:migrate

# Open D1 Studio (visual browser)
wrangler d1 studio aqi-historical

# Execute raw SQL
wrangler d1 execute aqi-historical --command="SELECT COUNT(*) FROM readings;"
```

### Worker Development

```bash
cd workers/ingestion

# Local dev with hot reload
npm run dev

# Deploy to production
npm run deploy

# View live logs
npm run tail
```

## Adding a New City

1. Add city config to `src/lib/cities.ts`
2. Add city to `workers/ingestion/src/config.ts`
3. Find WAQI station ID from [aqicn.org/city/india/](https://aqicn.org/city/india/)
4. Deploy both worker and site
5. Data will start flowing on next ingestion run

## Monitoring & Alerts

### Ingestion Health

The ingestion worker exposes:

- `GET /health` - Basic health check
- `GET /stats` - Ingestion statistics

### Recommended Alerts

1. **Uptime monitoring**: Ping `/health` endpoint
2. **Data freshness**: Alert if latest snapshot > 2 hours old
3. **Error rate**: Monitor Cloudflare analytics

## Cost Estimation

Cloudflare free tier covers:

- **Workers**: 100,000 requests/day
- **D1**: 5 million rows read/day, 100,000 rows written/day
- **Storage**: 5 GB

For this project (~5 cities, hourly ingestion):

- ~5 writes/hour = 120 writes/day (well under limit)
- ~1000 reads/day typical traffic (well under limit)
- ~10 MB storage after 1 year (well under limit)

## License

MIT License - see LICENSE file
