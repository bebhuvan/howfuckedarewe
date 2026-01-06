/**
 * National Aggregate Database Queries
 *
 * Provides typed queries for national-level historical data.
 * Used by the homepage for the "How Have We Been Getting Fucked?" section.
 */

// ============================================================================
// Types
// ============================================================================

export interface NationalDailyRow {
  id: number;
  date: string;
  avg_pm25: number | null;
  weighted_avg_pm25: number | null;
  min_pm25: number | null;
  max_pm25: number | null;
  cities_reporting: number;
  total_population_covered: number;
  cigarettes_equivalent: number | null;
  years_lost_per_year: number | null;
  who_violation_factor: number | null;
  worst_city_id: number | null;
  best_city_id: number | null;
}

export interface NationalStats {
  avgPm25: number | null;
  worstDay: { date: string; pm25: number } | null;
  bestDay: { date: string; pm25: number } | null;
  daysAboveWho: number;
  totalDays: number;
  trend: 'improving' | 'worsening' | 'stable';
  percentChange: number | null;
}

export interface YearOverYearData {
  thisYearAvg: number | null;
  lastYearAvg: number | null;
  percentChange: number | null;
  monthlyData: {
    thisYear: { month: string; avgPm25: number }[];
    lastYear: { month: string; avgPm25: number }[];
  };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get national daily aggregates for the last N days
 */
export async function getNationalDailyAggregates(
  db: D1Database,
  days: number = 30
): Promise<NationalDailyRow[]> {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM national_daily_aggregates
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `
    )
    .bind(days)
    .all<NationalDailyRow>();

  return result.results || [];
}

/**
 * Get national stats summary for the last N days
 */
export async function getNationalStats(db: D1Database, days: number = 30): Promise<NationalStats> {
  // Basic stats
  const stats = await db
    .prepare(
      `
      SELECT
        AVG(weighted_avg_pm25) as avg_pm25,
        MAX(weighted_avg_pm25) as max_pm25,
        MIN(weighted_avg_pm25) as min_pm25,
        SUM(CASE WHEN weighted_avg_pm25 > 5 THEN 1 ELSE 0 END) as days_above_who,
        COUNT(*) as total_days
      FROM national_daily_aggregates
      WHERE date >= date('now', '-' || ? || ' days')
        AND weighted_avg_pm25 IS NOT NULL
    `
    )
    .bind(days)
    .first<{
      avg_pm25: number | null;
      max_pm25: number | null;
      min_pm25: number | null;
      days_above_who: number;
      total_days: number;
    }>();

  // Worst day
  const worstDay = await db
    .prepare(
      `
      SELECT date, weighted_avg_pm25 as pm25
      FROM national_daily_aggregates
      WHERE date >= date('now', '-' || ? || ' days')
        AND weighted_avg_pm25 IS NOT NULL
      ORDER BY weighted_avg_pm25 DESC
      LIMIT 1
    `
    )
    .bind(days)
    .first<{ date: string; pm25: number }>();

  // Best day
  const bestDay = await db
    .prepare(
      `
      SELECT date, weighted_avg_pm25 as pm25
      FROM national_daily_aggregates
      WHERE date >= date('now', '-' || ? || ' days')
        AND weighted_avg_pm25 IS NOT NULL
      ORDER BY weighted_avg_pm25 ASC
      LIMIT 1
    `
    )
    .bind(days)
    .first<{ date: string; pm25: number }>();

  // Calculate trend (compare last 7 days vs previous 7 days)
  const recentAvg = await db
    .prepare(
      `
      SELECT AVG(weighted_avg_pm25) as avg
      FROM national_daily_aggregates
      WHERE date >= date('now', '-7 days')
        AND weighted_avg_pm25 IS NOT NULL
    `
    )
    .first<{ avg: number | null }>();

  const previousAvg = await db
    .prepare(
      `
      SELECT AVG(weighted_avg_pm25) as avg
      FROM national_daily_aggregates
      WHERE date >= date('now', '-14 days')
        AND date < date('now', '-7 days')
        AND weighted_avg_pm25 IS NOT NULL
    `
    )
    .first<{ avg: number | null }>();

  let trend: 'improving' | 'worsening' | 'stable' = 'stable';
  let percentChange: number | null = null;

  if (recentAvg?.avg && previousAvg?.avg) {
    percentChange = ((recentAvg.avg - previousAvg.avg) / previousAvg.avg) * 100;
    if (percentChange > 10) trend = 'worsening';
    else if (percentChange < -10) trend = 'improving';
  }

  return {
    avgPm25: stats?.avg_pm25 || null,
    worstDay: worstDay || null,
    bestDay: bestDay || null,
    daysAboveWho: stats?.days_above_who || 0,
    totalDays: stats?.total_days || 0,
    trend,
    percentChange,
  };
}

/**
 * Get consecutive days above WHO guideline (streak counter)
 */
export async function getConsecutiveDaysAboveWHO(db: D1Database): Promise<number> {
  // Get all days in descending order
  const result = await db
    .prepare(
      `
      SELECT date, weighted_avg_pm25
      FROM national_daily_aggregates
      WHERE weighted_avg_pm25 IS NOT NULL
      ORDER BY date DESC
      LIMIT 365
    `
    )
    .all<{ date: string; weighted_avg_pm25: number }>();

  if (!result.results || result.results.length === 0) return 0;

  let streak = 0;
  for (const row of result.results) {
    if (row.weighted_avg_pm25 > 5) {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}

/**
 * Get year-over-year comparison data
 */
export async function getYearOverYearComparison(db: D1Database): Promise<YearOverYearData> {
  // This year's average (same period)
  const thisYearAvg = await db
    .prepare(
      `
      SELECT AVG(weighted_avg_pm25) as avg
      FROM national_daily_aggregates
      WHERE date >= date('now', '-30 days')
        AND weighted_avg_pm25 IS NOT NULL
    `
    )
    .first<{ avg: number | null }>();

  // Last year's average (same calendar period)
  const lastYearAvg = await db
    .prepare(
      `
      SELECT AVG(weighted_avg_pm25) as avg
      FROM national_daily_aggregates
      WHERE date >= date('now', '-1 year', '-30 days')
        AND date <= date('now', '-1 year')
        AND weighted_avg_pm25 IS NOT NULL
    `
    )
    .first<{ avg: number | null }>();

  // Monthly breakdown - this year
  const thisYearMonthly = await db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', date) as month,
        AVG(weighted_avg_pm25) as avg_pm25
      FROM national_daily_aggregates
      WHERE date >= date('now', '-12 months')
        AND weighted_avg_pm25 IS NOT NULL
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `
    )
    .all<{ month: string; avg_pm25: number }>();

  // Monthly breakdown - last year
  const lastYearMonthly = await db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', date) as month,
        AVG(weighted_avg_pm25) as avg_pm25
      FROM national_daily_aggregates
      WHERE date >= date('now', '-24 months')
        AND date < date('now', '-12 months')
        AND weighted_avg_pm25 IS NOT NULL
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `
    )
    .all<{ month: string; avg_pm25: number }>();

  let percentChange: number | null = null;
  if (thisYearAvg?.avg && lastYearAvg?.avg) {
    percentChange = ((thisYearAvg.avg - lastYearAvg.avg) / lastYearAvg.avg) * 100;
  }

  return {
    thisYearAvg: thisYearAvg?.avg || null,
    lastYearAvg: lastYearAvg?.avg || null,
    percentChange,
    monthlyData: {
      thisYear: (thisYearMonthly.results || []).map((r) => ({
        month: r.month,
        avgPm25: r.avg_pm25,
      })),
      lastYear: (lastYearMonthly.results || []).map((r) => ({
        month: r.month,
        avgPm25: r.avg_pm25,
      })),
    },
  };
}

/**
 * Get the latest ingestion timestamp for freshness display
 */
export async function getLastIngestionTime(db: D1Database): Promise<string | null> {
  const result = await db
    .prepare(
      `
      SELECT completed_at
      FROM ingestion_log
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `
    )
    .first<{ completed_at: string }>();

  return result?.completed_at || null;
}

/**
 * Check if we have enough data for the historical display
 */
export async function hasEnoughHistoricalData(
  db: D1Database,
  minDays: number = 7
): Promise<boolean> {
  const result = await db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM national_daily_aggregates
      WHERE weighted_avg_pm25 IS NOT NULL
    `
    )
    .first<{ count: number }>();

  return (result?.count || 0) >= minDays;
}
