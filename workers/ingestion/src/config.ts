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
    population: 32000000,
    waqiId: '@2553', // Anand Vihar
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    localName: 'मुंबई',
    state: 'Maharashtra',
    population: 21000000,
    waqiId: '@13715', // Bandra Kurla Complex
  },
  {
    slug: 'kolkata',
    name: 'Kolkata',
    localName: 'কলকাতা',
    state: 'West Bengal',
    population: 15000000,
    waqiId: '@9068', // Victoria
  },
  {
    slug: 'bangalore',
    name: 'Bangalore',
    localName: 'ಬೆಂಗಳೂರು',
    state: 'Karnataka',
    population: 13000000,
    waqiId: '@8190', // BTM Layout
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    localName: 'சென்னை',
    state: 'Tamil Nadu',
    population: 11000000,
    waqiId: '@8185', // Manali
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    localName: 'హైదరాబాద్',
    state: 'Telangana',
    population: 10000000,
    waqiId: '@8700', // Zoo Park
  },
  {
    slug: 'ahmedabad',
    name: 'Ahmedabad',
    localName: 'અમદાવાદ',
    state: 'Gujarat',
    population: 8000000,
    waqiId: '@8192', // Maninagar
  },
  {
    slug: 'patna',
    name: 'Patna',
    localName: 'पटना',
    state: 'Bihar',
    population: 2500000,
    waqiId: '@8674', // IGSC Planetarium
  },
  {
    slug: 'lucknow',
    name: 'Lucknow',
    localName: 'लखनऊ',
    state: 'Uttar Pradesh',
    population: 3500000,
    waqiId: '@8673', // Lalbagh
  },
  {
    slug: 'agra',
    name: 'Agra',
    localName: 'आगरा',
    state: 'Uttar Pradesh',
    population: 1800000,
    waqiId: '@8186', // Sanjay Palace
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
