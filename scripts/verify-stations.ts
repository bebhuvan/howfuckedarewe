#!/usr/bin/env npx tsx
/**
 * Station Verification Script
 * 
 * Verifies that all WAQI station IDs are valid and returning data.
 * Helps diagnose stations that may be offline or returning errors.
 * 
 * Usage: WAQI_API_TOKEN=your_token npx tsx scripts/verify-stations.ts
 */

const WAQI_API_TOKEN = process.env.WAQI_API_TOKEN;

if (!WAQI_API_TOKEN) {
    console.error('❌ WAQI_API_TOKEN not found in environment variables');
    process.exit(1);
}

// Station configurations - copy from config.ts for standalone script
const CITIES = [
    {
        slug: 'chennai',
        name: 'Chennai',
        stations: [
            { id: 13739, name: 'Kodungaiyur', area: 'Kodungaiyur' },
            { id: 13740, name: 'Arumbakkam', area: 'Arumbakkam' },
            { id: 11859, name: 'Manali Village', area: 'Manali' },
            { id: 8185, name: 'Manali', area: 'Manali' },
            { id: 11279, name: 'Velachery Res. Area', area: 'Velachery' },
            { id: 13737, name: 'Royapuram', area: 'Royapuram' },
        ],
    },
    {
        slug: 'bangalore',
        name: 'Bangalore',
        stations: [
            { id: 8190, name: 'BTM Layout', area: 'BTM Layout' },
            { id: 11276, name: 'Jayanagar 5th Block', area: 'Jayanagar' },
            { id: 11428, name: 'Hebbal', area: 'Hebbal' },
            { id: 11293, name: 'Silk Board', area: 'Silk Board' },
            { id: 11312, name: 'Bapuji Nagar', area: 'Bapuji Nagar' },
            { id: 11270, name: 'Hombegowda Nagar', area: 'Hombegowda Nagar' },
            { id: 12441, name: 'BWSSB Kadabesanahalli', area: 'Kadabesanahalli' },
            { id: 8686, name: 'City Railway Station', area: 'Majestic' },
            { id: 8687, name: 'Sanegurava Halli', area: 'Sanegurava Halli' },
            { id: 3758, name: 'Peenya', area: 'Peenya' },
        ],
    },
];

interface WaqiResponse {
    status: 'ok' | 'error';
    data?: {
        idx: number;
        aqi: number | string;
        city?: { name: string };
        time?: { iso: string };
        iaqi?: {
            pm25?: { v: number };
            pm10?: { v: number };
        };
        dominentpol?: string;
    };
    message?: string;
}

async function verifyStation(stationId: number, stationName: string): Promise<{
    id: number;
    name: string;
    status: 'ok' | 'error' | 'no_pm25';
    aqi?: number;
    pm25?: number;
    lastUpdate?: string;
    error?: string;
}> {
    const url = `https://api.waqi.info/feed/@${stationId}/?token=${WAQI_API_TOKEN}`;

    try {
        const response = await fetch(url);
        const data: WaqiResponse = await response.json();

        if (data.status !== 'ok' || !data.data) {
            return {
                id: stationId,
                name: stationName,
                status: 'error',
                error: data.message || 'API returned error or no data',
            };
        }

        const aqi = typeof data.data.aqi === 'number' ? data.data.aqi : null;
        const pm25 = data.data.iaqi?.pm25?.v;
        const lastUpdate = data.data.time?.iso;

        // Check if we have PM2.5 data (our primary metric)
        if (pm25 === undefined || pm25 === null) {
            return {
                id: stationId,
                name: stationName,
                status: 'no_pm25',
                aqi: aqi ?? undefined,
                lastUpdate,
                error: 'No PM2.5 data available from this station',
            };
        }

        return {
            id: stationId,
            name: stationName,
            status: 'ok',
            aqi: aqi ?? undefined,
            pm25,
            lastUpdate,
        };
    } catch (error) {
        return {
            id: stationId,
            name: stationName,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown fetch error',
        };
    }
}

async function verifyCity(city: typeof CITIES[0]): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📍 ${city.name} (${city.stations.length} configured stations)`);
    console.log('='.repeat(60));

    let okCount = 0;
    let errorCount = 0;
    let noPm25Count = 0;

    for (const station of city.stations) {
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

        const result = await verifyStation(station.id, station.name);

        if (result.status === 'ok') {
            okCount++;
            console.log(`  ✅ ${result.name} (ID: ${result.id})`);
            console.log(`      AQI: ${result.aqi ?? 'N/A'} | PM2.5: ${result.pm25} µg/m³`);
            console.log(`      Last update: ${result.lastUpdate}`);
        } else if (result.status === 'no_pm25') {
            noPm25Count++;
            console.log(`  ⚠️  ${result.name} (ID: ${result.id})`);
            console.log(`      ${result.error}`);
            console.log(`      AQI: ${result.aqi ?? 'N/A'} | Last update: ${result.lastUpdate}`);
        } else {
            errorCount++;
            console.log(`  ❌ ${result.name} (ID: ${result.id})`);
            console.log(`      Error: ${result.error}`);
        }
    }

    console.log(`\n📊 ${city.name} Summary:`);
    console.log(`   Working with PM2.5: ${okCount}/${city.stations.length}`);
    console.log(`   No PM2.5 data: ${noPm25Count}`);
    console.log(`   Errors: ${errorCount}`);
}

async function searchForMoreStations(cityName: string): Promise<void> {
    console.log(`\n🔍 Searching WAQI for additional ${cityName} stations...`);
    const url = `https://api.waqi.info/search/?keyword=${encodeURIComponent(cityName)}&token=${WAQI_API_TOKEN}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'ok' && data.data) {
            console.log(`   Found ${data.data.length} stations in WAQI for "${cityName}":\n`);

            for (const station of data.data) {
                const stationId = station.uid;
                const stationName = station.station?.name || 'Unknown';
                console.log(`   ID: ${stationId} | Name: ${stationName}`);
            }
        }
    } catch (error) {
        console.error('   Error searching stations:', error);
    }
}

async function main(): Promise<void> {
    console.log('🔬 WAQI Station Verification Tool');
    console.log('==================================\n');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Token: ${WAQI_API_TOKEN?.substring(0, 8)}...`);

    for (const city of CITIES) {
        await verifyCity(city);
        await searchForMoreStations(city.name);
    }

    console.log('\n\n✅ Verification complete!');
}

main().catch(console.error);
