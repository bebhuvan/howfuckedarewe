/**
 * Type definitions for howfuckedarewe.in
 *
 * Single source of truth for all TypeScript types.
 * WAQI is the only data source.
 */

// ============================================================================
// WAQI API Response Types
// ============================================================================

export interface WAQIStation {
  uid: number;
  aqi: number | '-';  // Can be '-' when no data
  time: {
    tz: string;
    stime: string;  // Local time string
    vtime: number;  // Unix timestamp
    iso: string;    // ISO 8601
  };
  city: {
    name: string;
    url: string;
    geo: [number, number];  // [lat, lng]
  };
  iaqi: {
    pm25?: { v: number };  // PM2.5 sub-index (THIS IS WHAT WE WANT)
    pm10?: { v: number };
    o3?: { v: number };
    no2?: { v: number };
    so2?: { v: number };
    co?: { v: number };
    t?: { v: number };     // Temperature
    h?: { v: number };     // Humidity
    w?: { v: number };     // Wind
    p?: { v: number };     // Pressure
  };
  forecast?: {
    daily?: {
      pm25?: Array<{ day: string; avg: number; min: number; max: number }>;
      pm10?: Array<{ day: string; avg: number; min: number; max: number }>;
      o3?: Array<{ day: string; avg: number; min: number; max: number }>;
    };
  };
  attributions?: Array<{ name: string; url: string }>;
  dominentpol?: string;  // Which pollutant is driving the AQI
}

export interface WAQIResponse {
  status: 'ok' | 'error';
  data: WAQIStation;
}

export interface WAQISearchResult {
  uid: number;
  aqi: string;
  station: {
    name: string;
    geo: [number, number];
    url: string;
    country: string;
  };
}

export interface WAQISearchResponse {
  status: 'ok' | 'error';
  data: WAQISearchResult[];
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * A single station's processed reading
 */
export interface StationReading {
  id: number;
  name: string;
  area: string;
  coordinates: { lat: number; lng: number };

  // Raw values
  aqi: number;                    // Overall AQI (may be driven by any pollutant)
  pm25Concentration: number | null;  // ACTUAL PM2.5 in µg/m³ (null if not available)
  dominantPollutant: string | null;

  // Computed metrics (only if PM2.5 is available)
  metrics: AirQualityMetrics | null;

  // Timing
  timestamp: string;  // ISO 8601
  isStale: boolean;   // True if data is >2 hours old
}

/**
 * All calculated metrics for a PM2.5 concentration
 */
export interface AirQualityMetrics {
  pm25: number;  // Source concentration in µg/m³

  // The Fucked Index
  fuckedIndex: number;
  severity: SeverityLevel;

  // Standards violations
  whoViolation: number;      // Times over WHO annual (5 µg/m³)
  usEpaViolation: number;    // Times over US EPA (12 µg/m³)
  indiaViolation: number;    // Times over India NAAQS (40 µg/m³)

  // Health impacts
  cigarettesPerDay: number;

  // Lifetime impacts (AQLI methodology)
  // NOTE: These are LIFETIME impacts assuming continuous exposure
  yearsLost: number;
  hoursLostEquivalentPerDay: number;  // yearsLost spread over 70 years, per day
}

/**
 * Severity levels for the Fucked Index
 */
export interface SeverityLevel {
  level: 'fine' | 'cope' | 'denial' | 'lol';
  label: string;
  description: string;
  color: string;
}

/**
 * Live pollutant readings from WAQI iaqi
 * Values are AQI sub-indices (not raw concentrations)
 */
export interface PollutantReadings {
  pm25: number | null;   // PM2.5 AQI sub-index
  pm10: number | null;   // PM10 AQI sub-index
  o3: number | null;     // Ozone AQI sub-index
  no2: number | null;    // Nitrogen Dioxide AQI sub-index
  so2: number | null;    // Sulfur Dioxide AQI sub-index
  co: number | null;     // Carbon Monoxide AQI sub-index
}

/**
 * Metadata about a pollutant for display
 */
export interface PollutantInfo {
  key: keyof PollutantReadings;
  name: string;
  fullName: string;
  tagline: string;
  description: string;
  color: string;
}

/**
 * City-wide snapshot aggregating all stations
 */
export interface CitySnapshot {
  city: CityConfig;
  timestamp: string;

  // Station data
  stations: StationReading[];
  validStationCount: number;        // Stations with valid PM2.5 data
  totalStationCount: number;        // Total stations attempted

  // Aggregated PM2.5 (only from stations with actual PM2.5 data)
  avgPm25: number | null;
  minPm25: number | null;
  maxPm25: number | null;

  // City-wide metrics (null if no PM2.5 data)
  metrics: AirQualityMetrics | null;

  // Live pollutant readings (aggregated from stations)
  pollutants: PollutantReadings;
  dominantPollutant: string | null;

  // Forecast (if available)
  forecast: ForecastDay[];

  // Data quality indicator
  dataQuality: 'good' | 'partial' | 'poor' | 'unavailable';

  // Detailed validation report (for debugging/display)
  qualityReport?: DataQualityReport;
}

/**
 * Data quality report from validation system
 */
export interface DataQualityReport {
  timestamp: string;
  overallStatus: 'healthy' | 'degraded' | 'critical' | 'unavailable';
  stationsChecked: number;
  stationsValid: number;
  stationsFailed: number;
  stationsStale: number;
  stationsAnomalous: number;
  errors: Array<{ code: string; message: string; field?: string; value?: unknown }>;
  warnings: Array<{ code: string; message: string; field?: string; value?: unknown }>;
  anomalies: Array<{
    stationId: number;
    stationName: string;
    type: 'spike' | 'flatline' | 'outlier' | 'impossible';
    description: string;
    value: number;
    expectedRange: { min: number; max: number };
  }>;
}

/**
 * Forecast for a single day
 */
export interface ForecastDay {
  date: string;
  dayLabel: string;   // "Mon", "Tue", etc.
  dateLabel: string;  // "Jan 5", etc.
  pm25Aqi: number;
  pm25Concentration: number;
  metrics: AirQualityMetrics;
}

// ============================================================================
// City Configuration
// ============================================================================

export interface CityConfig {
  slug: string;
  name: string;
  localName?: string;
  state: string;
  coordinates: { lat: number; lng: number };
  stations: WAQIStationConfig[];
  population: number;
  tagline: string;
  timezone: string;
}

export interface WAQIStationConfig {
  id: number;       // WAQI station UID
  name: string;     // Human-readable name
  area: string;     // Neighborhood/area
}

// ============================================================================
// All-India Overview
// ============================================================================

export interface AllIndiaSnapshot {
  timestamp: string;
  cities: CitySnapshot[];

  // National aggregates
  nationalAvgPm25: number | null;
  worstCity: CitySnapshot | null;
  bestCity: CitySnapshot | null;

  // National death toll (illustrative)
  annualDeaths: number;
  deathsSincePageLoad: number;
}
