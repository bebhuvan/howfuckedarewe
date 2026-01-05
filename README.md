# howfuckedarewe.in

India Air Quality Dashboard — real-time PM2.5 data with sardonic commentary.

## What This Is

A visceral look at air quality in India's major cities. Presents pollution data in human terms: cigarettes smoked, years of life lost, whether other countries would panic at these levels.

**Live at**: [howfuckedarewe.in](https://howfuckedarewe.in)

## Tech Stack

- **Framework**: [Astro](https://astro.build) 5.x with SSR
- **Hosting**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Data Source**: [WAQI API](https://aqicn.org/api/)

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Deployment

Full deployment to Cloudflare:

```bash
# 1. Login to Cloudflare
wrangler login

# 2. Create D1 database
wrangler d1 create aqi-historical

# 3. Update database_id in wrangler.toml files

# 4. Run migrations
npm run db:migrate

# 5. Deploy ingestion worker
cd workers/ingestion
npm install
wrangler secret put WAQI_API_TOKEN  # Enter your token
npm run deploy
cd ../..

# 6. Deploy main site
npm run deploy
```

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for detailed instructions.

## Project Structure

```
├── src/
│   ├── components/       # Astro components
│   ├── layouts/          # Page layouts
│   ├── lib/              # Data fetching, calculations
│   └── pages/            # Routes
├── workers/
│   └── ingestion/        # Hourly data ingestion worker
├── migrations/           # D1 database schema
├── docs/                 # Documentation
└── wrangler.toml         # Cloudflare config
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) — System design and data flow
- [Deployment](./docs/DEPLOYMENT.md) — Step-by-step deployment guide
- [Database](./docs/DATABASE.md) — Schema and common queries

## Data & Methodology

- **PM2.5 data**: WAQI API (World Air Quality Index)
- **Cigarette equivalence**: Berkeley Earth — 22 µg/m³ = 1 cig/day mortality risk
- **Life years lost**: AQLI — 0.98 years per 10 µg/m³ above WHO guideline
- **WHO guideline**: 5 µg/m³ annual mean

See [/methodology](https://howfuckedarewe.in/methodology) on the live site.

## Cities Covered

- Delhi
- Mumbai
- Kolkata
- Bangalore
- Chennai

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview with Cloudflare bindings |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate` | Run database migrations |

## License

MIT

---

*Built with frustration at the state of air quality in India.*
