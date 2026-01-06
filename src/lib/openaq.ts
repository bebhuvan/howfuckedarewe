/**
 * OpenAQ v3 API Client
 *
 * Used for fetching historical air quality data from OpenAQ.
 * OpenAQ aggregates data from CPCB and other sources.
 *
 * API Docs: https://docs.openaq.org
 */

const OPENAQ_BASE_URL = 'https://api.openaq.org/v3';

// India country ID in OpenAQ
const INDIA_COUNTRY_ID = 9;

// PM2.5 parameter ID in OpenAQ
const PM25_PARAMETER_ID = 2;

// ============================================================================
// Types
// ============================================================================

export interface OpenAQSensor {
  id: number;
  name: string;
  parameter: {
    id: number;
    name: string;
    units: string;
    displayName: string;
  };
}

export interface OpenAQLocation {
  id: number;
  name: string;
  locality: string | null;
  timezone: string;
  country: {
    id: number;
    code: string;
    name: string;
  };
  owner: {
    id: number;
    name: string;
  };
  provider: {
    id: number;
    name: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  sensors: OpenAQSensor[];
  datetimeFirst: {
    utc: string;
    local: string;
  } | null;
  datetimeLast: {
    utc: string;
    local: string;
  } | null;
}

export interface OpenAQDailyMeasurement {
  value: number;
  parameter: {
    id: number;
    name: string;
    units: string;
  };
  period: {
    label: string;
    datetimeFrom: { utc: string; local: string };
    datetimeTo: { utc: string; local: string };
  };
  summary: {
    min: number;
    max: number;
    avg: number;
    median: number;
    sd: number | null;
  };
  coverage: {
    expectedCount: number;
    observedCount: number;
    percentComplete: number;
  };
}

export interface OpenAQHourlyMeasurement {
  value: number;
  parameter: {
    id: number;
    name: string;
    units: string;
  };
  period: {
    label: string;
    datetimeFrom: { utc: string; local: string };
    datetimeTo: { utc: string; local: string };
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Find all active PM2.5 monitoring locations in India
 */
export async function findIndiaPM25Locations(
  apiKey: string,
  limit: number = 200
): Promise<OpenAQLocation[]> {
  const url = `${OPENAQ_BASE_URL}/locations?countries_id=${INDIA_COUNTRY_ID}&parameters_id=${PM25_PARAMETER_ID}&limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAQ API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Get location details including sensor IDs
 */
export async function getLocationDetails(
  locationId: number,
  apiKey: string
): Promise<OpenAQLocation | null> {
  const url = `${OPENAQ_BASE_URL}/locations/${locationId}`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`OpenAQ API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results?.[0] || null;
}

/**
 * Get PM2.5 sensor ID for a location
 */
export function getPM25SensorId(location: OpenAQLocation): number | null {
  const pm25Sensor = location.sensors.find(
    (s) => s.parameter.name === 'pm25' || s.parameter.id === PM25_PARAMETER_ID
  );
  return pm25Sensor?.id || null;
}

/**
 * Fetch daily aggregated measurements for a sensor
 */
export async function fetchSensorDays(
  sensorId: number,
  apiKey: string,
  limit: number = 365
): Promise<OpenAQDailyMeasurement[]> {
  const url = `${OPENAQ_BASE_URL}/sensors/${sensorId}/days?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAQ API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Fetch hourly measurements for a sensor
 */
export async function fetchSensorHours(
  sensorId: number,
  apiKey: string,
  limit: number = 168 // 7 days
): Promise<OpenAQHourlyMeasurement[]> {
  const url = `${OPENAQ_BASE_URL}/sensors/${sensorId}/hours?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAQ API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Get the latest reading for a location
 */
export async function getLocationLatest(
  locationId: number,
  apiKey: string
): Promise<{ value: number; datetime: string } | null> {
  const url = `${OPENAQ_BASE_URL}/locations/${locationId}/latest`;

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const pm25 = data.results?.find(
    (r: any) => r.parameter?.name === 'pm25' || r.parametersId === PM25_PARAMETER_ID
  );

  if (!pm25) return null;

  return {
    value: pm25.value,
    datetime: pm25.datetime?.utc || pm25.datetime?.local,
  };
}

// ============================================================================
// Geo Utilities
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Map an OpenAQ location to a city by proximity
 */
export function mapToCity(
  location: OpenAQLocation,
  cities: Array<{ slug: string; coordinates: { lat: number; lng: number } }>,
  maxDistanceKm: number = 50
): string | null {
  let closestCity: string | null = null;
  let minDistance = Infinity;

  for (const city of cities) {
    const distance = haversineDistance(
      location.coordinates.latitude,
      location.coordinates.longitude,
      city.coordinates.lat,
      city.coordinates.lng
    );

    if (distance < minDistance && distance < maxDistanceKm) {
      minDistance = distance;
      closestCity = city.slug;
    }
  }

  return closestCity;
}

// ============================================================================
// Station Mapping for Our Cities
// ============================================================================

/**
 * Known OpenAQ location IDs mapped to our cities
 * These were discovered through API exploration
 */
export const OPENAQ_CITY_MAPPING: Record<string, number[]> = {
  delhi: [
    17, // R K Puram
    50, // Punjabi Bagh
    235, // Anand Vihar
    6356, // Pusa
    6358, // Mandir Marg
    6929, // Dhyan Chand Stadium
    6931, // Dwarka
    5586, // Sirifort
    8118, // US Embassy
  ],
  bangalore: [
    5548, // BTM Layout
    5607, // Peenya
  ],
  hyderabad: [
    407, // Zoo Park
    2594, // Sanathnagar
  ],
  mumbai: [
    2598, // Navi Mumbai Airoli
  ],
  chennai: [
    2586, // Manali
  ],
  kolkata: [
    716, // Rabindra Bharati University
    910, // Victoria Memorial
  ],
};

/**
 * Get OpenAQ location IDs for a city
 */
export function getOpenAQLocationsForCity(citySlug: string): number[] {
  return OPENAQ_CITY_MAPPING[citySlug] || [];
}
