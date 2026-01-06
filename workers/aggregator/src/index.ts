/**
 * AQI Aggregator Worker
 *
 * Computes national daily aggregates from city-level data.
 * Runs on cron: 15 * * * * (15 minutes after each hour, after ingestion)
 *
 * Computes:
 * - Population-weighted national PM2.5 average
 * - Best/worst cities for the day
 * - Health impact metrics (cigarettes, years lost, WHO violation)
 */

interface Env {
  DB: D1Database;
}

// Health metrics constants (same as ingestion worker)
const METRICS = {
  WHO_GUIDELINE: 5,
  CIGARETTE_PM25_EQUIVALENT: 22,
  AQLI_YEARS_PER_10UG: 0.98,
};

export default {
  /**
   * Scheduled handler - runs on cron trigger
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting national aggregation...`);

    try {
      const result = await computeNationalAggregates(env.DB);
      console.log(`[${new Date().toISOString()}] Aggregation complete:`, result);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Aggregation failed:`, error);
      throw error;
    }
  },

  /**
   * HTTP handler - for manual triggers and health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/trigger') {
      try {
        const result = await computeNationalAggregates(env.DB);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname === '/stats') {
      const stats = await getAggregationStats(env.DB);
      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Backfill endpoint - compute for date range
    if (url.pathname === '/backfill') {
      const startDate = url.searchParams.get('start');
      const endDate = url.searchParams.get('end');

      if (!startDate || !endDate) {
        return new Response('Missing start or end date', { status: 400 });
      }

      try {
        const result = await backfillNationalAggregates(env.DB, startDate, endDate);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('AQI Aggregator Worker', { status: 200 });
  },
};

/**
 * Main aggregation function - computes national aggregates for today
 */
async function computeNationalAggregates(db: D1Database): Promise<Record<string, any>> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return computeNationalAggregateForDate(db, today);
}

/**
 * Compute national aggregate for a specific date
 */
async function computeNationalAggregateForDate(
  db: D1Database,
  date: string
): Promise<Record<string, any>> {
  // Get daily aggregates for all cities on this date
  const cityData = await db
    .prepare(`
      SELECT
        da.city_id,
        da.avg_pm25,
        da.min_pm25,
        da.max_pm25,
        c.population,
        c.name as city_name
      FROM daily_aggregates da
      JOIN cities c ON da.city_id = c.id
      WHERE da.date = ?
        AND da.avg_pm25 IS NOT NULL
    `)
    .bind(date)
    .all<{
      city_id: number;
      avg_pm25: number;
      min_pm25: number;
      max_pm25: number;
      population: number;
      city_name: string;
    }>();

  if (!cityData.results || cityData.results.length === 0) {
    console.log(`No city data for ${date}`);
    return { date, citiesReporting: 0, skipped: true };
  }

  const cities = cityData.results;

  // Simple average
  const avgPm25 = cities.reduce((sum, c) => sum + c.avg_pm25, 0) / cities.length;

  // Population-weighted average
  const totalPopulation = cities.reduce((sum, c) => sum + (c.population || 0), 0);
  const weightedAvgPm25 =
    totalPopulation > 0
      ? cities.reduce((sum, c) => sum + c.avg_pm25 * (c.population || 0), 0) / totalPopulation
      : avgPm25;

  // Best and worst cities
  const sortedByPm25 = [...cities].sort((a, b) => a.avg_pm25 - b.avg_pm25);
  const bestCity = sortedByPm25[0];
  const worstCity = sortedByPm25[sortedByPm25.length - 1];

  // Min/max across all cities
  const minPm25 = Math.min(...cities.map((c) => c.min_pm25));
  const maxPm25 = Math.max(...cities.map((c) => c.max_pm25));

  // Health metrics (based on weighted average)
  const cigarettesEquivalent = weightedAvgPm25 / METRICS.CIGARETTE_PM25_EQUIVALENT;
  const yearsLostPerYear =
    Math.max(0, (weightedAvgPm25 - METRICS.WHO_GUIDELINE) / 10) * METRICS.AQLI_YEARS_PER_10UG;
  const whoViolation = weightedAvgPm25 / METRICS.WHO_GUIDELINE;

  // Insert or update national aggregate
  try {
    await db
      .prepare(`
        INSERT OR REPLACE INTO national_daily_aggregates
        (date, avg_pm25, weighted_avg_pm25, min_pm25, max_pm25,
         cities_reporting, total_population_covered,
         cigarettes_equivalent, years_lost_per_year, who_violation_factor,
         worst_city_id, best_city_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        date,
        avgPm25,
        weightedAvgPm25,
        minPm25,
        maxPm25,
        cities.length,
        totalPopulation,
        cigarettesEquivalent,
        yearsLostPerYear,
        whoViolation,
        worstCity.city_id,
        bestCity.city_id
      )
      .run();

    return {
      date,
      citiesReporting: cities.length,
      avgPm25: Math.round(avgPm25 * 10) / 10,
      weightedAvgPm25: Math.round(weightedAvgPm25 * 10) / 10,
      worstCity: worstCity.city_name,
      bestCity: bestCity.city_name,
      whoViolation: Math.round(whoViolation * 10) / 10,
    };
  } catch (error) {
    console.error(`Error inserting national aggregate for ${date}:`, error);
    throw error;
  }
}

/**
 * Backfill national aggregates for a date range
 */
async function backfillNationalAggregates(
  db: D1Database,
  startDate: string,
  endDate: string
): Promise<{ processed: number; errors: number }> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let processed = 0;
  let errors = 0;

  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const result = await computeNationalAggregateForDate(db, dateStr);
      if (!result.skipped) {
        processed++;
        console.log(`Processed ${dateStr}: ${result.citiesReporting} cities`);
      }
    } catch (error) {
      console.error(`Error processing ${dateStr}:`, error);
      errors++;
    }
    current.setDate(current.getDate() + 1);
  }

  return { processed, errors };
}

/**
 * Get aggregation statistics
 */
async function getAggregationStats(db: D1Database): Promise<Record<string, any>> {
  const totalDays = await db
    .prepare('SELECT COUNT(*) as count FROM national_daily_aggregates')
    .first<{ count: number }>();

  const latestDate = await db
    .prepare('SELECT date FROM national_daily_aggregates ORDER BY date DESC LIMIT 1')
    .first<{ date: string }>();

  const avgStats = await db
    .prepare(`
      SELECT
        AVG(weighted_avg_pm25) as avg_pm25,
        AVG(cities_reporting) as avg_cities
      FROM national_daily_aggregates
      WHERE date >= date('now', '-30 days')
    `)
    .first<{ avg_pm25: number; avg_cities: number }>();

  const daysAboveWho = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM national_daily_aggregates
      WHERE weighted_avg_pm25 > 5
        AND date >= date('now', '-30 days')
    `)
    .first<{ count: number }>();

  return {
    totalDays: totalDays?.count || 0,
    latestDate: latestDate?.date,
    last30Days: {
      avgPm25: avgStats?.avg_pm25 ? Math.round(avgStats.avg_pm25 * 10) / 10 : null,
      avgCitiesReporting: avgStats?.avg_cities ? Math.round(avgStats.avg_cities * 10) / 10 : null,
      daysAboveWho: daysAboveWho?.count || 0,
    },
  };
}
