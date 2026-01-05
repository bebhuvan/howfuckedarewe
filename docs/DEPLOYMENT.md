# Deployment Guide

Complete guide to deploying howfuckedarewe.in to Cloudflare.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```
3. **WAQI API Token**: Get free token from [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/)

## Step 1: Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser to authenticate your Cloudflare account.

## Step 2: Create D1 Database

```bash
# Create the production database
wrangler d1 create aqi-historical

# Note the database_id from the output
# Example output:
# ✅ Successfully created DB 'aqi-historical'
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Update the `database_id` in both wrangler.toml files:

1. `/wrangler.toml` (main site)
2. `/workers/ingestion/wrangler.toml` (ingestion worker)

## Step 3: Run Database Migrations

```bash
# Apply the schema to production database
wrangler d1 execute aqi-historical --file=./migrations/0001_initial_schema.sql
```

Verify the tables were created:

```bash
wrangler d1 execute aqi-historical --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## Step 4: Deploy Ingestion Worker

```bash
cd workers/ingestion

# Install dependencies
npm install

# Set the WAQI API token as a secret
wrangler secret put WAQI_API_TOKEN
# Paste your token when prompted

# Set a trigger secret for manual invocations
wrangler secret put TRIGGER_SECRET
# Enter a random string

# Deploy the worker
npm run deploy
```

Verify deployment:

```bash
# Check health endpoint
curl https://aqi-ingestion.<your-subdomain>.workers.dev/health

# Manually trigger ingestion (optional)
curl -X POST https://aqi-ingestion.<your-subdomain>.workers.dev/trigger \
  -H "Authorization: Bearer <your-trigger-secret>"
```

## Step 5: Deploy Main Site

```bash
# Return to root directory
cd ../..

# Install dependencies
npm install

# Build and deploy
npm run deploy
```

## Step 6: Configure Custom Domain (Optional)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select `howfuckedarewe` worker
3. Go to Settings → Triggers → Custom Domains
4. Add your domain (e.g., `howfuckedarewe.in`)

## Step 7: Verify Everything Works

1. **Check the site**: Visit your worker URL or custom domain
2. **Check ingestion logs**: 
   ```bash
   wrangler tail aqi-ingestion
   ```
3. **Check D1 data** (after first ingestion):
   ```bash
   wrangler d1 execute aqi-historical --command="SELECT * FROM city_snapshots LIMIT 5;"
   ```

## Environment Variables

### Main Site (`wrangler.toml`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SITE_URL` | Full site URL | No |

### Ingestion Worker (`workers/ingestion/wrangler.toml`)

| Secret | Description | Required |
|--------|-------------|----------|
| `WAQI_API_TOKEN` | WAQI API authentication token | Yes |
| `TRIGGER_SECRET` | Bearer token for manual triggers | No |

## Scheduled Triggers

The ingestion worker runs automatically via cron:

- **Schedule**: `0 * * * *` (every hour at minute 0)
- **Timezone**: UTC

To modify the schedule, edit `workers/ingestion/wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]  # Change this
```

## Rollback

To rollback to a previous version:

```bash
# List recent deployments
wrangler deployments list

# Rollback to specific version
wrangler rollback <deployment-id>
```

## Local Development

### Main Site

```bash
npm run dev
```

This starts Astro dev server with Cloudflare bindings via platformProxy.

### Ingestion Worker

```bash
cd workers/ingestion
npm run dev
```

### Local D1 Database

For local testing, create a dev database:

```bash
wrangler d1 create aqi-historical-dev

# Run migrations locally
wrangler d1 execute aqi-historical-dev --file=./migrations/0001_initial_schema.sql --local
```

## Troubleshooting

### "Database not found" error

- Ensure `database_id` is set correctly in wrangler.toml
- Verify you ran migrations

### Ingestion not running

- Check cron schedule in wrangler.toml
- View logs: `wrangler tail aqi-ingestion`
- Verify WAQI_API_TOKEN is set: `wrangler secret list`

### Site showing old data

- Check ingestion worker logs for errors
- Manually trigger ingestion
- Verify D1 has recent data

### D1 query timeout

- D1 has a 30-second query timeout
- Optimize queries with proper indexes
- Consider reducing data retention
