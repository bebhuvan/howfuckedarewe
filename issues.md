I’ll treat this as a review of the calculations/methodology in src/pages/index.astro. Here are the issues I see, ordered by severity.

  Findings

  - High: avgPm25Aqi divides by pm25Values.length without guarding zero; if no station reports pm25, this becomes NaN and cascades into
    cigarettes/lifespan. src/pages/index.astro
  - High: avgAqi divides by validStations.length without guarding zero; if API fails or token missing, you’ll get NaN and broken UI.
    src/pages/index.astro
  - Medium: cigarettes and cigarettesPerDay use Berkeley Earth’s 22 µg/m³ ≈ 1 cigarette/day, but you convert AQI → µg/m³ using EPA
    breakpoints and apply that to WAQI AQI, which may be based on different national breakpoints (CPCB vs US EPA). This can bias the
    cigarette equivalence. src/pages/index.astro
  - Medium: avgPm25Aqi uses s.iaqi?.pm25?.v which is already an AQI value for PM2.5, then converts it using US EPA breakpoints. If the
    station’s PM2.5 AQI is CPCB-based, the conversion is off. Prefer direct pm25 concentration if available, or document the assumption.
    src/pages/index.astro
  - Medium: hoursLostPerDay is derived from a lifetime impact model (AQLI) and then converted to daily hours lost by dividing by 70
    years; this is a heuristic and may read as a precise daily “cost.” Might need clearer wording that it’s an averaged lifetime-
    equivalent. src/pages/index.astro
  - Low: cleanStationName assumes particular formats ('bangalore; ', 'Bengaluru') and may produce odd labels or strip unintended text.
    src/pages/index.astro

  Open questions / assumptions

  - Are you intentionally using US EPA breakpoints for AQI→PM2.5 conversions rather than CPCB/Indian breakpoints?
  - Do you want to treat the cigarette equivalence as illustrative only, with explicit uncertainty?