/**
 * WAQI API Client for howfuckedarewe.in
 *
 * SINGLE data source for all air quality data.
 * No fallbacks to other APIs - WAQI only.
 */

import type {
  WAQIStation,
  WAQIResponse,
  StationReading,
  CitySnapshot,
  CityConfig,
  ForecastDay,
  PollutantReadings,
} from './types';
import {
  calculateAllMetrics,
  aqiToPm25,
  isValidAqi,
  isValidPm25,
} from './calculations';
import { DATA_QUALITY } from './constants';
import {
  validateWAQIResponse,
  validateStationReading,
  generateDataQualityReport,
  formatDataQualityReport,
  type DataQualityReport,
} from './validation';

// ============================================================================
// Configuration
// ============================================================================

const WAQI_BASE_URL = 'https://api.waqi.info';

// Rate limiting: max concurrent requests to avoid WAQI API throttling
const MAX_CONCURRENT_REQUESTS = 5;
const REQUEST_DELAY_MS = 100; // Delay between batches

/**
 * Get WAQI API token from environment
 */
function getToken(): string {
  const token = import.meta.env.WAQI_API_TOKEN;
  if (!token) {
    console.error('WAQI_API_TOKEN not set in environment');
    return '';
  }
  return token;
}

// ============================================================================
// Station Data Fetching
// ============================================================================

/**
 * Fetch data for a single WAQI station
 */
export async function fetchStation(stationId: number): Promise<WAQIStation | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const url = `${WAQI_BASE_URL}/feed/@${stationId}/?token=${token}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`WAQI fetch failed for station ${stationId}: ${response.status}`);
      return null;
    }

    const data: WAQIResponse = await response.json();

    // Validate API response structure
    const validation = validateWAQIResponse(data);
    if (!validation.isValid) {
      console.error(`WAQI validation failed for station ${stationId}:`, validation.errors);
      return null;
    }
    if (validation.warnings.length > 0) {
      console.warn(`WAQI warnings for station ${stationId}:`, validation.warnings);
    }

    if (data.status !== 'ok') {
      console.error(`WAQI returned error for station ${stationId}`);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error(`Error fetching station ${stationId}:`, error);
    return null;
  }
}

/**
 * Delay utility for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch data for multiple stations with rate limiting
 * Processes requests in batches to avoid WAQI API throttling
 */
export async function fetchStations(stationIds: number[]): Promise<Map<number, WAQIStation>> {
  const results = new Map<number, WAQIStation>();

  // Process in batches to avoid rate limiting
  for (let i = 0; i < stationIds.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = stationIds.slice(i, i + MAX_CONCURRENT_REQUESTS);

    const batchPromises = batch.map(async (id) => {
      const data = await fetchStation(id);
      if (data) {
        results.set(id, data);
      }
    });

    await Promise.all(batchPromises);

    // Add delay between batches (except for the last one)
    if (i + MAX_CONCURRENT_REQUESTS < stationIds.length) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  return results;
}

// ============================================================================
// Data Processing
// ============================================================================

/**
 * Process a WAQI station response into our internal format
 *
 * IMPORTANT: We only use ACTUAL PM2.5 concentration from iaqi.pm25.v
 * We do NOT derive PM2.5 from overall AQI (which may be driven by other pollutants)
 */
export function processStationData(
  station: WAQIStation,
  config: { id: number; name: string; area: string }
): StationReading {
  const now = new Date();
  const stationTime = station.time?.iso ? new Date(station.time.iso) : now;
  const hoursOld = (now.getTime() - stationTime.getTime()) / (1000 * 60 * 60);
  const isStale = hoursOld > DATA_QUALITY.STALE_THRESHOLD_HOURS;

  // Get AQI (may be driven by any pollutant)
  const aqi = isValidAqi(station.aqi) ? (station.aqi as number) : 0;

  // Get ACTUAL PM2.5 concentration from the PM2.5 sub-index
  // This is the key fix - we only use real PM2.5 data, not derived
  let pm25Concentration: number | null = null;

  if (station.iaqi?.pm25?.v !== undefined && isValidPm25(station.iaqi.pm25.v)) {
    // WAQI iaqi.pm25.v is the PM2.5 AQI sub-index, convert to concentration
    pm25Concentration = aqiToPm25(station.iaqi.pm25.v);
  }

  // Calculate metrics only if we have actual PM2.5 data
  const metrics = pm25Concentration !== null
    ? calculateAllMetrics(pm25Concentration)
    : null;

  return {
    id: config.id,
    name: config.name,
    area: config.area,
    coordinates: {
      lat: station.city?.geo?.[0] ?? 0,
      lng: station.city?.geo?.[1] ?? 0,
    },
    aqi,
    pm25Concentration,
    dominantPollutant: station.dominentpol || null,
    metrics,
    timestamp: station.time?.iso || now.toISOString(),
    isStale,
  };
}

/**
 * Process forecast data
 */
export function processForecast(station: WAQIStation): ForecastDay[] {
  const forecastData = station.forecast?.daily?.pm25;
  if (!forecastData || forecastData.length === 0) return [];

  return forecastData.slice(0, 7).map((day) => {
    const pm25Concentration = aqiToPm25(day.avg);
    const dateObj = new Date(day.day);

    return {
      date: day.day,
      dayLabel: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      pm25Aqi: day.avg,
      pm25Concentration,
      metrics: calculateAllMetrics(pm25Concentration),
    };
  });
}

// ============================================================================
// Pollutant Data Extraction
// ============================================================================

/**
 * Extract pollutant readings from a WAQI station
 * Returns AQI sub-indices for each pollutant
 */
function extractPollutants(station: WAQIStation): PollutantReadings {
  const iaqi = station.iaqi || {};
  return {
    pm25: iaqi.pm25?.v ?? null,
    pm10: iaqi.pm10?.v ?? null,
    o3: iaqi.o3?.v ?? null,
    no2: iaqi.no2?.v ?? null,
    so2: iaqi.so2?.v ?? null,
    co: iaqi.co?.v ?? null,
  };
}

/**
 * Aggregate pollutant readings from multiple stations
 * Returns the average AQI sub-index for each pollutant (rounded)
 */
function aggregatePollutants(stationPollutants: PollutantReadings[]): PollutantReadings {
  const keys: (keyof PollutantReadings)[] = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'];
  const result: PollutantReadings = {
    pm25: null,
    pm10: null,
    o3: null,
    no2: null,
    so2: null,
    co: null,
  };

  for (const key of keys) {
    const values = stationPollutants
      .map((p) => p[key])
      .filter((v): v is number => v !== null && v > 0);

    if (values.length > 0) {
      result[key] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  return result;
}

/**
 * Determine the dominant pollutant from station data
 * Returns the most common dominant pollutant across stations
 */
function determineDominantPollutant(stations: WAQIStation[]): string | null {
  const counts: Record<string, number> = {};

  for (const station of stations) {
    const pol = station.dominentpol;
    if (pol) {
      counts[pol] = (counts[pol] || 0) + 1;
    }
  }

  let maxCount = 0;
  let dominant: string | null = null;

  for (const [pol, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pol;
    }
  }

  return dominant;
}

// ============================================================================
// City Data Fetching
// ============================================================================

/**
 * Fetch and process all data for a city
 *
 * This is the main entry point for getting city air quality data.
 */
export async function fetchCityData(city: CityConfig): Promise<CitySnapshot> {
  const stationIds = city.stations.map((s) => s.id);
  const stationDataMap = await fetchStations(stationIds);

  // Process each station
  const stations: StationReading[] = [];
  const rawStations: WAQIStation[] = [];
  const stationPollutants: PollutantReadings[] = [];
  let forecast: ForecastDay[] = [];

  for (const stationConfig of city.stations) {
    const rawData = stationDataMap.get(stationConfig.id);
    if (!rawData) continue;

    rawStations.push(rawData);
    stationPollutants.push(extractPollutants(rawData));

    const processed = processStationData(rawData, stationConfig);
    stations.push(processed);

    // Get forecast from first station that has it
    if (forecast.length === 0 && rawData.forecast?.daily?.pm25) {
      forecast = processForecast(rawData);
    }
  }

  // Aggregate pollutant data across all stations
  const pollutants = aggregatePollutants(stationPollutants);
  const dominantPollutant = determineDominantPollutant(rawStations);

  // Calculate aggregates - ONLY from stations with actual PM2.5 data
  const pm25Values = stations
    .filter((s) => s.pm25Concentration !== null)
    .map((s) => s.pm25Concentration as number);

  const validStationCount = pm25Values.length;
  const totalStationCount = city.stations.length;

  // Calculate averages
  let avgPm25: number | null = null;
  let minPm25: number | null = null;
  let maxPm25: number | null = null;

  if (pm25Values.length > 0) {
    avgPm25 = pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length;
    minPm25 = Math.min(...pm25Values);
    maxPm25 = Math.max(...pm25Values);
  }

  // Determine data quality
  let dataQuality: CitySnapshot['dataQuality'] = 'unavailable';
  const stationRatio = validStationCount / totalStationCount;

  if (validStationCount === 0) {
    dataQuality = 'unavailable';
  } else if (stationRatio >= DATA_QUALITY.MIN_STATIONS_GOOD) {
    dataQuality = 'good';
  } else if (stationRatio >= DATA_QUALITY.MIN_STATIONS_PARTIAL) {
    dataQuality = 'partial';
  } else {
    dataQuality = 'poor';
  }

  // Calculate city-wide metrics
  const metrics = avgPm25 !== null ? calculateAllMetrics(avgPm25) : null;

  const snapshot: CitySnapshot = {
    city,
    timestamp: new Date().toISOString(),
    stations: stations.sort((a, b) => (b.aqi || 0) - (a.aqi || 0)),
    validStationCount,
    totalStationCount,
    avgPm25: avgPm25 !== null ? Math.round(avgPm25 * 10) / 10 : null,
    minPm25: minPm25 !== null ? Math.round(minPm25 * 10) / 10 : null,
    maxPm25: maxPm25 !== null ? Math.round(maxPm25 * 10) / 10 : null,
    metrics,
    pollutants,
    dominantPollutant,
    forecast,
    dataQuality,
  };

  // Generate comprehensive data quality report
  const qualityReport = generateDataQualityReport(snapshot);
  snapshot.qualityReport = qualityReport;

  // Log any significant issues during build
  if (qualityReport.overallStatus === 'critical' || qualityReport.overallStatus === 'unavailable') {
    console.error(`[${city.name}] ${formatDataQualityReport(qualityReport)}`);
  } else if (qualityReport.anomalies.length > 0 || qualityReport.warnings.length > 0) {
    console.warn(`[${city.name}] ${formatDataQualityReport(qualityReport)}`);
  }

  return snapshot;
}

/**
 * Fetch data for multiple cities with controlled concurrency
 * Processes cities in small batches to avoid WAQI API throttling
 */
export async function fetchAllCitiesData(cities: CityConfig[]): Promise<CitySnapshot[]> {
  const results: CitySnapshot[] = [];
  const CITIES_BATCH_SIZE = 2; // Process 2 cities at a time

  for (let i = 0; i < cities.length; i += CITIES_BATCH_SIZE) {
    const batch = cities.slice(i, i + CITIES_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((city) => fetchCityData(city)));
    results.push(...batchResults);

    // Small delay between city batches
    if (i + CITIES_BATCH_SIZE < cities.length) {
      await delay(150);
    }
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clean station name for display
 */
export function cleanStationName(name: string, cityName: string): string {
  return name
    .replace(`, India`, '')
    .replace(`, ${cityName}`, '')
    .replace(`${cityName}; `, '')
    .replace(cityName, '')
    .trim();
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string, timezone: string = 'Asia/Kolkata'): string {
  return new Date(isoString).toLocaleString('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Check if data is fresh enough
 */
export function isDataFresh(timestamp: string, maxAgeHours: number = 2): boolean {
  const dataTime = new Date(timestamp);
  const now = new Date();
  const hoursOld = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);
  return hoursOld <= maxAgeHours;
}
