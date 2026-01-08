/**
 * D1 Database Module v2
 *
 * Clean, robust database access for the AQI website.
 * All queries in one place for easy maintenance.
 */

import { getCityBySlug, ALL_CITIES } from './cities';
import { calculateAllMetrics, aqiToPm25 } from './calculations';
import type { CitySnapshot, CityConfig, PollutantReadings, StationReading } from './types';

// ============================================================================
// Types for D1 Rows
// ============================================================================

export interface CitySnapshotRow {
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
    slug: string;
    name: string;
    local_name: string | null;
    state: string;
    population: number;
}

export interface DailyAggregateRow {
    date: string;
    avg_pm25: number;
    min_pm25: number;
    max_pm25: number;
    peak_hour: number;
    cigarettes_equivalent: number;
    who_violation_factor: number;
}

// ============================================================================
// City Snapshot Queries
// ============================================================================

/**
 * Get latest snapshot for all cities (for homepage)
 */
export async function getLatestCitySnapshots(db: D1Database): Promise<CitySnapshot[]> {
    try {
        const result = await db.prepare(`
      SELECT
        cs.city_id,
        cs.recorded_at,
        cs.avg_pm25,
        cs.min_pm25,
        cs.max_pm25,
        cs.median_pm25,
        cs.avg_pm10,
        cs.avg_o3,
        cs.avg_no2,
        cs.avg_so2,
        cs.avg_co,
        cs.total_stations,
        cs.valid_stations,
        cs.dominant_pollutant,
        cs.quality_status,
        c.slug,
        c.name,
        c.local_name,
        c.state,
        c.population
      FROM city_snapshots cs
      JOIN cities c ON cs.city_id = c.id
      WHERE cs.recorded_at = (
        SELECT MAX(recorded_at)
        FROM city_snapshots
        WHERE city_id = cs.city_id
      )
      ORDER BY cs.avg_pm25 DESC NULLS LAST
    `).all<CitySnapshotRow>();

        if (!result.results || result.results.length === 0) {
            return [];
        }

        return result.results.map(row => transformRowToSnapshot(row)).filter(Boolean) as CitySnapshot[];
    } catch (error) {
        console.error('[db] getLatestCitySnapshots error:', error);
        return [];
    }
}

/**
 * Get snapshot for a single city (with station data)
 */
export async function getCitySnapshot(db: D1Database, slug: string): Promise<CitySnapshot | null> {
    try {
        // Get the city snapshot
        const result = await db.prepare(`
      SELECT
        cs.city_id,
        cs.recorded_at,
        cs.avg_pm25,
        cs.min_pm25,
        cs.max_pm25,
        cs.median_pm25,
        cs.avg_pm10,
        cs.avg_o3,
        cs.avg_no2,
        cs.avg_so2,
        cs.avg_co,
        cs.total_stations,
        cs.valid_stations,
        cs.dominant_pollutant,
        cs.quality_status,
        c.slug,
        c.name,
        c.local_name,
        c.state,
        c.population
      FROM city_snapshots cs
      JOIN cities c ON cs.city_id = c.id
      WHERE c.slug = ?
      ORDER BY cs.recorded_at DESC
      LIMIT 1
    `).bind(slug).first<CitySnapshotRow>();

        if (!result) return null;

        // Get station readings for this snapshot time (or most recent readings per station)
        const stationReadings = await db.prepare(`
      SELECT 
        s.id as station_id,
        s.name as station_name,
        s.waqi_id,
        s.latitude,
        s.longitude,
        r.pm25,
        r.pm10,
        r.o3,
        r.no2,
        r.so2,
        r.co,
        r.aqi,
        r.dominant_pollutant,
        r.recorded_at
      FROM stations s
      JOIN cities c ON s.city_id = c.id
      LEFT JOIN readings r ON s.id = r.station_id 
        AND r.recorded_at = (
          SELECT MAX(r2.recorded_at) 
          FROM readings r2 
          WHERE r2.station_id = s.id
        )
      WHERE c.slug = ?
      ORDER BY r.pm25 DESC NULLS LAST
    `).bind(slug).all<{
            station_id: number;
            station_name: string;
            waqi_id: string;
            latitude: number | null;
            longitude: number | null;
            pm25: number | null;
            pm10: number | null;
            o3: number | null;
            no2: number | null;
            so2: number | null;
            co: number | null;
            aqi: number | null;
            dominant_pollutant: string | null;
            recorded_at: string | null;
        }>();

        return transformRowToSnapshot(result, stationReadings.results || []);
    } catch (error) {
        console.error(`[db] getCitySnapshot error for ${slug}:`, error);
        return null;
    }
}

// ============================================================================
// Historical Data Queries
// ============================================================================

/**
 * Get daily aggregates for a city
 */
export async function getCityDailyAggregates(
    db: D1Database,
    slug: string,
    days: number = 30
): Promise<DailyAggregateRow[]> {
    try {
        const result = await db.prepare(`
      SELECT
        da.date,
        da.avg_pm25,
        da.min_pm25,
        da.max_pm25,
        da.peak_hour,
        da.cigarettes_equivalent,
        da.who_violation_factor
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE c.slug = ?
        AND da.date >= date('now', '-' || ? || ' days')
      ORDER BY da.date ASC
    `).bind(slug, days).all<DailyAggregateRow>();

        return result.results || [];
    } catch (error) {
        console.error(`[db] getCityDailyAggregates error for ${slug}:`, error);
        return [];
    }
}

/**
 * Get national daily aggregates
 */
export async function getNationalDailyAggregates(
    db: D1Database,
    days: number = 30
): Promise<any[]> {
    try {
        const result = await db.prepare(`
      SELECT
        date,
        AVG(avg_pm25) as avg_pm25,
        MIN(min_pm25) as min_pm25,
        MAX(max_pm25) as max_pm25,
        SUM(population) as population_covered
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE da.date >= date('now', '-' || ? || ' days')
      GROUP BY da.date
      ORDER BY da.date ASC
    `).bind(days).all();

        return result.results || [];
    } catch (error) {
        console.error('[db] getNationalDailyAggregates error:', error);
        return [];
    }
}

// ============================================================================
// Data Freshness Checks
// ============================================================================

/**
 * Check if we have recent data (within specified hours)
 */
export async function hasRecentData(db: D1Database, maxAgeHours: number = 2): Promise<boolean> {
    try {
        const result = await db.prepare(`
      SELECT MAX(recorded_at) as latest
      FROM city_snapshots
    `).first<{ latest: string | null }>();

        if (!result?.latest) return false;

        const latestTime = new Date(result.latest);
        const now = new Date();
        const hoursOld = (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60);

        return hoursOld <= maxAgeHours;
    } catch (error) {
        console.error('[db] hasRecentData error:', error);
        return false;
    }
}

/**
 * Get timestamp of last ingestion
 */
export async function getLastIngestionTime(db: D1Database): Promise<string | null> {
    try {
        const result = await db.prepare(`
      SELECT MAX(recorded_at) as latest
      FROM city_snapshots
    `).first<{ latest: string | null }>();

        return result?.latest || null;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// Write Operations (for ingestion worker)
// ============================================================================

/**
 * Store a city snapshot
 */
export async function storeCitySnapshot(
    db: D1Database,
    cityId: number,
    snapshot: {
        avgPm25: number | null;
        minPm25: number | null;
        maxPm25: number | null;
        medianPm25: number | null;
        avgPm10: number | null;
        avgO3: number | null;
        avgNo2: number | null;
        avgSo2: number | null;
        avgCo: number | null;
        totalStations: number;
        validStations: number;
        dominantPollutant: string | null;
    },
    timestamp: string
): Promise<void> {
    try {
        await db.prepare(`
      INSERT OR REPLACE INTO city_snapshots
      (city_id, recorded_at, avg_pm25, min_pm25, max_pm25, median_pm25,
       avg_pm10, avg_o3, avg_no2, avg_so2, avg_co,
       total_stations, valid_stations, dominant_pollutant, quality_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
            cityId,
            timestamp,
            snapshot.avgPm25,
            snapshot.minPm25,
            snapshot.maxPm25,
            snapshot.medianPm25,
            snapshot.avgPm10,
            snapshot.avgO3,
            snapshot.avgNo2,
            snapshot.avgSo2,
            snapshot.avgCo,
            snapshot.totalStations,
            snapshot.validStations,
            snapshot.dominantPollutant,
            snapshot.validStations >= snapshot.totalStations * 0.8 ? 'healthy' : 'degraded'
        ).run();
    } catch (error) {
        console.error('[db] storeCitySnapshot error:', error);
        throw error;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

interface StationReadingRow {
    station_id: number;
    station_name: string;
    waqi_id: string;
    latitude: number | null;
    longitude: number | null;
    pm25: number | null;
    pm10: number | null;
    o3: number | null;
    no2: number | null;
    so2: number | null;
    co: number | null;
    aqi: number | null;
    dominant_pollutant: string | null;
    recorded_at: string | null;
}

function transformRowToSnapshot(
    row: CitySnapshotRow,
    stationRows: StationReadingRow[] = []
): CitySnapshot | null {
    const cityConfig = getCityBySlug(row.slug);

    const city: CityConfig = cityConfig || {
        slug: row.slug,
        name: row.name,
        localName: row.local_name || undefined,
        state: row.state,
        population: row.population,
        coordinates: { lat: 0, lng: 0 },
        tagline: '',
        timezone: 'Asia/Kolkata',
        stations: [],
    };

    const pollutants: PollutantReadings = {
        pm25: row.avg_pm25 !== null ? Math.round(row.avg_pm25) : null,
        pm10: row.avg_pm10 !== null ? Math.round(row.avg_pm10) : null,
        o3: row.avg_o3 !== null ? Math.round(row.avg_o3) : null,
        no2: row.avg_no2 !== null ? Math.round(row.avg_no2) : null,
        so2: row.avg_so2 !== null ? Math.round(row.avg_so2) : null,
        co: row.avg_co !== null ? Math.round(row.avg_co) : null,
    };

    const metrics = row.avg_pm25 !== null ? calculateAllMetrics(row.avg_pm25) : null;

    // Transform station reading rows into StationReading objects
    const stations: StationReading[] = stationRows
        .filter(sr => sr.pm25 !== null || sr.aqi !== null)
        .map(sr => {
            // Get PM2.5 concentration - either direct from reading or convert from AQI
            let pm25Concentration: number | null = null;
            if (sr.pm25 !== null) {
                pm25Concentration = aqiToPm25(sr.pm25);
            }

            // Find area name from city config if available
            const stationConfig = cityConfig?.stations.find(
                s => s.id.toString() === sr.waqi_id || s.name === sr.station_name
            );
            const area = stationConfig?.area || sr.station_name;

            const stationMetrics = pm25Concentration !== null
                ? calculateAllMetrics(pm25Concentration)
                : null;

            const now = new Date();
            const recordedTime = sr.recorded_at ? new Date(sr.recorded_at) : now;
            const hoursOld = (now.getTime() - recordedTime.getTime()) / (1000 * 60 * 60);

            return {
                id: sr.station_id,
                name: sr.station_name,
                area,
                coordinates: {
                    lat: sr.latitude || 0,
                    lng: sr.longitude || 0,
                },
                aqi: sr.aqi || 0,
                pm25Concentration,
                dominantPollutant: sr.dominant_pollutant,
                metrics: stationMetrics,
                timestamp: sr.recorded_at || row.recorded_at,
                isStale: hoursOld > 2,
            };
        })
        .sort((a, b) => (b.aqi || 0) - (a.aqi || 0));

    const stationRatio = row.total_stations > 0 ? row.valid_stations / row.total_stations : 0;
    const dataQuality: CitySnapshot['dataQuality'] =
        row.valid_stations === 0 ? 'unavailable' :
            stationRatio >= 0.8 ? 'good' :
                stationRatio >= 0.5 ? 'partial' : 'poor';

    return {
        city,
        timestamp: row.recorded_at,
        stations,
        validStationCount: row.valid_stations,
        totalStationCount: row.total_stations,
        avgPm25: row.avg_pm25 !== null ? Math.round(row.avg_pm25 * 10) / 10 : null,
        minPm25: row.min_pm25 !== null ? Math.round(row.min_pm25 * 10) / 10 : null,
        maxPm25: row.max_pm25 !== null ? Math.round(row.max_pm25 * 10) / 10 : null,
        metrics,
        pollutants,
        dominantPollutant: row.dominant_pollutant,
        forecast: [],
        dataQuality,
    };
}
