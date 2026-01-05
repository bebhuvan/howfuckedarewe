/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Cloudflare D1 Database type
type D1Database = import('@cloudflare/workers-types').D1Database;

// Runtime environment from Cloudflare
type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  SITE_URL: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
