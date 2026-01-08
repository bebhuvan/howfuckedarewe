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
  if (!Number.isFinite(pm25) || pm25 < 0) return 0;
  return pm25 / WHO.PM25_ANNUAL;
}

/**
 * Calculate how many times a PM2.5 concentration exceeds US EPA annual standard
 */
export function calculateUSEPAViolation(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) return 0;
  return pm25 / US_EPA.PM25_ANNUAL;
}

/**
 * Calculate how many times a PM2.5 concentration exceeds India NAAQS
 */
export function calculateIndiaViolation(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) return 0;
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
 *
 * Each level has sardonic copy that doesn't sugarcoat the reality.
 */
export function getSeverityLevel(fuckedIndex: number): SeverityLevel {
  // Guard against NaN/undefined
  if (!Number.isFinite(fuckedIndex) || fuckedIndex < 0) {
    return {
      level: 'fine',
      label: 'Data Missing',
      description: "The sensors are silent. That's somehow worse.",
      color: '#525252',
    };
  }

  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.FINE) {
    return {
      level: 'fine',
      label: 'Suspiciously Okay',
      description: "Don't get used to it.",
      color: '#6b8e6b',
    };
  }
  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.COPE) {
    return {
      level: 'cope',
      label: 'Adjust Maadkoli',
      description: "Your body is building 'character'. That's what we're calling lung scarring now.",
      color: '#a3a322',
    };
  }
  if (fuckedIndex < FUCKED_INDEX_THRESHOLDS.DENIAL) {
    return {
      level: 'denial',
      label: fuckedIndex < 3.5 ? 'Very Fucked' : 'Extremely Fucked',
      description: fuckedIndex < 3.5
        ? 'The government says this is fine. The government is lying.'
        : 'This would shut down cities elsewhere. Here, we call it Tuesday.',
      color: fuckedIndex < 3.5 ? '#c45a20' : '#b91c1c',
    };
  }
  return {
    level: 'lol',
    label: 'LOL',
    description: "Congratulations! You're breathing what firefighters train for.",
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
 * Returns null if array is empty or all values are invalid
 * Filters out NaN, undefined, null, and negative values
 */
export function calculateAveragePm25(values: number[]): number | null {
  // Filter to only valid, finite, positive numbers
  const validValues = values.filter(
    (v): v is number => Number.isFinite(v) && v >= 0
  );

  if (validValues.length === 0) return null;

  const sum = validValues.reduce((a, b) => a + b, 0);
  return sum / validValues.length;
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
 * Format a number using Indian numbering system (lakhs and crores)
 * 
 * Examples:
 * - 1500 -> "1,500"
 * - 15000 -> "15,000"
 * - 150000 -> "1.5 lakh"
 * - 1500000 -> "15 lakh"
 * - 21000000 -> "2.1 crore"
 */
export function formatIndianNumber(value: number, options?: {
  useWords?: boolean;  // Use "lakh" and "crore" instead of just commas
  decimals?: number;   // Decimal places for lakhs/crores
}): string {
  const { useWords = true, decimals = 1 } = options || {};

  if (!Number.isFinite(value) || value < 0) return '0';

  // For small numbers, just use Indian locale formatting
  if (value < 100000 || !useWords) {
    return value.toLocaleString('en-IN');
  }

  // Crore (1,00,00,000 = 10 million)
  if (value >= 10000000) {
    const crores = value / 10000000;
    return crores % 1 === 0
      ? `${crores.toFixed(0)} crore`
      : `${crores.toFixed(decimals)} crore`;
  }

  // Lakh (1,00,000 = 100 thousand)
  if (value >= 100000) {
    const lakhs = value / 100000;
    return lakhs % 1 === 0
      ? `${lakhs.toFixed(0)} lakh`
      : `${lakhs.toFixed(decimals)} lakh`;
  }

  return value.toLocaleString('en-IN');
}

/**
 * Format population in Indian style (always use words)
 */
export function formatPopulation(population: number): string {
  return formatIndianNumber(population, { useWords: true, decimals: 1 });
}

/**
 * Format deaths/counts in Indian style
 */
export function formatDeaths(deaths: number): string {
  if (deaths < 100000) {
    return deaths.toLocaleString('en-IN');
  }
  return formatIndianNumber(deaths, { useWords: true, decimals: 1 });
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
