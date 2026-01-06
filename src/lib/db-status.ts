/**
 * Database Status Queries
 *
 * Functions to fetch system health and data freshness information.
 */

export interface CityStatus {
  slug: string;
  name: string;
  lastUpdate: string | null;
  avgPm25: number | null;
  stationCount: number;
  status: 'fresh' | 'stale' | 'offline';
}

export interface IngestionLog {
  id: number;
  source: string;
  ingestionType: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  citiesProcessed: number;
  status: string;
  errorMessage: string | null;
}

export interface SystemStatus {
  lastIngestion: string | null;
  lastAggregation: string | null;
  totalReadings: number;
  totalSnapshots: number;
  citiesWithData: number;
  oldestData: string | null;
  newestData: string | null;
}

/**
 * Get status for all cities
 */
export async function getCityStatuses(db: D1Database): Promise<CityStatus[]> {
  const query = `
    SELECT
      c.slug,
      c.name,
      cs.recorded_at as lastUpdate,
      cs.avg_pm25 as avgPm25,
      cs.valid_stations as stationCount
    FROM cities c
    LEFT JOIN (
      SELECT city_id, recorded_at, avg_pm25, valid_stations,
             ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY recorded_at DESC) as rn
      FROM city_snapshots
    ) cs ON c.id = cs.city_id AND cs.rn = 1
    ORDER BY c.name
  `;

  const result = await db.prepare(query).all();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  return (result.results || []).map((row: any) => {
    let status: 'fresh' | 'stale' | 'offline' = 'offline';

    if (row.lastUpdate) {
      const updateTime = new Date(row.lastUpdate);
      if (updateTime >= oneHourAgo) {
        status = 'fresh';
      } else if (updateTime >= sixHoursAgo) {
        status = 'stale';
      }
    }

    return {
      slug: row.slug,
      name: row.name,
      lastUpdate: row.lastUpdate,
      avgPm25: row.avgPm25,
      stationCount: row.stationCount || 0,
      status,
    };
  });
}

/**
 * Get recent ingestion logs
 */
export async function getRecentIngestionLogs(
  db: D1Database,
  limit: number = 10
): Promise<IngestionLog[]> {
  const query = `
    SELECT
      id,
      source,
      ingestion_type as ingestionType,
      started_at as startedAt,
      completed_at as completedAt,
      records_processed as recordsProcessed,
      cities_processed as citiesProcessed,
      status,
      error_message as errorMessage
    FROM ingestion_log
    ORDER BY started_at DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(limit).all();
  return (result.results || []) as IngestionLog[];
}

/**
 * Get overall system status
 */
export async function getSystemStatus(db: D1Database): Promise<SystemStatus> {
  const queries = await Promise.all([
    db.prepare(`
      SELECT completed_at FROM ingestion_log
      WHERE source = 'waqi' AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `).first(),

    db.prepare(`
      SELECT completed_at FROM ingestion_log
      WHERE source = 'aggregator' AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `).first(),

    db.prepare(`SELECT COUNT(*) as count FROM readings`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM city_snapshots`).first(),
    db.prepare(`SELECT COUNT(DISTINCT city_id) as count FROM city_snapshots`).first(),
    db.prepare(`SELECT MIN(recorded_at) as oldest FROM city_snapshots`).first(),
    db.prepare(`SELECT MAX(recorded_at) as newest FROM city_snapshots`).first(),
  ]);

  return {
    lastIngestion: (queries[0] as any)?.completed_at || null,
    lastAggregation: (queries[1] as any)?.completed_at || null,
    totalReadings: (queries[2] as any)?.count || 0,
    totalSnapshots: (queries[3] as any)?.count || 0,
    citiesWithData: (queries[4] as any)?.count || 0,
    oldestData: (queries[5] as any)?.oldest || null,
    newestData: (queries[6] as any)?.newest || null,
  };
}

/**
 * Check if database has data
 */
export async function hasStatusData(db: D1Database): Promise<boolean> {
  try {
    const result = await db.prepare('SELECT COUNT(*) as count FROM cities').first();
    return ((result as any)?.count || 0) > 0;
  } catch {
    return false;
  }
}
