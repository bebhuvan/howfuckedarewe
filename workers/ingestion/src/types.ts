/**
 * Type definitions for the Ingestion Worker
 */

// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  WAQI_API_TOKEN: string;
  TRIGGER_SECRET: string;
}

// WAQI API response structure
export interface WaqiResponse {
  status: 'ok' | 'error';
  data?: {
    idx: number;
    aqi: number;
    dominentpol?: string;
    city?: {
      name: string;
      geo?: [number, number];
    };
    time?: {
      s: string;
      tz: string;
      iso: string;
    };
    iaqi?: {
      pm25?: { v: number };
      pm10?: { v: number };
      o3?: { v: number };
      no2?: { v: number };
      so2?: { v: number };
      co?: { v: number };
      t?: { v: number };      // Temperature (°C)
      h?: { v: number };      // Humidity (%)
      w?: { v: number };      // Wind speed (m/s)
      wg?: { v: number };     // Wind gust (m/s)
      wd?: { v: number };     // Wind direction (degrees)
      p?: { v: number };      // Pressure (hPa)
      dew?: { v: number };    // Dew point (°C)
    };
    forecast?: {
      daily?: {
        pm25?: Array<{ avg: number; day: string; max: number; min: number }>;
        pm10?: Array<{ avg: number; day: string; max: number; min: number }>;
        o3?: Array<{ avg: number; day: string; max: number; min: number }>;
      };
    };
  };
}

// Individual station reading
export interface StationReading {
  stationId: number;
  area: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  aqi: number | null;
  dominantPollutant: string | null;
  recordedAt: string;
  // Weather data
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pressure: number | null;
}

// City-level aggregated snapshot
export interface CitySnapshot {
  cityId: number;
  recordedAt: string;
  avgPm25: number;
  minPm25: number;
  maxPm25: number;
  medianPm25: number;
  avgPm10: number | null;
  avgO3: number | null;
  avgNo2: number | null;
  avgSo2: number | null;
  avgCo: number | null;
  totalStations: number;
  validStations: number;
  dominantPollutant: string | null;
  qualityStatus: 'healthy' | 'degraded' | 'critical';
  // Weather (averaged from stations)
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pressure: number | null;
}

// Daily aggregate for a city
export interface DailyAggregate {
  cityId: number;
  date: string;
  avgPm25: number;
  minPm25: number;
  maxPm25: number;
  peakHour: number;
  peakPm25: number;
  avgPm10: number | null;
  avgO3: number | null;
  avgNo2: number | null;
  cigarettesEquivalent: number;
  yearsLostPerYear: number;
  whoViolationFactor: number;
  hoursWithData: number;
}
