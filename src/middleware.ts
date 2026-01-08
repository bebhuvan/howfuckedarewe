import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
    const response = await next();

    // Cache Control for static assets and pages
    // For SSR pages, we want short cache at edge (e.g. 60s) to reduce load but keep data fresh
    // D1 data is updated hourly, so 60s-5m is reasonable.
    if (response.headers.get('Content-Type')?.includes('text/html')) {
        // s-maxage=60: Cache at Cloudflare edge for 60 seconds
        // stale-while-revalidate=600: Serve stale content for up to 10 mins while updating in background
        response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
    }

    return response;
});
