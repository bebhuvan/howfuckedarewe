/**
 * AQI Data Ingestion Worker v2
 *
 * Scheduled Cloudflare Worker that:
 * 1. Fetches air quality data from WAQI API hourly for ALL stations
 * 2. Stores raw readings in D1
 * 3. Computes and stores city-level aggregates
 * 4. Updates daily aggregates
 * 5. Runs monthly aggregation (on 2nd of each month)
 * 6. Cleans up old hourly snapshots (keeps 7 days)
 *
 * Cron schedule:
 * - 0,20,40 * * * * (ingestion: 3x per hour)
 * - 30 19 * * *     (daily cleanup: 00:30 IST = 19:00 UTC prev day)
 * - 30 19 2 * *     (monthly aggregation: 2nd of month at 00:30 IST)
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
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const dayOfMonth = now.getUTCDate();

    console.log(`[${now.toISOString()}] Scheduled trigger - hour:${hour}, minute:${minute}, day:${dayOfMonth}`);

    // Check if this is the maintenance window (19:00 UTC = 00:30 IST)
    // Runs during the normal :00 ingestion trigger at hour 19
    const isMaintenanceWindow = hour === 19 && minute === 0;

    // Always run ingestion first
    try {
      const results = await ingestAllCities(env, 'scheduled');
      console.log(`[${new Date().toISOString()}] Ingestion complete:`, results);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Ingestion failed:`, error);
      // Don't throw - continue to maintenance if applicable
    }

    // Run maintenance tasks during maintenance window
    if (isMaintenanceWindow) {
      console.log('Running maintenance jobs...');

      // Monthly aggregation: Run on 2nd of each month
      if (dayOfMonth === 2) {
        console.log('Running monthly aggregation...');
        try {
          const monthlyResult = await runMonthlyAggregation(env.DB);
          console.log('Monthly aggregation result:', monthlyResult);
        } catch (e) {
          console.error('Monthly aggregation failed:', e);
        }
      }

      // Daily cleanup: Run every day
      console.log('Running snapshot cleanup...');
      try {
        const cleanupResult = await cleanupOldSnapshots(env.DB);
        console.log('Cleanup result:', cleanupResult);
      } catch (e) {
        console.error('Cleanup failed:', e);
      }
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

  // SHARDING LOGIC (v3 - Subrequest Limit Aware)
  // Cloudflare Workers FREE tier has a 50 subrequests limit per invocation.
  // We must keep each shard under ~45 requests to allow for retries.
  // 
  // Station counts: Delhi=17, Mumbai=20, Kolkata=10, Bangalore=10,
  //                 Chennai=6, Hyderabad=9, Ahmedabad=7, Patna=6, Lucknow=6, Agra=5
  // 
  // Strategy: 3-way sharding by minute within the hour
  // - Minute 0:  Delhi(17) + Kolkata(10) = 27 stations
  // - Minute 20: Mumbai(20) + Bangalore(10) = 30 stations  
  // - Minute 40: Chennai + Hyderabad + Ahmedabad + Patna + Lucknow + Agra = 39 stations
  //
  // Each city gets updated every hour. Cron runs 3x per hour.
  // Manual trigger processes ALL cities (WARNING: may hit subrequest limit!).

  const currentMinute = new Date().getMinutes();
  console.log(`Current minute: ${currentMinute}, Source: ${source}`);

  let citiesToProcess: typeof CITIES;

  if (source === 'manual') {
    // Manual trigger - WARNING: may exceed subrequest limit on free tier
    // For manual triggers, only process one shard worth at a time
    console.log(`Manual trigger: Processing first shard only (use scheduled for full coverage).`);
    citiesToProcess = [CITIES[0], CITIES[2]]; // Delhi + Kolkata
  } else {
    // Scheduled trigger uses 3-way sharding by minute
    if (currentMinute < 15) {
      // First shard: Delhi + Kolkata (27 stations)
      citiesToProcess = [CITIES[0], CITIES[2]]; // indices: delhi=0, kolkata=2
      console.log(`Shard 1 (minute ${currentMinute}): Processing Delhi + Kolkata (27 stations).`);
    } else if (currentMinute < 35) {
      // Second shard: Mumbai + Bangalore (30 stations)
      citiesToProcess = [CITIES[1], CITIES[3]]; // indices: mumbai=1, bangalore=3
      console.log(`Shard 2 (minute ${currentMinute}): Processing Mumbai + Bangalore (30 stations).`);
    } else {
      // Third shard: Remaining cities (39 stations)
      citiesToProcess = CITIES.slice(4); // Chennai, Hyderabad, Ahmedabad, Patna, Lucknow, Agra
      console.log(`Shard 3 (minute ${currentMinute}): Processing remaining 6 cities (39 stations).`);
    }
  }

  for (const city of citiesToProcess) {
    try {
      console.log(`Ingesting ${city.name} (${city.stations.length} stations)...`);

      // Get or create city record
      const cityId = await ensureCity(env.DB, city);

      // Fetch ALL stations for this city with batching
      const stationDataMap = await fetchStationsBatched(city.stations, env.WAQI_API_TOKEN);
      console.log(`[DEBUG] ${city.name}: Fetched ${stationDataMap.size}/${city.stations.length} stations from API`);

      const readings: StationReading[] = [];
      let latestStationTime = timestamp;

      for (const stationConfig of city.stations) {
        const rawData = stationDataMap.get(stationConfig.id);
        if (!rawData) {
          console.log(`[DEBUG] Station ${stationConfig.id} (${stationConfig.name}): No data in map`);
          continue;
        }
        if (rawData.status !== 'ok') {
          console.log(`[DEBUG] Station ${stationConfig.id} (${stationConfig.name}): Status ${rawData.status}`);
          continue;
        }
        if (!rawData.data) {
          console.log(`[DEBUG] Station ${stationConfig.id} (${stationConfig.name}): No data field`);
          continue;
        }
        console.log(`[DEBUG] Station ${stationConfig.id} (${stationConfig.name}): OK, AQI=${rawData.data.aqi}`);

        const stationId = await ensureStation(env.DB, cityId, {
          waqiId: String(stationConfig.id),
          name: stationConfig.name,
          area: stationConfig.area,
          latitude: rawData.data.city?.geo?.[0],
          longitude: rawData.data.city?.geo?.[1],
        });

        // Insert reading for ALL stations (even those without PM2.5)
        // This ensures PM10-only stations like Bangalore's City Railway Station are tracked
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

// US EPA AQI breakpoints for PM2.5 (AQI -> µg/m³)
const PM25_BREAKPOINTS = [
  { aqiLow: 0, aqiHigh: 50, concLow: 0, concHigh: 12.0 },
  { aqiLow: 51, aqiHigh: 100, concLow: 12.1, concHigh: 35.4 },
  { aqiLow: 101, aqiHigh: 150, concLow: 35.5, concHigh: 55.4 },
  { aqiLow: 151, aqiHigh: 200, concLow: 55.5, concHigh: 150.4 },
  { aqiLow: 201, aqiHigh: 300, concLow: 150.5, concHigh: 250.4 },
  { aqiLow: 301, aqiHigh: 500, concLow: 250.5, concHigh: 500.4 },
] as const;

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

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function filterNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter(isNumber);
}

function aqiToPm25(aqi: number | null | undefined): number | null {
  if (!isNumber(aqi)) return null;
  if (aqi < 0) return null;
  if (aqi > 500) return 500.4;

  for (const bp of PM25_BREAKPOINTS) {
    if (aqi <= bp.aqiHigh) {
      const aqiRange = bp.aqiHigh - bp.aqiLow;
      const concRange = bp.concHigh - bp.concLow;
      const aqiDelta = aqi - bp.aqiLow;
      return bp.concLow + (aqiDelta / aqiRange) * concRange;
    }
  }

  return 500.4;
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
        console.error(`[DEBUG] Station ${stationId}: Invalid response structure`);
        continue;
      }

      console.log(`[DEBUG] Fetch station ${stationId}: Success, status=${(data as any).status}`);
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
  const pm25Aqi = data.iaqi?.pm25?.v ?? null;
  const pm25 = aqiToPm25(pm25Aqi);
  const pm10 = data.iaqi?.pm10?.v ?? null;
  const o3 = data.iaqi?.o3?.v ?? null;
  const no2 = data.iaqi?.no2?.v ?? null;
  const so2 = data.iaqi?.so2?.v ?? null;
  const co = data.iaqi?.co?.v ?? null;
  const aqi = typeof data.aqi === 'number' ? data.aqi : null;
  const dominantPollutant = data.dominentpol || null;

  // Weather data
  const temperature = data.iaqi?.t?.v ?? null;
  const humidity = data.iaqi?.h?.v ?? null;
  const windSpeed = data.iaqi?.w?.v ?? null;
  const pressure = data.iaqi?.p?.v ?? null;

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
      temperature,
      humidity,
      windSpeed,
      pressure,
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
  const validReadings = readings.filter((r) => isNumber(r.pm25));

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
  const avgPm10 = average(filterNumbers(validReadings.map((r) => r.pm10)));
  const avgO3 = average(filterNumbers(validReadings.map((r) => r.o3)));
  const avgNo2 = average(filterNumbers(validReadings.map((r) => r.no2)));
  const avgSo2 = average(filterNumbers(validReadings.map((r) => r.so2)));
  const avgCo = average(filterNumbers(validReadings.map((r) => r.co)));

  // Dominant pollutant (most common)
  const pollutantCounts: Record<string, number> = {};
  validReadings.forEach((r) => {
    if (r.dominantPollutant) {
      pollutantCounts[r.dominantPollutant] = (pollutantCounts[r.dominantPollutant] || 0) + 1;
    }
  });
  const dominantPollutant = Object.entries(pollutantCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Weather (average from all readings that have weather data)
  const avgTemperature = average(filterNumbers(readings.map((r) => r.temperature)));
  const avgHumidity = average(filterNumbers(readings.map((r) => r.humidity)));
  const avgWindSpeed = average(filterNumbers(readings.map((r) => r.windSpeed)));
  const avgPressure = average(filterNumbers(readings.map((r) => r.pressure)));

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
    qualityStatus: validReadings.length >= totalStationCount * 0.8 ? 'healthy' : 'degraded',
    temperature: avgTemperature,
    humidity: avgHumidity,
    windSpeed: avgWindSpeed,
    pressure: avgPressure,
  };

  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO city_snapshots
        (city_id, recorded_at, avg_pm25, min_pm25, max_pm25, median_pm25,
         avg_pm10, avg_o3, avg_no2, avg_so2, avg_co,
         total_stations, valid_stations, dominant_pollutant, quality_status,
         temperature, humidity, wind_speed, pressure)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        snapshot.qualityStatus,
        avgTemperature,
        avgHumidity,
        avgWindSpeed,
        avgPressure
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

  // Get all snapshots for this day (including weather)
  const snapshots = await db
    .prepare(`
      SELECT avg_pm25, min_pm25, max_pm25, avg_pm10, avg_o3, avg_no2, recorded_at,
             temperature, humidity, wind_speed
      FROM city_snapshots
      WHERE city_id = ? AND date(recorded_at) = ?
      ORDER BY recorded_at
    `)
    .bind(cityId, date)
    .all<{
      avg_pm25: number; min_pm25: number; max_pm25: number;
      avg_pm10: number | null; avg_o3: number | null; avg_no2: number | null;
      recorded_at: string;
      temperature: number | null; humidity: number | null; wind_speed: number | null;
    }>();

  if (!snapshots.results || snapshots.results.length === 0) return;

  const pm25Values = filterNumbers(snapshots.results.map((s) => s.avg_pm25));
  if (pm25Values.length === 0) return;
  const avgPm25 = average(pm25Values);
  const minPm25Values = filterNumbers(snapshots.results.map((s) => s.min_pm25));
  const maxPm25Values = filterNumbers(snapshots.results.map((s) => s.max_pm25));
  const minPm25 = minPm25Values.length > 0 ? Math.min(...minPm25Values) : null;
  const maxPm25 = maxPm25Values.length > 0 ? Math.max(...maxPm25Values) : null;

  // Find peak hour
  let peakHour = 0;
  let peakPm25 = 0;
  snapshots.results.forEach((s) => {
    if (s.avg_pm25 > peakPm25) {
      peakPm25 = s.avg_pm25;
      peakHour = new Date(s.recorded_at).getHours();
    }
  });

  // Weather averages for the day
  const avgPm10 = average(filterNumbers(snapshots.results.map((s) => s.avg_pm10)));
  const avgO3 = average(filterNumbers(snapshots.results.map((s) => s.avg_o3)));
  const avgNo2 = average(filterNumbers(snapshots.results.map((s) => s.avg_no2)));
  const avgTemperature = average(filterNumbers(snapshots.results.map((s) => s.temperature)));
  const avgHumidity = average(filterNumbers(snapshots.results.map((s) => s.humidity)));
  const avgWindSpeed = average(filterNumbers(snapshots.results.map((s) => s.wind_speed)));

  // Compute health metrics
  const cigarettesEquivalent = avgPm25 !== null ? avgPm25 / METRICS.CIGARETTE_PM25_EQUIVALENT : 0;
  const yearsLostPerYear = avgPm25 !== null ? Math.max(0, (avgPm25 - METRICS.WHO_GUIDELINE) / 10) * METRICS.AQLI_YEARS_PER_10UG : 0;
  const whoViolation = avgPm25 !== null ? avgPm25 / METRICS.WHO_GUIDELINE : 0;

  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO daily_aggregates
        (city_id, date, avg_pm25, min_pm25, max_pm25, peak_hour, peak_pm25,
         avg_pm10, avg_o3, avg_no2,
         cigarettes_equivalent, years_lost_per_year, who_violation_factor, hours_with_data,
         avg_temperature, avg_humidity, avg_wind_speed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        cityId,
        date,
        avgPm25,
        minPm25,
        maxPm25,
        peakHour,
        peakPm25,
        avgPm10,
        avgO3,
        avgNo2,
        cigarettesEquivalent,
        yearsLostPerYear,
        whoViolation,
        snapshots.results.length,
        avgTemperature,
        avgHumidity,
        avgWindSpeed
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

/**
 * Aggregate daily data into monthly aggregates
 * Should run on the 2nd of each month at ~00:30 IST
 */
async function runMonthlyAggregation(db: D1Database): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  // Get last month (year, month)
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1; // 1-indexed

  console.log(`Running monthly aggregation for ${year}-${String(month).padStart(2, '0')}`);

  // Get all cities
  const cities = await db.prepare('SELECT id, name FROM cities').all<{ id: number; name: string }>();

  for (const city of cities.results || []) {
    try {
      // Get all daily aggregates for last month
      const dailies = await db.prepare(`
        SELECT * FROM daily_aggregates 
        WHERE city_id = ? 
          AND strftime('%Y', date) = ? 
          AND strftime('%m', date) = ?
        ORDER BY date
      `).bind(city.id, String(year), String(month).padStart(2, '0')).all<{
        date: string;
        avg_pm25: number | null;
        min_pm25: number | null;
        max_pm25: number | null;
        avg_pm10: number | null;
        avg_o3: number | null;
        avg_no2: number | null;
        avg_temperature: number | null;
        avg_humidity: number | null;
        avg_wind_speed: number | null;
        cigarettes_equivalent: number | null;
        years_lost_per_year: number | null;
        who_violation_factor: number | null;
      }>();

      if (!dailies.results || dailies.results.length === 0) {
        console.log(`No daily data for ${city.name} in ${year}-${month}`);
        continue;
      }

      const pm25Values = filterNumbers(dailies.results.map(d => d.avg_pm25));

      if (pm25Values.length === 0) continue;

      // Calculate aggregates
      const avgPm25 = average(pm25Values);
      const minPm25Values = filterNumbers(dailies.results.map(d => d.min_pm25));
      const maxPm25Values = filterNumbers(dailies.results.map(d => d.max_pm25));
      const minPm25 = minPm25Values.length > 0 ? Math.min(...minPm25Values) : null;
      const maxPm25 = maxPm25Values.length > 0 ? Math.max(...maxPm25Values) : null;
      const medianPm25 = median(pm25Values);

      // Other pollutants
      const avgPm10 = average(filterNumbers(dailies.results.map(d => d.avg_pm10)));
      const avgO3 = average(filterNumbers(dailies.results.map(d => d.avg_o3)));
      const avgNo2 = average(filterNumbers(dailies.results.map(d => d.avg_no2)));

      // Weather
      const avgTemperature = average(filterNumbers(dailies.results.map(d => d.avg_temperature)));
      const avgHumidity = average(filterNumbers(dailies.results.map(d => d.avg_humidity)));
      const avgWindSpeed = average(filterNumbers(dailies.results.map(d => d.avg_wind_speed)));

      // Health metrics
      const cigarettesPerDay = avgPm25 !== null ? avgPm25 / METRICS.CIGARETTE_PM25_EQUIVALENT : null;
      const cigarettesPerMonth = cigarettesPerDay !== null ? cigarettesPerDay * pm25Values.length : null;
      const whoViolationDays = pm25Values.filter(v => v > METRICS.WHO_GUIDELINE).length;
      const yearsLostPerYear = avgPm25 !== null
        ? Math.max(0, (avgPm25 - METRICS.WHO_GUIDELINE) / 10) * METRICS.AQLI_YEARS_PER_10UG
        : null;

      // Find worst and best days
      let worstDay = dailies.results[0];
      let bestDay = dailies.results[0];
      for (const day of dailies.results) {
        if ((day.avg_pm25 || 0) > (worstDay.avg_pm25 || 0)) worstDay = day;
        if ((day.avg_pm25 || Infinity) < (bestDay.avg_pm25 || Infinity)) bestDay = day;
      }

      // Insert monthly aggregate
      await db.prepare(`
        INSERT OR REPLACE INTO monthly_aggregates
        (city_id, year, month, avg_pm25, min_pm25, max_pm25, median_pm25,
         avg_pm10, avg_o3, avg_no2, avg_temperature, avg_humidity, avg_wind_speed,
         cigarettes_per_day, cigarettes_per_month, who_violation_days, years_lost_per_year,
         worst_day, worst_day_pm25, best_day, best_day_pm25, days_with_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        city.id, year, month,
        avgPm25, minPm25, maxPm25, medianPm25,
        avgPm10, avgO3, avgNo2,
        avgTemperature, avgHumidity, avgWindSpeed,
        cigarettesPerDay, cigarettesPerMonth, whoViolationDays, yearsLostPerYear,
        worstDay.date, worstDay.avg_pm25,
        bestDay.date, bestDay.avg_pm25,
        pm25Values.length
      ).run();

      processed++;
      console.log(`Aggregated ${city.name}: ${pm25Values.length} days → monthly record`);

    } catch (e) {
      const errorMsg = `Failed to aggregate ${city.name}: ${e}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  return { processed, errors };
}

/**
 * Clean up old hourly snapshots (keep only last 7 days)
 * Run after daily aggregation to preserve data
 */
async function cleanupOldSnapshots(db: D1Database): Promise<{ deleted: number }> {
  // Calculate cutoff date (7 days ago)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString();

  console.log(`Cleaning up snapshots older than ${cutoffStr}`);

  // Count before deletion
  const countBefore = await db.prepare(
    'SELECT COUNT(*) as count FROM city_snapshots WHERE recorded_at < ?'
  ).bind(cutoffStr).first<{ count: number }>();

  // Delete old snapshots
  await db.prepare(
    'DELETE FROM city_snapshots WHERE recorded_at < ?'
  ).bind(cutoffStr).run();

  const deleted = countBefore?.count || 0;
  console.log(`Deleted ${deleted} old snapshots`);

  return { deleted };
}

/**
 * Calculate median of an array
 */
function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
