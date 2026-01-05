/**
 * Data Validation for howfuckedarewe.in
 *
 * Validates WAQI API responses and detects anomalies.
 * Trust but verify - sensors lie, APIs fail, shit happens.
 */

import type {
  WAQIStation,
  WAQIResponse,
  StationReading,
  CitySnapshot,
  DataQualityReport,
} from './types';
import { DATA_QUALITY } from './constants';

// Re-export the type for convenience
export type { DataQualityReport };

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface AnomalyReport {
  stationId: number;
  stationName: string;
  type: 'spike' | 'flatline' | 'outlier' | 'impossible';
  description: string;
  value: number;
  expectedRange: { min: number; max: number };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Reasonable bounds for PM2.5 readings in India
 * Based on historical data from CPCB/WAQI
 */
const PM25_BOUNDS = {
  MIN: 0,           // Can't be negative
  MAX_REASONABLE: 999,  // Extreme but possible in bad conditions
  MAX_POSSIBLE: 1500,   // Above this is likely sensor error
  TYPICAL_MIN: 5,       // Anything below is suspiciously clean for India
  TYPICAL_MAX: 500,     // Above this is extreme but happens in Delhi winter
} as const;

/**
 * AQI bounds (US EPA scale)
 */
const AQI_BOUNDS = {
  MIN: 0,
  MAX: 500,         // EPA scale max
  ERROR_CODE: 999,  // WAQI uses this for errors
} as const;

/**
 * Cross-station variance thresholds
 * If one station is way off from city average, flag it
 */
const VARIANCE_THRESHOLDS = {
  MAX_DEVIATION_FACTOR: 3.0,  // Station shouldn't be >3x city average
  MIN_DEVIATION_FACTOR: 0.2,  // Station shouldn't be <0.2x city average
} as const;

// ============================================================================
// API Response Validation
// ============================================================================

/**
 * Validate raw WAQI API response structure
 */
export function validateWAQIResponse(response: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check it's an object
  if (!response || typeof response !== 'object') {
    errors.push({
      code: 'INVALID_RESPONSE',
      message: 'Response is not a valid object',
      value: typeof response,
    });
    return { isValid: false, errors, warnings };
  }

  const data = response as Record<string, unknown>;

  // Check status field
  if (data.status !== 'ok') {
    errors.push({
      code: 'API_ERROR',
      message: `WAQI API returned status: ${data.status}`,
      field: 'status',
      value: data.status,
    });
  }

  // Check data field exists
  if (!data.data || typeof data.data !== 'object') {
    errors.push({
      code: 'MISSING_DATA',
      message: 'Response missing data field',
      field: 'data',
    });
    return { isValid: false, errors, warnings };
  }

  // Validate station data structure
  const station = data.data as Record<string, unknown>;

  // Check AQI
  if (station.aqi === undefined) {
    warnings.push({
      code: 'MISSING_AQI',
      message: 'Station has no AQI value',
      field: 'aqi',
    });
  } else if (station.aqi === '-') {
    warnings.push({
      code: 'NO_DATA',
      message: 'Station AQI is "-" (no data)',
      field: 'aqi',
      value: station.aqi,
    });
  } else if (station.aqi === AQI_BOUNDS.ERROR_CODE) {
    errors.push({
      code: 'ERROR_CODE',
      message: 'Station returned error code 999',
      field: 'aqi',
      value: station.aqi,
    });
  }

  // Check timestamp
  if (!station.time || typeof station.time !== 'object') {
    warnings.push({
      code: 'MISSING_TIME',
      message: 'Station has no timestamp',
      field: 'time',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Value Validation
// ============================================================================

/**
 * Validate a PM2.5 concentration value
 */
export function validatePm25Value(value: number | null | undefined): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (value === null || value === undefined) {
    errors.push({
      code: 'NULL_VALUE',
      message: 'PM2.5 value is null or undefined',
      field: 'pm25',
      value,
    });
    return { isValid: false, errors, warnings };
  }

  if (typeof value !== 'number' || isNaN(value)) {
    errors.push({
      code: 'INVALID_TYPE',
      message: 'PM2.5 value is not a valid number',
      field: 'pm25',
      value,
    });
    return { isValid: false, errors, warnings };
  }

  if (value < PM25_BOUNDS.MIN) {
    errors.push({
      code: 'NEGATIVE_VALUE',
      message: 'PM2.5 cannot be negative',
      field: 'pm25',
      value,
    });
  }

  if (value > PM25_BOUNDS.MAX_POSSIBLE) {
    errors.push({
      code: 'IMPOSSIBLE_VALUE',
      message: `PM2.5 value ${value} exceeds possible maximum (${PM25_BOUNDS.MAX_POSSIBLE})`,
      field: 'pm25',
      value,
    });
  } else if (value > PM25_BOUNDS.MAX_REASONABLE) {
    warnings.push({
      code: 'EXTREME_VALUE',
      message: `PM2.5 value ${value} is extremely high (possible sensor error)`,
      field: 'pm25',
      value,
    });
  }

  if (value > 0 && value < PM25_BOUNDS.TYPICAL_MIN) {
    warnings.push({
      code: 'SUSPICIOUSLY_LOW',
      message: `PM2.5 value ${value} is suspiciously low for India`,
      field: 'pm25',
      value,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an AQI value
 */
export function validateAqiValue(value: number | string | null | undefined): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (value === null || value === undefined) {
    errors.push({
      code: 'NULL_VALUE',
      message: 'AQI value is null or undefined',
      field: 'aqi',
      value,
    });
    return { isValid: false, errors, warnings };
  }

  if (value === '-') {
    errors.push({
      code: 'NO_DATA',
      message: 'AQI shows no data ("-")',
      field: 'aqi',
      value,
    });
    return { isValid: false, errors, warnings };
  }

  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(numValue)) {
    errors.push({
      code: 'INVALID_TYPE',
      message: 'AQI value is not a valid number',
      field: 'aqi',
      value,
    });
    return { isValid: false, errors, warnings };
  }

  if (numValue < AQI_BOUNDS.MIN) {
    errors.push({
      code: 'NEGATIVE_VALUE',
      message: 'AQI cannot be negative',
      field: 'aqi',
      value: numValue,
    });
  }

  if (numValue === AQI_BOUNDS.ERROR_CODE) {
    errors.push({
      code: 'ERROR_CODE',
      message: 'AQI value is error code 999',
      field: 'aqi',
      value: numValue,
    });
  }

  if (numValue > AQI_BOUNDS.MAX) {
    warnings.push({
      code: 'EXCEEDS_SCALE',
      message: `AQI ${numValue} exceeds EPA scale maximum (${AQI_BOUNDS.MAX})`,
      field: 'aqi',
      value: numValue,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Station Validation
// ============================================================================

/**
 * Validate a processed station reading
 */
export function validateStationReading(station: StationReading): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check PM2.5
  if (station.pm25Concentration !== null) {
    const pm25Result = validatePm25Value(station.pm25Concentration);
    errors.push(...pm25Result.errors);
    warnings.push(...pm25Result.warnings);
  }

  // Check AQI
  const aqiResult = validateAqiValue(station.aqi);
  // AQI errors become warnings (we can still use PM2.5 data)
  warnings.push(...aqiResult.errors.map(e => ({ ...e, code: `AQI_${e.code}` })));
  warnings.push(...aqiResult.warnings);

  // Check staleness
  if (station.isStale) {
    warnings.push({
      code: 'STALE_DATA',
      message: `Station data is more than ${DATA_QUALITY.STALE_THRESHOLD_HOURS} hours old`,
      field: 'timestamp',
      value: station.timestamp,
    });
  }

  // Check coordinates
  if (station.coordinates.lat === 0 && station.coordinates.lng === 0) {
    warnings.push({
      code: 'MISSING_COORDINATES',
      message: 'Station has no coordinates (0, 0)',
      field: 'coordinates',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Cross-Station Validation (Anomaly Detection)
// ============================================================================

/**
 * Detect outlier stations within a city
 *
 * If one station is way off from the others, it's probably a sensor issue
 */
export function detectOutlierStations(stations: StationReading[]): AnomalyReport[] {
  const anomalies: AnomalyReport[] = [];

  // Get stations with valid PM2.5 data
  const validStations = stations.filter(s => s.pm25Concentration !== null);
  if (validStations.length < 3) {
    // Need at least 3 stations to detect outliers
    return anomalies;
  }

  // Calculate median (more robust than mean for outlier detection)
  const pm25Values = validStations
    .map(s => s.pm25Concentration as number)
    .sort((a, b) => a - b);

  const median = pm25Values[Math.floor(pm25Values.length / 2)];

  // Check each station against median
  for (const station of validStations) {
    const pm25 = station.pm25Concentration as number;
    const ratio = pm25 / median;

    if (ratio > VARIANCE_THRESHOLDS.MAX_DEVIATION_FACTOR) {
      anomalies.push({
        stationId: station.id,
        stationName: station.name,
        type: 'outlier',
        description: `Station reading (${pm25}) is ${ratio.toFixed(1)}x higher than city median (${median})`,
        value: pm25,
        expectedRange: {
          min: median * VARIANCE_THRESHOLDS.MIN_DEVIATION_FACTOR,
          max: median * VARIANCE_THRESHOLDS.MAX_DEVIATION_FACTOR,
        },
      });
    } else if (ratio < VARIANCE_THRESHOLDS.MIN_DEVIATION_FACTOR && median > 20) {
      // Only flag as suspiciously low if the overall level is notable
      anomalies.push({
        stationId: station.id,
        stationName: station.name,
        type: 'outlier',
        description: `Station reading (${pm25}) is ${ratio.toFixed(2)}x lower than city median (${median})`,
        value: pm25,
        expectedRange: {
          min: median * VARIANCE_THRESHOLDS.MIN_DEVIATION_FACTOR,
          max: median * VARIANCE_THRESHOLDS.MAX_DEVIATION_FACTOR,
        },
      });
    }
  }

  return anomalies;
}

/**
 * Detect impossible/suspicious values that indicate sensor malfunction
 */
export function detectImpossibleValues(station: StationReading): AnomalyReport | null {
  const pm25 = station.pm25Concentration;

  if (pm25 === null) return null;

  // Exactly 0 is suspicious (sensors rarely read exactly 0)
  if (pm25 === 0) {
    return {
      stationId: station.id,
      stationName: station.name,
      type: 'flatline',
      description: 'Station reading exactly 0 (possible sensor malfunction)',
      value: pm25,
      expectedRange: { min: 1, max: PM25_BOUNDS.MAX_REASONABLE },
    };
  }

  // Round numbers might indicate test/placeholder data
  if (pm25 > 100 && pm25 % 100 === 0) {
    return {
      stationId: station.id,
      stationName: station.name,
      type: 'impossible',
      description: `Suspiciously round number (${pm25}) - possible placeholder`,
      value: pm25,
      expectedRange: { min: PM25_BOUNDS.MIN, max: PM25_BOUNDS.MAX_REASONABLE },
    };
  }

  return null;
}

// ============================================================================
// City-Level Validation
// ============================================================================

/**
 * Generate a comprehensive data quality report for a city
 */
export function generateDataQualityReport(snapshot: CitySnapshot): DataQualityReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const anomalies: AnomalyReport[] = [];

  let stationsValid = 0;
  let stationsFailed = 0;
  let stationsStale = 0;

  // Validate each station
  for (const station of snapshot.stations) {
    const result = validateStationReading(station);

    if (result.isValid) {
      stationsValid++;
    } else {
      stationsFailed++;
      errors.push(...result.errors.map(e => ({
        ...e,
        message: `[${station.name}] ${e.message}`,
      })));
    }

    warnings.push(...result.warnings.map(w => ({
      ...w,
      message: `[${station.name}] ${w.message}`,
    })));

    if (station.isStale) {
      stationsStale++;
    }

    // Check for impossible values
    const impossibleValue = detectImpossibleValues(station);
    if (impossibleValue) {
      anomalies.push(impossibleValue);
    }
  }

  // Cross-station anomaly detection
  const outliers = detectOutlierStations(snapshot.stations);
  anomalies.push(...outliers);

  // Determine overall status
  let overallStatus: DataQualityReport['overallStatus'];
  const validRatio = snapshot.validStationCount / snapshot.totalStationCount;

  if (snapshot.validStationCount === 0) {
    overallStatus = 'unavailable';
  } else if (validRatio < 0.3 || errors.length > 0) {
    overallStatus = 'critical';
  } else if (validRatio < 0.7 || anomalies.length > 0 || stationsStale > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    stationsChecked: snapshot.totalStationCount,
    stationsValid: snapshot.validStationCount,
    stationsFailed,
    stationsStale,
    stationsAnomalous: anomalies.length,
    errors,
    warnings,
    anomalies,
  };
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if a timestamp is within acceptable freshness
 */
export function isTimestampFresh(
  isoTimestamp: string,
  maxAgeHours: number = DATA_QUALITY.STALE_THRESHOLD_HOURS
): boolean {
  try {
    const dataTime = new Date(isoTimestamp);
    const now = new Date();
    const hoursOld = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);
    return hoursOld <= maxAgeHours;
  } catch {
    return false;
  }
}

/**
 * Format validation result for logging
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.isValid) {
    lines.push('Validation passed');
  } else {
    lines.push('Validation FAILED');
  }

  if (result.errors.length > 0) {
    lines.push(`  Errors (${result.errors.length}):`);
    result.errors.forEach(e => lines.push(`    - [${e.code}] ${e.message}`));
  }

  if (result.warnings.length > 0) {
    lines.push(`  Warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => lines.push(`    - [${w.code}] ${w.message}`));
  }

  return lines.join('\n');
}

/**
 * Format data quality report for logging
 */
export function formatDataQualityReport(report: DataQualityReport): string {
  const lines: string[] = [
    `Data Quality Report - ${report.overallStatus.toUpperCase()}`,
    `  Stations: ${report.stationsValid}/${report.stationsChecked} valid`,
    `  Stale: ${report.stationsStale}, Anomalous: ${report.stationsAnomalous}`,
  ];

  if (report.errors.length > 0) {
    lines.push(`  Errors: ${report.errors.length}`);
  }

  if (report.warnings.length > 0) {
    lines.push(`  Warnings: ${report.warnings.length}`);
  }

  if (report.anomalies.length > 0) {
    lines.push('  Anomalies:');
    report.anomalies.forEach(a => {
      lines.push(`    - [${a.stationName}] ${a.type}: ${a.description}`);
    });
  }

  return lines.join('\n');
}
