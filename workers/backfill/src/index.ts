/**
 * AQI Historical Backfill Worker
 *
 * HTTP-triggered worker that imports historical data from OpenAQ.
 * Designed for one-time backfill and periodic catch-up.
 *
 * Endpoints:
 * - GET /status - Check backfill status
 * - POST /backfill?start=YYYY-MM-DD&end=YYYY-MM-DD - Start backfill
 * - POST /discover - Discover and map OpenAQ stations
 */

import {
  findIndiaPM25Locations,
  fetchSensorDays,
  getPM25SensorId,
  mapToCity,
  type OpenAQLocation,
  type OpenAQDailyMeasurement,
} from '../../../src/lib/openaq';

interface Env {
  DB: D1Database;
  OPENAQ_API_KEY: string;
  BACKFILL_BATCH_SIZE: string;
  BACKFILL_RATE_LIMIT_MS: string;
}

// Our city coordinates for mapping
const CITIES = [
  { slug: 'delhi', coordinates: { lat: 28.6139, lng: 77.209 } },
  { slug: 'mumbai', coordinates: { lat: 19.076, lng: 72.8777 } },
  { slug: 'kolkata', coordinates: { lat: 22.5726, lng: 88.3639 } },
  { slug: 'bangalore', coordinates: { lat: 12.9716, lng: 77.5946 } },
  { slug: 'chennai', coordinates: { lat: 13.0827, lng: 80.2707 } },
  { slug: 'hyderabad', coordinates: { lat: 17.385, lng: 78.4867 } },
  { slug: 'ahmedabad', coordinates: { lat: 23.0225, lng: 72.5714 } },
  { slug: 'patna', coordinates: { lat: 25.5941, lng: 85.1376 } },
  { slug: 'lucknow', coordinates: { lat: 26.8467, lng: 80.9462 } },
  { slug: 'agra', coordinates: { lat: 27.1767, lng: 78.0081 } },
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Status - check backfill progress
    if (url.pathname === '/status') {
      const status = await getBackfillStatus(env.DB);
      return json(status);
    }

    // Discover - find and map OpenAQ stations
    if (url.pathname === '/discover' && request.method === 'POST') {
      try {
        const result = await discoverAndMapStations(env);
        return json({ success: true, result });
      } catch (error) {
        return json({ success: false, error: String(error) }, 500);
      }
    }

    // Backfill - import historical data
    if (url.pathname === '/backfill' && request.method === 'POST') {
      const startDate = url.searchParams.get('start');
      const endDate = url.searchParams.get('end') || new Date().toISOString().split('T')[0];
      const citySlug = url.searchParams.get('city'); // Optional: specific city

      if (!startDate) {
        return json({ error: 'Missing start date parameter' }, 400);
      }

      try {
        const result = await runBackfill(env, startDate, endDate, citySlug);
        return json({ success: true, result });
      } catch (error) {
        return json({ success: false, error: String(error) }, 500);
      }
    }

    return new Response('AQI Backfill Worker\n\nEndpoints:\n- GET /status\n- POST /discover\n- POST /backfill?start=YYYY-MM-DD&end=YYYY-MM-DD', {
      status: 200,
    });
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Station Discovery
// ============================================================================

async function discoverAndMapStations(env: Env): Promise<{ found: number; mapped: number }> {
  console.log('Discovering OpenAQ stations for India...');

  const locations = await findIndiaPM25Locations(env.OPENAQ_API_KEY);
  console.log(`Found ${locations.length} OpenAQ locations`);

  let mapped = 0;

  for (const location of locations) {
    // Skip if no recent data
    if (!location.datetimeLast) continue;

    const lastUpdate = new Date(location.datetimeLast.utc);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 7) continue; // Skip stale stations

    // Get PM2.5 sensor ID
    const sensorId = getPM25SensorId(location);
    if (!sensorId) continue;

    // Map to our city
    const citySlug = mapToCity(location, CITIES, 50);

    // Get city ID from database
    let cityId: number | null = null;
    if (citySlug) {
      const cityRow = await env.DB.prepare('SELECT id FROM cities WHERE slug = ?')
        .bind(citySlug)
        .first<{ id: number }>();
      cityId = cityRow?.id || null;
    }

    // Insert or update mapping
    try {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO openaq_stations
        (openaq_location_id, openaq_sensor_id, city_id, name, latitude, longitude, is_active, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `)
        .bind(
          location.id,
          sensorId,
          cityId,
          location.name,
          location.coordinates.latitude,
          location.coordinates.longitude,
          location.datetimeLast?.utc
        )
        .run();

      if (cityId) mapped++;
    } catch (error) {
      console.error(`Error mapping station ${location.id}:`, error);
    }
  }

  return { found: locations.length, mapped };
}

// ============================================================================
// Historical Backfill
// ============================================================================

async function runBackfill(
  env: Env,
  startDate: string,
  endDate: string,
  citySlug?: string | null
): Promise<{ stations: number; readings: number; errors: number }> {
  const batchSize = parseInt(env.BACKFILL_BATCH_SIZE) || 30;
  const rateLimitMs = parseInt(env.BACKFILL_RATE_LIMIT_MS) || 500;

  console.log(`Starting backfill from ${startDate} to ${endDate}`);

  // Get stations to process
  let stationsQuery = `
    SELECT os.*, c.slug as city_slug
    FROM openaq_stations os
    LEFT JOIN cities c ON os.city_id = c.id
    WHERE os.is_active = 1
  `;

  if (citySlug) {
    stationsQuery += ` AND c.slug = '${citySlug}'`;
  }

  const stations = await env.DB.prepare(stationsQuery).all<{
    openaq_location_id: number;
    openaq_sensor_id: number;
    city_id: number;
    city_slug: string;
    name: string;
  }>();

  if (!stations.results || stations.results.length === 0) {
    throw new Error('No stations found. Run /discover first.');
  }

  console.log(`Processing ${stations.results.length} stations`);

  let totalReadings = 0;
  let errors = 0;

  for (const station of stations.results) {
    if (!station.openaq_sensor_id || !station.city_id) continue;

    try {
      console.log(`Fetching data for ${station.name} (sensor ${station.openaq_sensor_id})`);

      // Fetch daily data from OpenAQ
      const dailyData = await fetchSensorDays(
        station.openaq_sensor_id,
        env.OPENAQ_API_KEY,
        365 // Last year
      );

      console.log(`Got ${dailyData.length} days of data`);

      // Filter to our date range and insert
      for (const day of dailyData) {
        const date = day.period.datetimeTo.local.split('T')[0];

        // Check date range
        if (date < startDate || date > endDate) continue;

        // Insert into daily_aggregates
        try {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO daily_aggregates
            (city_id, date, avg_pm25, min_pm25, max_pm25, hours_with_data,
             cigarettes_equivalent, years_lost_per_year, who_violation_factor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
            .bind(
              station.city_id,
              date,
              day.summary.avg,
              day.summary.min,
              day.summary.max,
              day.coverage.observedCount,
              day.summary.avg / 22, // Cigarette equivalent
              Math.max(0, (day.summary.avg - 5) / 10) * 0.98, // Years lost
              day.summary.avg / 5 // WHO violation
            )
            .run();

          totalReadings++;
        } catch (insertError) {
          // Ignore duplicate key errors
          console.log(`Skipped duplicate: ${station.city_slug} ${date}`);
        }
      }

      // Rate limit
      await sleep(rateLimitMs);
    } catch (error) {
      console.error(`Error processing station ${station.name}:`, error);
      errors++;
    }
  }

  // Update backfill progress
  await env.DB.prepare(`
    INSERT INTO backfill_progress
    (source, start_date, end_date, last_processed_date, records_imported, status)
    VALUES ('openaq', ?, ?, ?, ?, 'completed')
  `)
    .bind(startDate, endDate, endDate, totalReadings)
    .run();

  return {
    stations: stations.results.length,
    readings: totalReadings,
    errors,
  };
}

// ============================================================================
// Status Check
// ============================================================================

async function getBackfillStatus(db: D1Database): Promise<Record<string, any>> {
  // Count mapped stations
  const stationCount = await db
    .prepare('SELECT COUNT(*) as count FROM openaq_stations WHERE city_id IS NOT NULL')
    .first<{ count: number }>();

  // Count readings
  const readingCount = await db
    .prepare('SELECT COUNT(*) as count FROM daily_aggregates')
    .first<{ count: number }>();

  // Get date range
  const dateRange = await db
    .prepare('SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_aggregates')
    .first<{ min_date: string; max_date: string }>();

  // Get last backfill run
  const lastRun = await db
    .prepare(`
      SELECT * FROM backfill_progress
      ORDER BY id DESC
      LIMIT 1
    `)
    .first();

  return {
    mappedStations: stationCount?.count || 0,
    totalReadings: readingCount?.count || 0,
    dateRange: {
      earliest: dateRange?.min_date,
      latest: dateRange?.max_date,
    },
    lastBackfill: lastRun,
  };
}
