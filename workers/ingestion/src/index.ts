/**
 * AQI Data Ingestion Worker
 *
 * Scheduled Cloudflare Worker that:
 * 1. Fetches air quality data from WAQI API hourly
 * 2. Stores raw readings in D1
 * 3. Computes and stores city-level aggregates
 * 4. Updates daily aggregates
 *
 * Runs on cron: 0 * * * * (every hour at minute 0)
 */

import { CITIES, WAQI_CONFIG, METRICS } from './config';
import type { Env, WaqiResponse, StationReading, CitySnapshot } from './types';

export default {
  /**
   * Scheduled handler - runs on cron trigger
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting scheduled ingestion...`);

    try {
      const results = await ingestAllCities(env);
      console.log(`[${new Date().toISOString()}] Ingestion complete:`, results);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Ingestion failed:`, error);
      throw error;
    }
  },

  /**
   * HTTP handler - for manual triggers and health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manual trigger (protected by secret)
    if (url.pathname === '/trigger') {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        const results = await ingestAllCities(env);
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Stats endpoint
    if (url.pathname === '/stats') {
      const stats = await getIngestionStats(env);
      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('AQI Ingestion Worker', { status: 200 });
  },
};

/**
 * Main ingestion function - fetches and stores data for all cities
 */
async function ingestAllCities(env: Env): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const timestamp = new Date().toISOString();
  const hourTimestamp = truncateToHour(timestamp);

  for (const city of CITIES) {
    try {
      console.log(`Ingesting ${city.name}...`);

      // Fetch from WAQI
      const waqiData = await fetchWaqiData(city.waqiId, env.WAQI_API_TOKEN);

      if (!waqiData || waqiData.status !== 'ok') {
        results[city.slug] = { success: false, error: 'WAQI API error' };
        continue;
      }

      // Get or create city record
      const cityId = await ensureCity(env.DB, city);

      // Process station data
      const stations = extractStations(waqiData);
      const readings: StationReading[] = [];

      for (const station of stations) {
        const stationId = await ensureStation(env.DB, cityId, station);
        const reading = await insertReading(env.DB, stationId, station, timestamp);
        if (reading) readings.push(reading);
      }

      // Compute and store city snapshot
      const snapshot = await computeCitySnapshot(env.DB, cityId, readings, hourTimestamp);

      // Update daily aggregate
      await updateDailyAggregate(env.DB, cityId, hourTimestamp);

      results[city.slug] = {
        success: true,
        stations: readings.length,
        avgPm25: snapshot?.avgPm25,
      };
    } catch (error) {
      console.error(`Error ingesting ${city.name}:`, error);
      results[city.slug] = { success: false, error: String(error) };
    }
  }

  return results;
}

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getBackoffDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Fetch data from WAQI API with retry logic
 */
async function fetchWaqiData(stationId: string, token: string): Promise<WaqiResponse | null> {
  const url = `${WAQI_CONFIG.baseUrl}/feed/${stationId}/?token=${token}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        console.log(`WAQI retry attempt ${attempt}/${RETRY_CONFIG.maxRetries} after ${Math.round(delay)}ms delay`);
        await sleep(delay);
      }

      const response = await fetch(url, {
        headers: { 'User-Agent': WAQI_CONFIG.userAgent },
      });

      // Rate limit handling - wait and retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        console.warn(`WAQI rate limited, waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Server errors are retryable
      if (response.status >= 500) {
        lastError = new Error(`WAQI server error: ${response.status}`);
        console.error(`WAQI API error: ${response.status} (attempt ${attempt + 1})`);
        continue;
      }

      // Client errors are not retryable
      if (!response.ok) {
        console.error(`WAQI API client error: ${response.status} - not retrying`);
        return null;
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        lastError = new Error('Invalid WAQI response structure');
        console.error('Invalid WAQI response structure');
        continue;
      }

      return data;
    } catch (error) {
      lastError = error as Error;
      console.error(`WAQI fetch error (attempt ${attempt + 1}):`, error);

      // Network errors are retryable
      if (attempt < RETRY_CONFIG.maxRetries) {
        continue;
      }
    }
  }

  console.error(`WAQI fetch failed after ${RETRY_CONFIG.maxRetries + 1} attempts:`, lastError);
  return null;
}

/**
 * Extract station readings from WAQI response
 */
function extractStations(data: WaqiResponse): any[] {
  const stations: any[] = [];

  // Main station
  if (data.data) {
    stations.push({
      waqiId: String(data.data.idx),
      name: data.data.city?.name || 'Unknown',
      latitude: data.data.city?.geo?.[0],
      longitude: data.data.city?.geo?.[1],
      pm25: data.data.iaqi?.pm25?.v,
      pm10: data.data.iaqi?.pm10?.v,
      o3: data.data.iaqi?.o3?.v,
      no2: data.data.iaqi?.no2?.v,
      so2: data.data.iaqi?.so2?.v,
      co: data.data.iaqi?.co?.v,
      aqi: data.data.aqi,
      dominantPollutant: data.data.dominentpol,
      recordedAt: data.data.time?.iso,
    });
  }

  return stations;
}

/**
 * Ensure city exists in database, return ID
 */
async function ensureCity(db: D1Database, city: typeof CITIES[0]): Promise<number> {
  const existing = await db
    .prepare('SELECT id FROM cities WHERE slug = ?')
    .bind(city.slug)
    .first<{ id: number }>();

  if (existing) return existing.id;

  const result = await db
    .prepare(`
      INSERT INTO cities (slug, name, local_name, state, population, waqi_station_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(city.slug, city.name, city.localName, city.state, city.population, city.waqiId)
    .run();

  return result.meta.last_row_id as number;
}

/**
 * Ensure station exists in database, return ID
 */
async function ensureStation(db: D1Database, cityId: number, station: any): Promise<number> {
  const existing = await db
    .prepare('SELECT id FROM stations WHERE waqi_id = ?')
    .bind(station.waqiId)
    .first<{ id: number }>();

  if (existing) return existing.id;

  const result = await db
    .prepare(`
      INSERT INTO stations (city_id, waqi_id, name, latitude, longitude)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(cityId, station.waqiId, station.name, station.latitude, station.longitude)
    .run();

  return result.meta.last_row_id as number;
}

/**
 * Insert reading into database
 */
async function insertReading(
  db: D1Database,
  stationId: number,
  station: any,
  timestamp: string
): Promise<StationReading | null> {
  const recordedAt = station.recordedAt || timestamp;

  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO readings
        (station_id, recorded_at, pm25, pm10, o3, no2, so2, co, aqi, dominant_pollutant)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        stationId,
        recordedAt,
        station.pm25,
        station.pm10,
        station.o3,
        station.no2,
        station.so2,
        station.co,
        station.aqi,
        station.dominantPollutant
      )
      .run();

    return {
      stationId,
      pm25: station.pm25,
      pm10: station.pm10,
      o3: station.o3,
      no2: station.no2,
      so2: station.so2,
      co: station.co,
      aqi: station.aqi,
      dominantPollutant: station.dominantPollutant,
      recordedAt,
    };
  } catch (error) {
    console.error('Insert reading error:', error);
    return null;
  }
}

/**
 * Compute and store city-level snapshot
 */
async function computeCitySnapshot(
  db: D1Database,
  cityId: number,
  readings: StationReading[],
  hourTimestamp: string
): Promise<CitySnapshot | null> {
  const validReadings = readings.filter((r) => r.pm25 !== null && r.pm25 !== undefined);

  if (validReadings.length === 0) return null;

  const pm25Values = validReadings.map((r) => r.pm25 as number).sort((a, b) => a - b);
  const avgPm25 = pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length;
  const minPm25 = pm25Values[0];
  const maxPm25 = pm25Values[pm25Values.length - 1];
  const medianPm25 =
    pm25Values.length % 2 === 0
      ? (pm25Values[pm25Values.length / 2 - 1] + pm25Values[pm25Values.length / 2]) / 2
      : pm25Values[Math.floor(pm25Values.length / 2)];

  // Other pollutants (averages)
  const avgPm10 = average(validReadings.map((r) => r.pm10).filter(Boolean) as number[]);
  const avgO3 = average(validReadings.map((r) => r.o3).filter(Boolean) as number[]);
  const avgNo2 = average(validReadings.map((r) => r.no2).filter(Boolean) as number[]);
  const avgSo2 = average(validReadings.map((r) => r.so2).filter(Boolean) as number[]);
  const avgCo = average(validReadings.map((r) => r.co).filter(Boolean) as number[]);

  // Dominant pollutant (most common)
  const pollutantCounts: Record<string, number> = {};
  validReadings.forEach((r) => {
    if (r.dominantPollutant) {
      pollutantCounts[r.dominantPollutant] = (pollutantCounts[r.dominantPollutant] || 0) + 1;
    }
  });
  const dominantPollutant = Object.entries(pollutantCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const snapshot: CitySnapshot = {
    cityId,
    recordedAt: hourTimestamp,
    avgPm25,
    minPm25,
    maxPm25,
    medianPm25,
    avgPm10,
    avgO3,
    avgNo2,
    avgSo2,
    avgCo,
    totalStations: readings.length,
    validStations: validReadings.length,
    dominantPollutant,
    qualityStatus: validReadings.length >= readings.length * 0.8 ? 'healthy' : 'degraded',
  };

  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO city_snapshots
        (city_id, recorded_at, avg_pm25, min_pm25, max_pm25, median_pm25,
         avg_pm10, avg_o3, avg_no2, avg_so2, avg_co,
         total_stations, valid_stations, dominant_pollutant, quality_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        cityId,
        hourTimestamp,
        avgPm25,
        minPm25,
        maxPm25,
        medianPm25,
        avgPm10,
        avgO3,
        avgNo2,
        avgSo2,
        avgCo,
        readings.length,
        validReadings.length,
        dominantPollutant,
        snapshot.qualityStatus
      )
      .run();

    return snapshot;
  } catch (error) {
    console.error('Insert snapshot error:', error);
    return null;
  }
}

/**
 * Update daily aggregate for the given hour
 */
async function updateDailyAggregate(
  db: D1Database,
  cityId: number,
  hourTimestamp: string
): Promise<void> {
  const date = hourTimestamp.split('T')[0]; // YYYY-MM-DD

  // Get all snapshots for this day
  const snapshots = await db
    .prepare(`
      SELECT avg_pm25, min_pm25, max_pm25, recorded_at
      FROM city_snapshots
      WHERE city_id = ? AND date(recorded_at) = ?
      ORDER BY recorded_at
    `)
    .bind(cityId, date)
    .all<{ avg_pm25: number; min_pm25: number; max_pm25: number; recorded_at: string }>();

  if (!snapshots.results || snapshots.results.length === 0) return;

  const pm25Values = snapshots.results.map((s) => s.avg_pm25).filter(Boolean);
  const avgPm25 = average(pm25Values);
  const minPm25 = Math.min(...snapshots.results.map((s) => s.min_pm25).filter(Boolean));
  const maxPm25 = Math.max(...snapshots.results.map((s) => s.max_pm25).filter(Boolean));

  // Find peak hour
  let peakHour = 0;
  let peakPm25 = 0;
  snapshots.results.forEach((s) => {
    if (s.avg_pm25 > peakPm25) {
      peakPm25 = s.avg_pm25;
      peakHour = new Date(s.recorded_at).getHours();
    }
  });

  // Compute health metrics
  const cigarettesEquivalent = avgPm25 / METRICS.CIGARETTE_PM25_EQUIVALENT;
  const yearsLostPerYear = Math.max(0, (avgPm25 - METRICS.WHO_GUIDELINE) / 10) * METRICS.AQLI_YEARS_PER_10UG;
  const whoViolation = avgPm25 / METRICS.WHO_GUIDELINE;

  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO daily_aggregates
        (city_id, date, avg_pm25, min_pm25, max_pm25, peak_hour, peak_pm25,
         cigarettes_equivalent, years_lost_per_year, who_violation_factor, hours_with_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        cityId,
        date,
        avgPm25,
        minPm25,
        maxPm25,
        peakHour,
        peakPm25,
        cigarettesEquivalent,
        yearsLostPerYear,
        whoViolation,
        snapshots.results.length
      )
      .run();
  } catch (error) {
    console.error('Update daily aggregate error:', error);
  }
}

/**
 * Get ingestion statistics
 */
async function getIngestionStats(env: Env): Promise<Record<string, any>> {
  const totalReadings = await env.DB
    .prepare('SELECT COUNT(*) as count FROM readings')
    .first<{ count: number }>();

  const totalSnapshots = await env.DB
    .prepare('SELECT COUNT(*) as count FROM city_snapshots')
    .first<{ count: number }>();

  const latestSnapshot = await env.DB
    .prepare('SELECT recorded_at FROM city_snapshots ORDER BY recorded_at DESC LIMIT 1')
    .first<{ recorded_at: string }>();

  const cityCounts = await env.DB
    .prepare(`
      SELECT c.name, COUNT(cs.id) as snapshot_count
      FROM cities c
      LEFT JOIN city_snapshots cs ON c.id = cs.city_id
      GROUP BY c.id
    `)
    .all<{ name: string; snapshot_count: number }>();

  return {
    totalReadings: totalReadings?.count || 0,
    totalSnapshots: totalSnapshots?.count || 0,
    latestSnapshot: latestSnapshot?.recorded_at,
    cityCounts: cityCounts.results,
  };
}

// Utility functions
function truncateToHour(isoString: string): string {
  const date = new Date(isoString);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
