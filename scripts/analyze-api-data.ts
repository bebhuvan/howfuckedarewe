#!/usr/bin/env npx tsx
/**
 * WAQI API Data Analysis Script
 * 
 * Fetches complete API responses to analyze available data points
 * for potential site improvements.
 */

const WAQI_API_TOKEN = process.env.WAQI_API_TOKEN;

if (!WAQI_API_TOKEN) {
    console.error('❌ WAQI_API_TOKEN not found');
    process.exit(1);
}

// Sample stations from different cities
const SAMPLE_STATIONS = [
    { id: 2553, name: 'Anand Vihar, Delhi' },
    { id: 8190, name: 'BTM Layout, Bangalore' },
    { id: 8185, name: 'Manali, Chennai' },
    { id: 13715, name: 'BKC, Mumbai' },
];

async function fetchFullStationData(stationId: number, stationName: string) {
    const url = `https://api.waqi.info/feed/@${stationId}/?token=${WAQI_API_TOKEN}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📍 ${stationName} (ID: ${stationId})`);
        console.log('='.repeat(80));

        if (data.status !== 'ok' || !data.data) {
            console.log('❌ No data available');
            return null;
        }

        const d = data.data;

        // Basic info
        console.log('\n📊 BASIC INFO:');
        console.log(`   Station IDX: ${d.idx}`);
        console.log(`   AQI: ${d.aqi}`);
        console.log(`   Dominant Pollutant: ${d.dominentpol || 'N/A'}`);
        console.log(`   City: ${d.city?.name}`);
        console.log(`   Coordinates: ${d.city?.geo?.join(', ')}`);
        console.log(`   Timezone: ${d.time?.tz}`);
        console.log(`   Last Update: ${d.time?.iso}`);

        // Individual Air Quality Indices (iaqi)
        console.log('\n🌡️  AIR QUALITY INDICES (iaqi):');
        if (d.iaqi) {
            for (const [key, value] of Object.entries(d.iaqi)) {
                const v = (value as any)?.v;
                console.log(`   ${key.toUpperCase().padEnd(8)}: ${v !== undefined ? v : 'N/A'}`);
            }
        }

        // Forecast data
        console.log('\n📅 FORECAST DATA:');
        if (d.forecast?.daily) {
            for (const [pollutant, days] of Object.entries(d.forecast.daily)) {
                const forecast = days as Array<{ day: string, avg: number, min: number, max: number }>;
                console.log(`   ${pollutant.toUpperCase()}:`);
                forecast.slice(0, 5).forEach(day => {
                    console.log(`      ${day.day}: avg=${day.avg}, min=${day.min}, max=${day.max}`);
                });
            }
        } else {
            console.log('   No forecast available');
        }

        // Attribution
        console.log('\n📜 ATTRIBUTION:');
        if (d.attributions) {
            d.attributions.forEach((attr: any) => {
                console.log(`   - ${attr.name} (${attr.url})`);
            });
        }

        // Debug section - show all available keys
        console.log('\n🔑 ALL TOP-LEVEL KEYS IN RESPONSE:');
        console.log(`   ${Object.keys(d).join(', ')}`);

        if (d.iaqi) {
            console.log('\n🔑 ALL AVAILABLE IAQI KEYS:');
            console.log(`   ${Object.keys(d.iaqi).join(', ')}`);
        }

        return d;
    } catch (error) {
        console.error('Error fetching:', error);
        return null;
    }
}

async function main() {
    console.log('🔬 WAQI API Data Analysis');
    console.log('========================\n');
    console.log('Analyzing full API responses to identify improvement opportunities...\n');

    const allData: any[] = [];

    for (const station of SAMPLE_STATIONS) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
        const data = await fetchFullStationData(station.id, station.name);
        if (data) allData.push(data);
    }

    // Summary of available data
    console.log('\n\n' + '='.repeat(80));
    console.log('📋 SUMMARY: DATA AVAILABLE ACROSS ALL STATIONS');
    console.log('='.repeat(80));

    // Collect all unique iaqi keys
    const iaqiKeys = new Set<string>();
    allData.forEach(d => {
        if (d.iaqi) {
            Object.keys(d.iaqi).forEach(k => iaqiKeys.add(k));
        }
    });

    console.log('\n🌡️  POLLUTANTS & WEATHER AVAILABLE IN IAQI:');
    const pollutantInfo: Record<string, string> = {
        'pm25': 'PM2.5 (Fine particles) ← Currently used',
        'pm10': 'PM10 (Coarse particles) ← Currently stored but not prominently shown',
        'o3': 'Ozone ← Currently stored',
        'no2': 'Nitrogen Dioxide ← Currently stored',
        'so2': 'Sulfur Dioxide ← Currently stored',
        'co': 'Carbon Monoxide ← Currently stored',
        't': 'Temperature (°C) ← NOT used yet',
        'h': 'Humidity (%) ← NOT used yet',
        'w': 'Wind Speed ← NOT used yet',
        'p': 'Atmospheric Pressure ← NOT used yet',
        'wg': 'Wind Gust ← NOT used yet',
        'dew': 'Dew Point ← NOT used yet',
    };

    for (const key of Array.from(iaqiKeys).sort()) {
        const info = pollutantInfo[key] || '← Unknown metric';
        console.log(`   ${key.padEnd(6)}: ${info}`);
    }

    // Forecast availability
    const hasForecasts = allData.filter(d => d.forecast?.daily).length;
    console.log(`\n📅 FORECAST AVAILABILITY: ${hasForecasts}/${allData.length} stations have multi-day forecasts`);

    // Suggestions
    console.log('\n\n' + '='.repeat(80));
    console.log('💡 IMPROVEMENT OPPORTUNITIES');
    console.log('='.repeat(80));

    console.log(`
1. WEATHER DATA (Currently unused)
   - Temperature: Show "feels like" air quality (worse in heat)
   - Humidity: Affects PM2.5 perception and health impact
   - Wind: Indicates if pollution will clear or stagnate

2. FORECAST INTEGRATION
   - Show 3-5 day PM2.5 forecast
   - "Tomorrow will be worse/better" messaging
   - Weekly outlook chart

3. MULTI-POLLUTANT ANALYSIS
   - Show dominant pollutant more prominently
   - Ozone warnings (bad in summer afternoons)
   - NO2/SO2 for traffic vs industrial areas

4. TIME-BASED INSIGHTS
   - Show hourly patterns (morning/evening peaks)
   - Compare to same time yesterday
   - Weekend vs weekday patterns

5. CALCULATION EXPANSIONS
   - Heat-adjusted cigarette equivalents
   - "Safe outdoor exercise" recommendations
   - Visibility estimation from PM2.5
`);
}

main().catch(console.error);
