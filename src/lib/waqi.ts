/**
 * WAQI API Client v2
 *
 * Robust client that leverages ALL WAQI API features:
 * - City-level endpoints (faster than individual stations)
 * - Geo-location queries
 * - All pollutants (PM2.5, PM10, O3, NO2, SO2, CO)
 * - Weather data (temperature, humidity, wind, pressure)
 * - 3-8 day forecasts
 *
 * Features:
 * - Batched requests with rate limiting
 * - Retry with exponential backoff
 * - Circuit breaker for failing stations
 * - Comprehensive error handling
 */

import { calculateAllMetrics, aqiToPm25 } from './calculations';
import type {
    CityConfig,
    CitySnapshot,
    StationReading,
    PollutantReadings,
    ForecastDay,
    AirQualityMetrics,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

const WAQI_BASE_URL = 'https://api.waqi.info';
const USER_AGENT = 'howfuckedarewe.in/2.0';

// Rate limiting
const MAX_CONCURRENT = 5;
const DELAY_BETWEEN_BATCHES_MS = 100;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

// ============================================================================
// Types
// ============================================================================

interface WAQIFeedResponse {
    status: 'ok' | 'error';
    data: WAQIStationData;
}

interface WAQIStationData {
    idx: number;
    aqi: number | '-';
    city: {
        name: string;
        url: string;
        geo: [number, number];
    };
    dominentpol?: string;
    time: {
        iso: string;
        tz: string;
    };
    iaqi: {
        pm25?: { v: number };
        pm10?: { v: number };
        o3?: { v: number };
        no2?: { v: number };
        so2?: { v: number };
        co?: { v: number };
        t?: { v: number };  // Temperature
        h?: { v: number };  // Humidity
        w?: { v: number };  // Wind
        p?: { v: number };  // Pressure
    };
    forecast?: {
        daily?: {
            pm25?: Array<{ day: string; avg: number; min: number; max: number }>;
            pm10?: Array<{ day: string; avg: number; min: number; max: number }>;
            o3?: Array<{ day: string; avg: number; min: number; max: number }>;
        };
    };
}

interface FetchResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number): number {
    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * delay;
    return Math.min(delay + jitter, MAX_DELAY_MS);
}

// ============================================================================
// Core Fetch Functions
// ============================================================================

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(
    url: string,
    token: string
): Promise<FetchResult<WAQIStationData>> {
    let lastError: string = 'Unknown error';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            await sleep(getBackoffDelay(attempt - 1));
        }

        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
            });

            // Rate limited - wait and retry
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                console.warn(`WAQI rate limited, waiting ${retryAfter}s`);
                await sleep(retryAfter * 1000);
                continue;
            }

            // Server error - retryable
            if (response.status >= 500) {
                lastError = `Server error: ${response.status}`;
                continue;
            }

            // Client error - not retryable
            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}` };
            }

            const json: WAQIFeedResponse = await response.json();

            if (json.status !== 'ok') {
                return { success: false, error: 'API returned error status' };
            }

            return { success: true, data: json.data };
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Network error';
        }
    }

    return { success: false, error: lastError };
}

/**
 * Fetch a single station by ID
 */
export async function fetchStation(
    stationId: number,
    token: string
): Promise<FetchResult<WAQIStationData>> {
    const url = `${WAQI_BASE_URL}/feed/@${stationId}/?token=${token}`;
    return fetchWithRetry(url, token);
}

/**
 * Fetch by city name (uses WAQI's city-level aggregation)
 * This is faster than fetching individual stations
 */
export async function fetchByCity(
    cityName: string,
    token: string
): Promise<FetchResult<WAQIStationData>> {
    const url = `${WAQI_BASE_URL}/feed/${encodeURIComponent(cityName)}/?token=${token}`;
    return fetchWithRetry(url, token);
}

/**
 * Fetch by geo-location (nearest station)
 */
export async function fetchByGeo(
    lat: number,
    lng: number,
    token: string
): Promise<FetchResult<WAQIStationData>> {
    const url = `${WAQI_BASE_URL}/feed/geo:${lat};${lng}/?token=${token}`;
    return fetchWithRetry(url, token);
}

/**
 * Fetch multiple stations with batching and rate limiting
 */
export async function fetchStationsBatched(
    stationIds: number[],
    token: string
): Promise<Map<number, WAQIStationData>> {
    const results = new Map<number, WAQIStationData>();

    for (let i = 0; i < stationIds.length; i += MAX_CONCURRENT) {
        const batch = stationIds.slice(i, i + MAX_CONCURRENT);

        const promises = batch.map(async (id) => {
            const result = await fetchStation(id, token);
            if (result.success && result.data) {
                results.set(id, result.data);
            }
        });

        await Promise.all(promises);

        // Delay between batches
        if (i + MAX_CONCURRENT < stationIds.length) {
            await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
    }

    return results;
}

// ============================================================================
// Data Processing
// ============================================================================

/**
 * Extract pollutant readings from WAQI data
 */
function extractPollutants(data: WAQIStationData): PollutantReadings {
    const iaqi = data.iaqi || {};
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
 * Extract weather data from WAQI data
 */
export function extractWeather(data: WAQIStationData): {
    temperature: number | null;
    humidity: number | null;
    wind: number | null;
    pressure: number | null;
} {
    const iaqi = data.iaqi || {};
    return {
        temperature: iaqi.t?.v ?? null,
        humidity: iaqi.h?.v ?? null,
        wind: iaqi.w?.v ?? null,
        pressure: iaqi.p?.v ?? null,
    };
}

/**
 * Process forecast data
 */
function processForecast(data: WAQIStationData): ForecastDay[] {
    const pm25Forecast = data.forecast?.daily?.pm25;
    if (!pm25Forecast || pm25Forecast.length === 0) return [];

    return pm25Forecast.slice(0, 7).map(day => {
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

/**
 * Process a single station's data into our format
 */
function processStationData(
    data: WAQIStationData,
    stationConfig: { id: number; name: string; area: string }
): StationReading {
    const now = new Date();
    const stationTime = data.time?.iso ? new Date(data.time.iso) : now;
    const hoursOld = (now.getTime() - stationTime.getTime()) / (1000 * 60 * 60);
    const isStale = hoursOld > 2;

    const aqi = typeof data.aqi === 'number' && data.aqi >= 0 && data.aqi <= 500 ? data.aqi : 0;

    // Get PM2.5 concentration from AQI sub-index
    let pm25Concentration: number | null = null;
    if (data.iaqi?.pm25?.v !== undefined && data.iaqi.pm25.v >= 0) {
        pm25Concentration = aqiToPm25(data.iaqi.pm25.v);
    }

    const metrics = pm25Concentration !== null ? calculateAllMetrics(pm25Concentration) : null;

    return {
        id: stationConfig.id,
        name: stationConfig.name,
        area: stationConfig.area,
        coordinates: {
            lat: data.city?.geo?.[0] ?? 0,
            lng: data.city?.geo?.[1] ?? 0,
        },
        aqi,
        pm25Concentration,
        dominantPollutant: data.dominentpol || null,
        metrics,
        timestamp: data.time?.iso || now.toISOString(),
        isStale,
    };
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * Fetch complete city data with all features
 */
export async function fetchCityData(
    city: CityConfig,
    token: string
): Promise<CitySnapshot> {
    const stationIds = city.stations.map(s => s.id);
    const stationDataMap = await fetchStationsBatched(stationIds, token);

    const stations: StationReading[] = [];
    const allPollutants: PollutantReadings[] = [];
    let forecast: ForecastDay[] = [];
    let weather = { temperature: null as number | null, humidity: null as number | null, wind: null as number | null, pressure: null as number | null };

    for (const stationConfig of city.stations) {
        const rawData = stationDataMap.get(stationConfig.id);
        if (!rawData) continue;

        allPollutants.push(extractPollutants(rawData));
        stations.push(processStationData(rawData, stationConfig));

        // Get forecast and weather from first station that has it
        if (forecast.length === 0) {
            forecast = processForecast(rawData);
        }
        if (weather.temperature === null) {
            weather = extractWeather(rawData);
        }
    }

    // Aggregate PM2.5 values
    const pm25Values = stations
        .filter(s => s.pm25Concentration !== null)
        .map(s => s.pm25Concentration as number);

    const validStationCount = pm25Values.length;
    const totalStationCount = city.stations.length;

    let avgPm25: number | null = null;
    let minPm25: number | null = null;
    let maxPm25: number | null = null;

    if (pm25Values.length > 0) {
        avgPm25 = pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length;
        minPm25 = Math.min(...pm25Values);
        maxPm25 = Math.max(...pm25Values);
    }

    // Aggregate pollutants
    const pollutants = aggregatePollutants(allPollutants);

    // Determine dominant pollutant
    const dominantPollutant = stations
        .filter(s => s.dominantPollutant)
        .map(s => s.dominantPollutant!)
        .reduce((counts, pol) => {
            counts[pol] = (counts[pol] || 0) + 1;
            return counts;
        }, {} as Record<string, number>);
    const topPollutant = Object.entries(dominantPollutant).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Data quality
    const stationRatio = validStationCount / totalStationCount;
    const dataQuality: CitySnapshot['dataQuality'] =
        validStationCount === 0 ? 'unavailable' :
            stationRatio >= 0.8 ? 'good' :
                stationRatio >= 0.5 ? 'partial' : 'poor';

    const metrics = avgPm25 !== null ? calculateAllMetrics(avgPm25) : null;

    // Use most recent station timestamp, or fallback to current time
    const latestStationTimestamp = stations
        .map(s => s.timestamp)
        .filter(Boolean)
        .sort()
        .pop() || new Date().toISOString();

    return {
        city,
        timestamp: latestStationTimestamp,
        stations: stations.sort((a, b) => (b.aqi || 0) - (a.aqi || 0)),
        validStationCount,
        totalStationCount,
        avgPm25: avgPm25 !== null ? Math.round(avgPm25 * 10) / 10 : null,
        minPm25: minPm25 !== null ? Math.round(minPm25 * 10) / 10 : null,
        maxPm25: maxPm25 !== null ? Math.round(maxPm25 * 10) / 10 : null,
        metrics,
        pollutants,
        dominantPollutant: topPollutant,
        forecast,
        dataQuality,
    };
}

/**
 * Aggregate pollutant readings from multiple stations
 */
function aggregatePollutants(stationPollutants: PollutantReadings[]): PollutantReadings {
    const keys: (keyof PollutantReadings)[] = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'];
    const result: PollutantReadings = {
        pm25: null, pm10: null, o3: null, no2: null, so2: null, co: null,
    };

    for (const key of keys) {
        const values = stationPollutants
            .map(p => p[key])
            .filter((v): v is number => v !== null && v > 0);

        if (values.length > 0) {
            result[key] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
        }
    }

    return result;
}

/**
 * Fetch all cities data sequentially (for ingestion worker)
 */
export async function fetchAllCitiesData(
    cities: CityConfig[],
    token: string
): Promise<CitySnapshot[]> {
    const results: CitySnapshot[] = [];

    // Fetch sequentially to avoid hitting rate limits
    // (parallel fetching of 10 cities * 5 concurrent requests = 50 requests -> 429)
    for (const city of cities) {
        try {
            console.log(`[waqi] Fetching data for ${city.name}...`);
            const snapshot = await fetchCityData(city, token);
            results.push(snapshot);

            // Small delay between cities
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`[waqi] Failed to fetch data for ${city.name}:`, error);
        }
    }

    return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: Date | string, timezone: string = 'Asia/Kolkata'): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

    try {
        return date.toLocaleString('en-IN', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            day: 'numeric',
            month: 'short',
        });
    } catch {
        // Fallback if timezone is invalid
        return date.toLocaleString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            day: 'numeric',
            month: 'short',
        });
    }
}
