/**
 * Constants for howfuckedarewe.in
 *
 * Single source of truth for ALL magic numbers.
 * Every constant is documented with its source.
 */

// ============================================================================
// Air Quality Standards
// ============================================================================

/**
 * WHO Air Quality Guidelines (2021)
 * Source: https://www.who.int/publications/i/item/9789240034228
 */
export const WHO = {
  PM25_ANNUAL: 5,      // µg/m³ - Annual mean
  PM25_24HR: 15,       // µg/m³ - 24-hour mean
  PM10_ANNUAL: 15,     // µg/m³
  PM10_24HR: 45,       // µg/m³
} as const;

/**
 * US EPA National Ambient Air Quality Standards
 * Source: https://www.epa.gov/criteria-air-pollutants/naaqs-table
 */
export const US_EPA = {
  PM25_ANNUAL: 12,     // µg/m³ (primary annual)
  PM25_24HR: 35,       // µg/m³ (primary 24-hour)
  PM10_24HR: 150,      // µg/m³
} as const;

/**
 * India National Ambient Air Quality Standards (NAAQS)
 * Source: CPCB
 */
export const INDIA_NAAQS = {
  PM25_ANNUAL: 40,     // µg/m³
  PM25_24HR: 60,       // µg/m³
  PM10_ANNUAL: 60,     // µg/m³
  PM10_24HR: 100,      // µg/m³
} as const;

// ============================================================================
// Health Impact Constants
// ============================================================================

/**
 * Cigarette equivalence
 * Source: Berkeley Earth - http://berkeleyearth.org/air-pollution-and-cigarette-equivalence/
 *
 * Based on comparing mortality risk increase:
 * - 1 cigarette/day increases mortality by ~1.4%
 * - 22 µg/m³ PM2.5 increases mortality by similar amount
 *
 * IMPORTANT: This is an ILLUSTRATIVE comparison, not a claim that
 * PM2.5 and cigarette smoke are chemically identical.
 */
export const CIGARETTE_EQUIVALENCE = {
  PM25_PER_CIGARETTE: 22,  // µg/m³ per cigarette per day
  SOURCE: 'Berkeley Earth',
  METHODOLOGY: 'Mortality risk comparison',
} as const;

/**
 * AQLI Life Expectancy Impact
 * Source: Air Quality Life Index - https://aqli.epic.uchicago.edu/
 * Paper: Ebenstein et al., PNAS 2017
 *
 * Based on China's Huai River heating policy natural experiment.
 * Every 10 µg/m³ above WHO guideline reduces life expectancy by ~1 year.
 *
 * IMPORTANT: This is a LIFETIME impact assuming CONTINUOUS exposure.
 */
export const AQLI = {
  YEARS_LOST_PER_10UG: 0.98,  // Years lost per 10 µg/m³ above WHO (per Ebenstein et al.)
  BASELINE: WHO.PM25_ANNUAL, // Compare against WHO guideline
  ASSUMED_LIFESPAN: 70,      // Years, for averaging calculations
  SOURCE: 'AQLI/University of Chicago',
} as const;

/**
 * India air pollution mortality
 * Source: State of Global Air 2024 / IHME / Lancet
 * Child data: 464 children under 5 die daily in India (State of Global Air 2024)
 * https://www.stateofglobalair.org/resources/archived/state-global-air-report-2024
 */
export const INDIA_MORTALITY = {
  ANNUAL_DEATHS: 2_100_000,  // Deaths per year attributed to air pollution (2021 data)
  UNDER_5_DAILY: 464,        // Children under 5 dying daily
  UNDER_5_ANNUAL: 169_360,   // 464 × 365 = children under 5 per year
  UNDER_5_PERCENT: 0.08,     // ~8% of total deaths are children under 5
  SOURCE: 'State of Global Air 2024 / IHME',
} as const;

// ============================================================================
// AQI Breakpoints (US EPA scale - what WAQI uses)
// ============================================================================

/**
 * US EPA AQI breakpoints for PM2.5
 * Used to convert AQI values back to PM2.5 concentrations
 *
 * NOTE: WAQI normalizes all data to US EPA scale.
 * We should prefer using iaqi.pm25.v (PM2.5 sub-index) when available.
 */
export const AQI_BREAKPOINTS_PM25 = [
  { aqiLow: 0, aqiHigh: 50, concLow: 0, concHigh: 12.0 },
  { aqiLow: 51, aqiHigh: 100, concLow: 12.1, concHigh: 35.4 },
  { aqiLow: 101, aqiHigh: 150, concLow: 35.5, concHigh: 55.4 },
  { aqiLow: 151, aqiHigh: 200, concLow: 55.5, concHigh: 150.4 },
  { aqiLow: 201, aqiHigh: 300, concLow: 150.5, concHigh: 250.4 },
  { aqiLow: 301, aqiHigh: 500, concLow: 250.5, concHigh: 500.4 },
] as const;

// ============================================================================
// Fucked Index Thresholds
// ============================================================================

/**
 * Severity thresholds for the Fucked Index™
 *
 * Formula: (WHO violation × US EPA violation) ÷ 10
 *
 * At WHO limit (5 µg/m³): FI = (1 × 0.42) / 10 = 0.04
 * At US EPA limit (12 µg/m³): FI = (2.4 × 1) / 10 = 0.24
 * At India limit (40 µg/m³): FI = (8 × 3.33) / 10 = 2.67
 */
export const FUCKED_INDEX_THRESHOLDS = {
  FINE: 0.5,      // Below this: "Suspiciously Okay"
  COPE: 2.0,      // Below this: "Adjust Maadkoli"
  DENIAL: 5.0,    // Below this: "Very Fucked" to "Extremely Fucked"
  LOL: Infinity,  // Above denial: "LOL"
} as const;

// ============================================================================
// Data Quality Thresholds
// ============================================================================

export const DATA_QUALITY = {
  STALE_THRESHOLD_HOURS: 2,     // Data older than this is considered stale
  MIN_STATIONS_GOOD: 0.7,       // 70% of stations needed for "good" quality
  MIN_STATIONS_PARTIAL: 0.3,   // 30% for "partial" quality
  INVALID_AQI_VALUES: [999, -1], // WAQI error codes
  MAX_VALID_AQI: 500,           // AQI above this is invalid/error
} as const;

// ============================================================================
// City-specific Constants
// ============================================================================

export const CITY_POPULATIONS: Record<string, number> = {
  delhi: 32_000_000,
  mumbai: 21_000_000,
  bangalore: 13_000_000,
  chennai: 11_000_000,
  kolkata: 15_000_000,
  hyderabad: 10_000_000,
  ahmedabad: 8_000_000,
  pune: 7_000_000,
} as const;

export const INDIA_POPULATION = 1_400_000_000;

// ============================================================================
// Display Constants
// ============================================================================

export const DISPLAY = {
  DECIMAL_PLACES_PM25: 1,
  DECIMAL_PLACES_CIGARETTES: 1,
  DECIMAL_PLACES_YEARS: 2,
  DECIMAL_PLACES_FUCKED_INDEX: 1,
} as const;
