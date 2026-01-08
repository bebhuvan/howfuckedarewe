/// <reference types="astro/client" />

interface ImportMetaEnv {
    readonly WAQI_API_TOKEN: string;
    readonly SITE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Cloudflare Workers runtime types
type D1Database = import('@cloudflare/workers-types').D1Database;

interface Runtime {
    env: {
        DB: D1Database;
        WAQI_API_TOKEN: string;
    };
}

declare namespace App {
    interface Locals {
        runtime: Runtime;
    }
}
