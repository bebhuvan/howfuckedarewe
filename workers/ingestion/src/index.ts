/**
 * AQI Data Ingestion Worker v2
 *
 * Scheduled Cloudflare Worker that:
 * 1. Fetches air quality data from WAQI API hourly for ALL stations
 * 2. Stores raw readings in D1
 * 3. Computes and stores city-level aggregates
 * 4. Updates daily aggregates
 *
 * Runs on cron: 0 * * * * (every hour at minute 0)
 */

import { CITIES, WAQI_CONFIG, METRICS, type CityConfig, type StationConfig } from './config';
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
      const results = await ingestAllCities(env, 'scheduled');
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
        const results = await ingestAllCities(env, 'manual');
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

    return new Response('AQI Ingestion Worker v2 - Multi-Station', { status: 200 });
  },
};

/**
 * Main ingestion function - fetches and stores data for all cities
 */
async function ingestAllCities(env: Env, source: string = 'scheduled'): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const timestamp = new Date().toISOString();
  const hourTimestamp = truncateToHour(timestamp);

  // START LOGGING
  let logId: number | null = null;
  try {
    logId = await createIngestionLog(env.DB, source, timestamp);
  } catch (e) {
    console.error('Failed to create ingestion log:', e);
  }

  let totalRecords = 0;
  let citiesProcessed = 0;

  // SHARDING LOGIC
  // Cloudflare Workers has a CPU limit, so we split the work.
  // Even Hours: First 50% of cities
  // Odd Hours: Last 50% of cities
  // Manual trigger: All cities (source === 'manual')

  const currentHour = new Date().getHours();
  console.log(`Current hour: ${currentHour}, Source: ${source}`);

  let citiesToProcess: typeof CITIES;

  if (source === 'manual') {
    // Manual trigger always runs everything
    citiesToProcess = CITIES;
    console.log(`Manual trigger: Processing ALL ${CITIES.length} cities.`);
  } else {
    // Scheduled trigger uses sharding
    const half = Math.ceil(CITIES.length / 2);
    if (currentHour % 2 === 0) {
      // Even hours: First half
      citiesToProcess = CITIES.slice(0, half);
      console.log(`Even hour (${currentHour}): Processing first ${half} cities.`);
    } else {
      // Odd hours: Second half
      citiesToProcess = CITIES.slice(half);
      console.log(`Odd hour (${currentHour}): Processing last ${CITIES.length - half} cities.`);
    }
  }

  for (const city of citiesToProcess) {
    try {
      console.log(`Ingesting ${city.name} (${city.stations.length} stations)...`);

      // Get or create city record
      const cityId = await ensureCity(env.DB, city);

      // Fetch ALL stations for this city with batching
      const stationDataMap = await fetchStationsBatched(city.stations, env.WAQI_API_TOKEN);

      const readings: StationReading[] = [];
      let latestStationTime = timestamp;

      for (const stationConfig of city.stations) {
        const rawData = stationDataMap.get(stationConfig.id);
        if (!rawData || rawData.status !== 'ok' || !rawData.data) continue;

        const stationId = await ensureStation(env.DB, cityId, {
          waqiId: String(stationConfig.id),
          name: stationConfig.name,
          area: stationConfig.area,
          latitude: rawData.data.city?.geo?.[0],
          longitude: rawData.data.city?.geo?.[1],
        });

        const reading = await insertReading(env.DB, stationId, stationConfig.area, rawData.data, timestamp);
        if (reading) {
          readings.push(reading);
          // Track the actual data timestamp
          if (rawData.data.time?.iso) {
            latestStationTime = rawData.data.time.iso;
          }
        }
      }

      // Compute and store city snapshot using actual data timestamp
      const snapshot = await computeCitySnapshot(env.DB, cityId, readings, hourTimestamp, city.stations.length);

      // Update daily aggregate
      await updateDailyAggregate(env.DB, cityId, hourTimestamp);

      results[city.slug] = {
        success: true,
        totalStations: city.stations.length,
        validStations: readings.length,
        avgPm25: snapshot?.avgPm25,
        dataTimestamp: latestStationTime,
      };

      totalRecords += readings.length;
      citiesProcessed++;
    } catch (error) {
      console.error(`Error ingesting ${city.name}:`, error);
      results[city.slug] = { success: false, error: String(error) };
    }
  }

  // END LOGGING
  if (logId) {
    await updateIngestionLog(env.DB, logId, 'completed', citiesProcessed, totalRecords);
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
 * Fetch multiple stations with batching and rate limiting
 */
async function fetchStationsBatched(
  stations: StationConfig[],
  token: string
): Promise<Map<number, WaqiResponse>> {
  const results = new Map<number, WaqiResponse>();

  for (let i = 0; i < stations.length; i += WAQI_CONFIG.maxConcurrent) {
    const batch = stations.slice(i, i + WAQI_CONFIG.maxConcurrent);

    const promises = batch.map(async (station) => {
      const data = await fetchWaqiData(station.id, token);
      if (data) {
        results.set(station.id, data);
      }
    });

    await Promise.all(promises);

    // Delay between batches
    if (i + WAQI_CONFIG.maxConcurrent < stations.length) {
      await sleep(WAQI_CONFIG.delayBetweenBatchesMs);
    }
  }

  return results;
}

/**
 * Fetch data from WAQI API with retry logic
 */
async function fetchWaqiData(stationId: number, token: string): Promise<WaqiResponse | null> {
  const url = `${WAQI_CONFIG.baseUrl}/feed/@${stationId}/?token=${token}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        console.log(`WAQI retry for station ${stationId} attempt ${attempt}/${RETRY_CONFIG.maxRetries} after ${Math.round(delay)}ms delay`);
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

      return data as WaqiResponse;
    } catch (error) {
      lastError = error as Error;
      console.error(`WAQI fetch error (attempt ${attempt + 1}):`, error);

      // Network errors are retryable
      if (attempt < RETRY_CONFIG.maxRetries) {
        continue;
      }
    }
  }

  console.error(`WAQI fetch failed for station ${stationId} after ${RETRY_CONFIG.maxRetries + 1} attempts:`, lastError);
  return null;
}

/**
 * Ensure city exists in database, return ID
 */
async function ensureCity(db: D1Database, city: CityConfig): Promise<number> {
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
    .bind(city.slug, city.name, city.localName, city.state, city.population, city.stations[0]?.id.toString() || '')
    .run();

  return result.meta.last_row_id as number;
}

/**
 * Ensure station exists in database, return ID
 */
async function ensureStation(db: D1Database, cityId: number, station: {
  waqiId: string;
  name: string;
  area: string;
  latitude?: number;
  longitude?: number;
}): Promise<number> {
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
  area: string,
  data: WaqiResponse['data'],
  timestamp: string
): Promise<StationReading | null> {
  if (!data) return null;

  const recordedAt = data.time?.iso || timestamp;
  const pm25 = data.iaqi?.pm25?.v ?? null;
  const pm10 = data.iaqi?.pm10?.v ?? null;
  const o3 = data.iaqi?.o3?.v ?? null;
  const no2 = data.iaqi?.no2?.v ?? null;
  const so2 = data.iaqi?.so2?.v ?? null;
  const co = data.iaqi?.co?.v ?? null;
  const aqi = typeof data.aqi === 'number' ? data.aqi : null;
  const dominantPollutant = data.dominentpol || null;

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
        pm25,
        pm10,
        o3,
        no2,
        so2,
        co,
        aqi,
        dominantPollutant
      )
      .run();

    return {
      stationId,
      area,
      pm25,
      pm10,
      o3,
      no2,
      so2,
      co,
      aqi,
      dominantPollutant,
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
  hourTimestamp: string,
  totalStationCount: number
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
    totalStations: totalStationCount,
    validStations: validReadings.length,
    dominantPollutant,
    qualityStatus: validReadings.length >= totalStationCount * 0.5 ? 'healthy' : 'degraded',
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
        totalStationCount,
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
  const cigarettesEquivalent = avgPm25 !== null ? avgPm25 / METRICS.CIGARETTE_PM25_EQUIVALENT : 0;
  const yearsLostPerYear = avgPm25 !== null ? Math.max(0, (avgPm25 - METRICS.WHO_GUIDELINE) / 10) * METRICS.AQLI_YEARS_PER_10UG : 0;
  const whoViolation = avgPm25 !== null ? avgPm25 / METRICS.WHO_GUIDELINE : 0;

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
      SELECT c.name, COUNT(cs.id) as snapshot_count,
             (SELECT COUNT(*) FROM stations s WHERE s.city_id = c.id) as station_count
      FROM cities c
      LEFT JOIN city_snapshots cs ON c.id = cs.city_id
      GROUP BY c.id
    `)
    .all<{ name: string; snapshot_count: number; station_count: number }>();

  const totalStations = await env.DB
    .prepare('SELECT COUNT(*) as count FROM stations')
    .first<{ count: number }>();

  return {
    totalReadings: totalReadings?.count || 0,
    totalSnapshots: totalSnapshots?.count || 0,
    totalStations: totalStations?.count || 0,
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

/**
 * Create a new ingestion log entry
 */
async function createIngestionLog(db: D1Database, source: string, startedAt: string): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO ingestion_logs (started_at, status, source)
    VALUES (?, 'running', ?)
  `).bind(startedAt, source).run();

  return result.meta.last_row_id as number;
}

/**
 * Update ingestion log upon completion
 */
async function updateIngestionLog(
  db: D1Database,
  id: number,
  status: 'completed' | 'failed',
  cities: number,
  records: number,
  error?: string
): Promise<void> {
  let query = `
    UPDATE ingestion_logs 
    SET completed_at = ?, status = ?, cities_processed = ?, records_processed = ?
    WHERE id = ?
  `;

  const completedAt = new Date().toISOString();

  if (error) {
    query = `
      UPDATE ingestion_logs 
      SET completed_at = ?, status = ?, cities_processed = ?, records_processed = ?, error = ?
      WHERE id = ?
    `;
    await db.prepare(query).bind(completedAt, status, cities, records, error, id).run();
  } else {
    await db.prepare(query).bind(completedAt, status, cities, records, id).run();
  }
}
