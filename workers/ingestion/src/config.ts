/**
 * Ingestion Worker Configuration
 */

// Cities to ingest data for
export const CITIES = [
  {
    slug: 'delhi',
    name: 'Delhi',
    localName: 'दिल्ली',
    state: 'Delhi',
    population: 32941000,
    waqiId: '@7013',
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    localName: 'मुंबई',
    state: 'Maharashtra',
    population: 21297000,
    waqiId: '@8482',
  },
  {
    slug: 'kolkata',
    name: 'Kolkata',
    localName: 'কলকাতা',
    state: 'West Bengal',
    population: 15134000,
    waqiId: '@12414',
  },
  {
    slug: 'bangalore',
    name: 'Bangalore',
    localName: 'ಬೆಂಗಳೂರು',
    state: 'Karnataka',
    population: 13193000,
    waqiId: '@12407',
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    localName: 'சென்னை',
    state: 'Tamil Nadu',
    population: 11503000,
    waqiId: '@7614',
  },
] as const;

// WAQI API configuration
export const WAQI_CONFIG = {
  baseUrl: 'https://api.waqi.info',
  userAgent: 'howfuckedarewe.in/1.0 (air-quality-tracker)',
  // Rate limiting: WAQI allows ~1000 requests/minute on free tier
  rateLimitDelayMs: 100,
};

// Health metrics constants
export const METRICS = {
  // WHO Air Quality Guideline (2021) for PM2.5 annual mean
  WHO_GUIDELINE: 5,

  // Berkeley Earth cigarette equivalence
  // 22 µg/m³ PM2.5 = 1 cigarette/day in mortality risk
  CIGARETTE_PM25_EQUIVALENT: 22,

  // AQLI: years of life lost per 10 µg/m³ above WHO guideline
  AQLI_YEARS_PER_10UG: 0.98,
};
