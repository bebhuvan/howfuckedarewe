/**
 * D1 Database Client
 *
 * Provides typed queries for the AQI historical database.
 * Used by Astro pages to fetch current and historical data.
 */

import type { CityConfig } from './types';

// Database row types (matching schema)
export interface CityRow {
  id: number;
  slug: string;
  name: string;
  local_name: string | null;
  state: string;
  population: number | null;
  waqi_station_id: string | null;
}

export interface CitySnapshotRow {
  id: number;
  city_id: number;
  recorded_at: string;
  avg_pm25: number | null;
  min_pm25: number | null;
  max_pm25: number | null;
  median_pm25: number | null;
  avg_pm10: number | null;
  avg_o3: number | null;
  avg_no2: number | null;
  avg_so2: number | null;
  avg_co: number | null;
  total_stations: number;
  valid_stations: number;
  dominant_pollutant: string | null;
  quality_status: string | null;
}

export interface DailyAggregateRow {
  id: number;
  city_id: number;
  date: string;
  avg_pm25: number | null;
  min_pm25: number | null;
  max_pm25: number | null;
  peak_hour: number | null;
  peak_pm25: number | null;
  cigarettes_equivalent: number | null;
  years_lost_per_year: number | null;
  who_violation_factor: number | null;
  hours_with_data: number;
}

/**
 * Get the latest snapshot for a city
 */
export async function getLatestCitySnapshot(
  db: D1Database,
  citySlug: string
): Promise<CitySnapshotRow | null> {
  const result = await db
    .prepare(`
      SELECT cs.*
      FROM city_snapshots cs
      JOIN cities c ON cs.city_id = c.id
      WHERE c.slug = ?
      ORDER BY cs.recorded_at DESC
      LIMIT 1
    `)
    .bind(citySlug)
    .first<CitySnapshotRow>();

  return result || null;
}

/**
 * Get snapshots for the last N hours for a city
 */
export async function getCitySnapshotsLastHours(
  db: D1Database,
  citySlug: string,
  hours: number = 24
): Promise<CitySnapshotRow[]> {
  const result = await db
    .prepare(`
      SELECT cs.*
      FROM city_snapshots cs
      JOIN cities c ON cs.city_id = c.id
      WHERE c.slug = ?
        AND cs.recorded_at >= datetime('now', '-' || ? || ' hours')
      ORDER BY cs.recorded_at ASC
    `)
    .bind(citySlug, hours)
    .all<CitySnapshotRow>();

  return result.results || [];
}

/**
 * Get daily aggregates for the last N days for a city
 */
export async function getCityDailyAggregates(
  db: D1Database,
  citySlug: string,
  days: number = 30
): Promise<DailyAggregateRow[]> {
  const result = await db
    .prepare(`
      SELECT da.*
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE c.slug = ?
        AND da.date >= date('now', '-' || ? || ' days')
      ORDER BY da.date ASC
    `)
    .bind(citySlug, days)
    .all<DailyAggregateRow>();

  return result.results || [];
}

/**
 * Get latest snapshots for all cities
 */
export async function getAllCitiesLatestSnapshots(
  db: D1Database
): Promise<(CitySnapshotRow & { city_slug: string; city_name: string })[]> {
  const result = await db
    .prepare(`
      SELECT cs.*, c.slug as city_slug, c.name as city_name
      FROM city_snapshots cs
      JOIN cities c ON cs.city_id = c.id
      WHERE cs.recorded_at = (
        SELECT MAX(cs2.recorded_at)
        FROM city_snapshots cs2
        WHERE cs2.city_id = cs.city_id
      )
      ORDER BY cs.avg_pm25 DESC
    `)
    .all<CitySnapshotRow & { city_slug: string; city_name: string }>();

  return result.results || [];
}

/**
 * Get historical comparison (same day last year, last month, last week)
 */
export async function getHistoricalComparison(
  db: D1Database,
  citySlug: string
): Promise<{
  today: DailyAggregateRow | null;
  lastWeek: DailyAggregateRow | null;
  lastMonth: DailyAggregateRow | null;
  lastYear: DailyAggregateRow | null;
}> {
  const [today, lastWeek, lastMonth, lastYear] = await Promise.all([
    db
      .prepare(`
        SELECT da.*
        FROM daily_aggregates da
        JOIN cities c ON da.city_id = c.id
        WHERE c.slug = ? AND da.date = date('now')
      `)
      .bind(citySlug)
      .first<DailyAggregateRow>(),
    db
      .prepare(`
        SELECT da.*
        FROM daily_aggregates da
        JOIN cities c ON da.city_id = c.id
        WHERE c.slug = ? AND da.date = date('now', '-7 days')
      `)
      .bind(citySlug)
      .first<DailyAggregateRow>(),
    db
      .prepare(`
        SELECT da.*
        FROM daily_aggregates da
        JOIN cities c ON da.city_id = c.id
        WHERE c.slug = ? AND da.date = date('now', '-1 month')
      `)
      .bind(citySlug)
      .first<DailyAggregateRow>(),
    db
      .prepare(`
        SELECT da.*
        FROM daily_aggregates da
        JOIN cities c ON da.city_id = c.id
        WHERE c.slug = ? AND da.date = date('now', '-1 year')
      `)
      .bind(citySlug)
      .first<DailyAggregateRow>(),
  ]);

  return {
    today: today || null,
    lastWeek: lastWeek || null,
    lastMonth: lastMonth || null,
    lastYear: lastYear || null,
  };
}

/**
 * Get worst days in the last N days
 */
export async function getWorstDays(
  db: D1Database,
  citySlug: string,
  days: number = 30,
  limit: number = 5
): Promise<DailyAggregateRow[]> {
  const result = await db
    .prepare(`
      SELECT da.*
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE c.slug = ?
        AND da.date >= date('now', '-' || ? || ' days')
        AND da.avg_pm25 IS NOT NULL
      ORDER BY da.avg_pm25 DESC
      LIMIT ?
    `)
    .bind(citySlug, days, limit)
    .all<DailyAggregateRow>();

  return result.results || [];
}

/**
 * Get statistics summary for a city
 */
export async function getCityStats(
  db: D1Database,
  citySlug: string,
  days: number = 30
): Promise<{
  avgPm25: number | null;
  minPm25: number | null;
  maxPm25: number | null;
  daysAboveWho: number;
  totalDays: number;
}> {
  const result = await db
    .prepare(`
      SELECT
        AVG(da.avg_pm25) as avg_pm25,
        MIN(da.min_pm25) as min_pm25,
        MAX(da.max_pm25) as max_pm25,
        SUM(CASE WHEN da.avg_pm25 > 5 THEN 1 ELSE 0 END) as days_above_who,
        COUNT(*) as total_days
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE c.slug = ?
        AND da.date >= date('now', '-' || ? || ' days')
        AND da.avg_pm25 IS NOT NULL
    `)
    .bind(citySlug, days)
    .first<{
      avg_pm25: number | null;
      min_pm25: number | null;
      max_pm25: number | null;
      days_above_who: number;
      total_days: number;
    }>();

  return {
    avgPm25: result?.avg_pm25 || null,
    minPm25: result?.min_pm25 || null,
    maxPm25: result?.max_pm25 || null,
    daysAboveWho: result?.days_above_who || 0,
    totalDays: result?.total_days || 0,
  };
}

/**
 * Check if D1 has any data (for graceful fallback)
 */
export async function hasHistoricalData(db: D1Database): Promise<boolean> {
  try {
    const result = await db
      .prepare('SELECT COUNT(*) as count FROM city_snapshots')
      .first<{ count: number }>();
    return (result?.count || 0) > 0;
  } catch {
    return false;
  }
}
