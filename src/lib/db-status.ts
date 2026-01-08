import type { CitySnapshot } from './types';
import { ALL_CITIES } from './cities';

export interface CityStatus {
    slug: string;
    name: string;
    status: 'fresh' | 'stale' | 'offline';
    lastUpdate: string | null;
    avgPm25: number | null;
    stationCount: number;
}

export interface IngestionLog {
    id: string;
    startedAt: string;
    completedAt: string | null;
    status: 'running' | 'completed' | 'failed';
    citiesProcessed: number;
    recordsProcessed: number;
    source: string;
}

export interface SystemStatus {
    lastIngestion: string | null;
    totalSnapshots: number;
    citiesWithData: number;
    oldestData: string | null;
    newestData: string | null;
}

export async function hasStatusData(db: D1Database): Promise<boolean> {
    try {
        // Check if tables exist
        const result = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='city_snapshots'").first();
        return !!result;
    } catch {
        return false;
    }
}

export async function getCityStatuses(db: D1Database): Promise<CityStatus[]> {
    const results = await db.prepare(`
        SELECT 
            c.slug, 
            c.name, 
            MAX(cs.recorded_at) as last_update,
            cs.avg_pm25,
            cs.valid_stations
        FROM cities c
        LEFT JOIN city_snapshots cs ON c.id = cs.city_id
        GROUP BY c.id
    `).all<any>();

    if (!results.results) return [];

    return results.results.map(row => {
        const lastUpdate = row.last_update ? new Date(row.last_update) : null;
        let status: CityStatus['status'] = 'offline';

        if (lastUpdate) {
            const hoursOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
            if (hoursOld < 2) status = 'fresh';
            else if (hoursOld < 6) status = 'stale';
        }

        return {
            slug: row.slug,
            name: row.name,
            status,
            lastUpdate: row.last_update,
            avgPm25: row.avg_pm25,
            stationCount: row.valid_stations || 0
        };
    });
}

export async function getRecentIngestionLogs(db: D1Database, limit: number): Promise<IngestionLog[]> {
    try {
        const results = await db.prepare(`
            SELECT id, started_at, completed_at, status, cities_processed, records_processed, source
            FROM ingestion_logs
            ORDER BY started_at DESC
            LIMIT ?
        `).bind(limit).all<any>();

        if (!results.results) return [];

        return results.results.map(row => ({
            id: row.id.toString(),
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status as any,
            citiesProcessed: row.cities_processed,
            recordsProcessed: row.records_processed,
            source: row.source || 'scheduled'
        }));
    } catch (e) {
        // Table might not exist yet if migration hasn't run
        return [];
    }
}

export async function getSystemStatus(db: D1Database): Promise<SystemStatus> {
    const result = await db.prepare(`
        SELECT 
            COUNT(*) as total, 
            MIN(recorded_at) as oldest, 
            MAX(recorded_at) as newest,
            COUNT(DISTINCT city_id) as cities
        FROM city_snapshots
    `).first<any>();

    return {
        totalSnapshots: result?.total || 0,
        citiesWithData: result?.cities || 0,
        oldestData: result?.oldest || null,
        newestData: result?.newest || null,
        lastIngestion: result?.newest || null
    };
}
