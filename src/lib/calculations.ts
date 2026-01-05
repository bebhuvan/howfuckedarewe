/**
 * Air Quality Calculations for howfuckedarewe.in
 *
 * SINGLE SOURCE OF TRUTH for all formulas.
 * Import from here - do not duplicate calculations elsewhere.
 */

import {
  WHO,
  US_EPA,
  INDIA_NAAQS,
  CIGARETTE_EQUIVALENCE,
  AQLI,
  AQI_BREAKPOINTS_PM25,
  FUCKED_INDEX_THRESHOLDS,
  DISPLAY,
} from './constants';
import type { AirQualityMetrics, SeverityLevel } from './types';

// ============================================================================
// Core Calculations
// ============================================================================

/**
 * Calculate how many times a PM2.5 concentration exceeds WHO annual guideline
 */
export function calculateWHOViolation(pm25: number): number {
  return pm25 / WHO.PM25_ANNUAL;
}

/**
 * Calculate how many times a PM2.5 concentration exceeds US EPA annual standard
 */
export function calculateUSEPAViolation(pm25: number): number {
  return pm25 / US_EPA.PM25_ANNUAL;
}

/**
 * Calculate how many times a PM2.5 concentration exceeds India NAAQS
 */
export function calculateIndiaViolation(pm25: number): number {
  return pm25 / INDIA_NAAQS.PM25_ANNUAL;
}

/**
 * The Fucked Index™
 *
 * Formula: (WHO violation × US EPA violation) ÷ 10
 *
 * This compounds two different safety standards to show how far from
 * acceptable air quality we are. Higher = more fucked.
 *
 * Examples:
 * - PM2.5 = 5 (WHO limit):     FI = 0.04 (fine)
 * - PM2.5 = 12 (US EPA limit): FI = 0.24 (fine)
 * - PM2.5 = 40 (India limit):  FI = 2.67 (denial)
 * - PM2.5 = 100:               FI = 16.67 (LOL)
 */
export function calculateFuckedIndex(pm25: number): number {
  const whoViolation = calculateWHOViolation(pm25);
  const usEpaViolation = calculateUSEPAViolation(pm25);
  return (whoViolation * usEpaViolation) / 10;
}

/**
 * Get severity level based on Fucked Index
 */
export function getSeverityLevel(fuckedIndex: number): SeverityLevel {
  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.FINE) {
    return {
      level: 'fine',
      label: 'Suspiciously Okay',
      description: "Check again. This can't be right.",
      color: '#6b8e6b',
    };
  }
  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.COPE) {
    return {
      level: 'cope',
      label: 'Adjust Maadkoli',
      description: "Nothing hurts yet. That's how they get you.",
      color: '#a3a322',
    };
  }
  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.DENIAL) {
    return {
      level: 'denial',
      label: fuckedIndex < 3.5 ? 'Very Fucked' : 'Extremely Fucked',
      description: fuckedIndex < 3.5
        ? 'Your lungs know. Your heart knows.'
        : 'This would be breaking news elsewhere.',
      color: fuckedIndex < 3.5 ? '#c45a20' : '#b91c1c',
    };
  }
  return {
    level: 'lol',
    label: 'LOL',
    description: "You can see the air. You're not supposed to see the air.",
    color: '#7f1d1d',
  };
}

/**
 * Cigarette equivalence
 *
 * Based on Berkeley Earth: 22 µg/m³ PM2.5 ≈ 1 cigarette/day
 *
 * CAVEAT: This is an ILLUSTRATIVE comparison based on mortality risk,
 * not a claim that PM2.5 and cigarette smoke are chemically identical.
 */
export function calculateCigarettesPerDay(pm25: number): number {
  return pm25 / CIGARETTE_EQUIVALENCE.PM25_PER_CIGARETTE;
}

/**
 * Years of life lost due to PM2.5 exposure
 *
 * Based on AQLI methodology:
 * Every 10 µg/m³ above WHO guideline costs ~1 year of life expectancy.
 *
 * IMPORTANT: This is a LIFETIME impact assuming CONTINUOUS exposure
 * at this level for your entire life. It's not "you lose X years today."
 */
export function calculateYearsLost(pm25: number): number {
  const excessPm25 = Math.max(0, pm25 - AQLI.BASELINE);
  return (excessPm25 / 10) * AQLI.YEARS_LOST_PER_10UG;
}

/**
 * Hours "lost" per day - LIFETIME EQUIVALENT
 *
 * This takes the lifetime years lost and spreads it across an assumed
 * 70-year lifespan to give a "daily equivalent" for illustration.
 *
 * IMPORTANT: This is NOT "you lose X hours today." It's a way to make
 * the lifetime impact tangible on a daily scale.
 *
 * Formula: (yearsLost × 24 hours) / 70 years
 */
export function calculateHoursLostEquivalentPerDay(pm25: number): number {
  const yearsLost = calculateYearsLost(pm25);
  return (yearsLost * 24) / AQLI.ASSUMED_LIFESPAN;
}

// ============================================================================
// AQI <-> PM2.5 Conversions
// ============================================================================

/**
 * Convert AQI value to PM2.5 concentration (µg/m³)
 *
 * Uses US EPA breakpoints (what WAQI uses).
 *
 * NOTE: Only use this when you don't have actual PM2.5 concentration.
 * Prefer using iaqi.pm25.v from WAQI when available.
 */
export function aqiToPm25(aqi: number): number {
  if (aqi <= 0) return 0;
  if (aqi > 500) return 500.4; // Cap at hazardous

  for (const bp of AQI_BREAKPOINTS_PM25) {
    if (aqi <= bp.aqiHigh) {
      // Linear interpolation within breakpoint range
      const aqiRange = bp.aqiHigh - bp.aqiLow;
      const concRange = bp.concHigh - bp.concLow;
      const aqiDelta = aqi - bp.aqiLow;
      return bp.concLow + (aqiDelta / aqiRange) * concRange;
    }
  }

  // Fallback for very high values
  return 500.4;
}

/**
 * Convert PM2.5 concentration to AQI value
 *
 * Uses US EPA breakpoints.
 */
export function pm25ToAqi(pm25: number): number {
  if (pm25 <= 0) return 0;
  if (pm25 > 500.4) return 500; // Cap at hazardous

  for (const bp of AQI_BREAKPOINTS_PM25) {
    if (pm25 <= bp.concHigh) {
      // Linear interpolation within breakpoint range
      const concRange = bp.concHigh - bp.concLow;
      const aqiRange = bp.aqiHigh - bp.aqiLow;
      const concDelta = pm25 - bp.concLow;
      return Math.round(bp.aqiLow + (concDelta / concRange) * aqiRange);
    }
  }

  return 500;
}

// ============================================================================
// Aggregate Calculations
// ============================================================================

/**
 * Calculate all metrics for a given PM2.5 concentration
 *
 * This is the main function to use - it returns all metrics at once.
 */
export function calculateAllMetrics(pm25: number): AirQualityMetrics {
  const fuckedIndex = calculateFuckedIndex(pm25);

  return {
    pm25: round(pm25, DISPLAY.DECIMAL_PLACES_PM25),
    fuckedIndex: round(fuckedIndex, DISPLAY.DECIMAL_PLACES_FUCKED_INDEX),
    severity: getSeverityLevel(fuckedIndex),
    whoViolation: round(calculateWHOViolation(pm25), 1),
    usEpaViolation: round(calculateUSEPAViolation(pm25), 1),
    indiaViolation: round(calculateIndiaViolation(pm25), 1),
    cigarettesPerDay: round(calculateCigarettesPerDay(pm25), DISPLAY.DECIMAL_PLACES_CIGARETTES),
    yearsLost: round(calculateYearsLost(pm25), DISPLAY.DECIMAL_PLACES_YEARS),
    hoursLostEquivalentPerDay: round(calculateHoursLostEquivalentPerDay(pm25), 2),
  };
}

/**
 * Calculate average PM2.5 from an array of values
 * Returns null if array is empty
 */
export function calculateAveragePm25(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

// ============================================================================
// Death Statistics (Illustrative)
// ============================================================================

/**
 * Estimate annual deaths for a population based on PM2.5
 *
 * Based on WHO methodology: ~1 death per 10,000 people per 10 µg/m³ excess PM2.5
 *
 * IMPORTANT: This is highly approximate and for illustration only.
 */
export function estimateAnnualDeaths(pm25: number, population: number): number {
  const excessPm25 = Math.max(0, pm25 - WHO.PM25_ANNUAL);
  const deathRate = (excessPm25 / 10) * (1 / 10000);
  return Math.round(population * deathRate);
}

/**
 * Convert annual deaths to deaths per second (for counters)
 */
export function deathsPerSecond(annualDeaths: number): number {
  return annualDeaths / (365 * 24 * 60 * 60);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Round to specified decimal places
 */
function round(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format a number for display
 */
export function formatNumber(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

/**
 * Check if a value is a valid PM2.5 reading
 */
export function isValidPm25(value: number | null | undefined): value is number {
  if (value === null || value === undefined) return false;
  if (value < 0) return false;
  if (value > 1000) return false; // Sanity check
  return true;
}

/**
 * Check if a value is a valid AQI reading
 */
export function isValidAqi(aqi: number | string | null | undefined): aqi is number {
  if (aqi === null || aqi === undefined || aqi === '-') return false;
  const numAqi = typeof aqi === 'string' ? parseInt(aqi, 10) : aqi;
  if (isNaN(numAqi)) return false;
  if (numAqi < 0 || numAqi >= 999) return false; // 999 is WAQI error code
  if (numAqi > 500) return false; // Invalid/error
  return true;
}
