# Multi-City Expansion Plan

## Overview

Expand howfuckedarewe.in to cover multiple Indian cities with a unified navigation and an All-India overview page.

## WAQI Data Availability (Verified January 2026)

| City | Stations | Sample AQI | Status |
|------|----------|------------|--------|
| Delhi | 21 | 187-201 | ✅ Excellent coverage |
| Mumbai | 19 | 156-175 | ✅ Excellent coverage |
| Kolkata | 11 | 160-169 | ✅ Good coverage |
| Chennai | 10 | 78-161 | ✅ Good coverage |
| Hyderabad | 9 | 85-145 | ✅ Good coverage |
| Bangalore | 9 | 90-146 | ✅ Good coverage |
| Ahmedabad | 8 | 126-165 | ✅ Good coverage |
| Pune | 11 | - | ⚠️ Data issues |

## Proposed Architecture

### File Structure

```
src/
├── pages/
│   ├── index.astro              → All India overview
│   ├── [city].astro             → Dynamic city pages
│   └── methodology.astro
├── components/
│   ├── Navigation.astro         → City selector nav
│   ├── FuckedMeter.astro        → Reusable meter component
│   ├── StationList.astro        → Station cards
│   ├── ForecastChart.astro      → 7-day chart
│   └── DeathCounter.astro       → Mortality counter
├── lib/
│   ├── cities.ts                → City configurations
│   ├── api.ts                   → WAQI API client
│   └── calculations.ts          → Fucked Index, etc.
└── layouts/
    └── CityLayout.astro         → Shared layout with nav
```

### City Configuration (`src/lib/cities.ts`)

```typescript
export interface CityConfig {
  slug: string;
  name: string;
  localName?: string;  // Local language name
  coordinates: { lat: number; lng: number };
  stations: number[];  // WAQI station IDs
  population: number;  // For death calculations
  tagline: string;     // Sardonic city-specific tagline
}

export const CITIES: CityConfig[] = [
  {
    slug: 'bangalore',
    name: 'Bangalore',
    localName: 'ಬೆಂಗಳೂರು',
    coordinates: { lat: 12.9716, lng: 77.5946 },
    stations: [8190, 11276, 11428, 11312, 11293, 11270, 8686, 8687, 3758],
    population: 13_000_000,
    tagline: 'Garden City? More like Gas Chamber City.'
  },
  {
    slug: 'delhi',
    name: 'Delhi',
    localName: 'दिल्ली',
    coordinates: { lat: 28.6139, lng: 77.2090 },
    stations: [], // TODO: Get from WAQI search
    population: 32_000_000,
    tagline: 'The national capital of coughing.'
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    localName: 'मुंबई',
    coordinates: { lat: 19.0760, lng: 72.8777 },
    stations: [], // TODO: Get from WAQI search
    population: 21_000_000,
    tagline: 'City of Dreams. Respiratory nightmares included.'
  },
  // ... more cities
];

export const ALL_INDIA = {
  slug: 'india',
  name: 'All India',
  population: 1_400_000_000
};
```

### Dynamic Route (`src/pages/[city].astro`)

```astro
---
import { CITIES } from '../lib/cities';
import CityLayout from '../layouts/CityLayout.astro';
import { fetchCityData } from '../lib/api';

export function getStaticPaths() {
  return CITIES.map(city => ({
    params: { city: city.slug },
    props: { city }
  }));
}

const { city } = Astro.props;
const data = await fetchCityData(city);
---

<CityLayout city={city} data={data}>
  <!-- Same content as current index.astro but using props -->
</CityLayout>
```

### Navigation Component

```astro
---
import { CITIES } from '../lib/cities';
const currentCity = Astro.props.currentCity;
---

<nav class="city-nav">
  <a href="/" class:list={[{ active: !currentCity }]}>All India</a>
  {CITIES.map(city => (
    <a
      href={`/${city.slug}`}
      class:list={[{ active: currentCity?.slug === city.slug }]}
    >
      {city.name}
    </a>
  ))}
</nav>
```

### All-India Overview (`src/pages/index.astro`)

Features:
- Grid of city cards showing current Fucked Index
- National average calculation
- "Worst city right now" highlight
- Map of India with city markers
- Combined death counter for all cities

## Station IDs to Collect

Run this to get station IDs for each city:

```bash
curl -s "https://api.waqi.info/search/?keyword=CITY_NAME&token=YOUR_TOKEN" | \
  python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('data', []):
    if 'India' in s.get('station', {}).get('name', ''):
        print(f\"{s.get('uid')}: {s.get('station', {}).get('name')}\")
"
```

### Delhi Stations (to verify)
```
Search: https://api.waqi.info/search/?keyword=delhi&token=TOKEN
```

### Mumbai Stations (to verify)
```
Search: https://api.waqi.info/search/?keyword=mumbai&token=TOKEN
```

## Implementation Steps

### Phase 1: Refactor Current Code
1. Extract components from index.astro:
   - FuckedMeter.astro
   - StationList.astro
   - ForecastChart.astro
   - DeathCounter.astro
   - CityComparison.astro
2. Create shared layout
3. Move calculations to lib/calculations.ts
4. Create cities.ts config

### Phase 2: Add Dynamic Routes
1. Create [city].astro with getStaticPaths
2. Update API client for any city
3. Add Navigation component
4. Test with Bangalore first

### Phase 3: Add More Cities
1. Collect station IDs for each city
2. Add to cities.ts config
3. Customize taglines per city
4. Test each city page

### Phase 4: All-India Page
1. Create index.astro as overview
2. Fetch data for all cities in parallel
3. Calculate national average
4. Create city comparison grid
5. Add India map visualization

### Phase 5: Polish
1. City-specific sardonic content
2. Local language touches
3. SEO meta tags per city
4. Social sharing images per city

## URL Structure

```
howfuckedarewe.in/              → All India overview
howfuckedarewe.in/bangalore     → Bangalore page
howfuckedarewe.in/delhi         → Delhi page
howfuckedarewe.in/mumbai        → Mumbai page
howfuckedarewe.in/chennai       → Chennai page
howfuckedarewe.in/kolkata       → Kolkata page
howfuckedarewe.in/hyderabad     → Hyderabad page
howfuckedarewe.in/methodology   → Methodology (shared)
```

## City-Specific Taglines (Draft)

| City | Tagline |
|------|---------|
| Delhi | "The national capital of coughing" |
| Mumbai | "City of Dreams. Respiratory nightmares included." |
| Bangalore | "Garden City? More like Gas Chamber City." |
| Chennai | "Filter coffee won't filter this air" |
| Kolkata | "City of Joy? City of Wheezing." |
| Hyderabad | "Biryani tastes better when you can breathe" |

## Technical Notes

### WAQI API Limits
- No documented rate limit for search
- Individual station fetch: ~10 stations/second safe
- For All-India: fetch cities in parallel, stations sequentially

### Build Time Considerations
- 7 cities × 10 stations × 100ms = ~7 seconds
- Use ISR or on-demand revalidation for production
- Consider caching layer if build times grow

### Error Handling
- Filter out AQI 999 (no data error code)
- Filter out AQI >= 500 (invalid readings)
- Gracefully handle missing stations
- Show "Data unavailable" for cities with no working stations

## Environment Variables

```bash
# .env
WAQI_API_TOKEN=your_token_here  # Get from https://aqicn.org/data-platform/token/
```

## References

- WAQI API: https://aqicn.org/api/
- Current codebase: /home/bhuvanesh.r/Ideas/AQI/
- Existing docs: docs/ARCHITECTURE.md, docs/LEARNINGS.md
