import type { Crawls } from '#lib/server/captures.ts';
import type { Gate } from '#lib/server/gate.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      GATE: DurableObjectNamespace<Gate>;
      CRAWLS: DurableObjectNamespace<Crawls>;
      GATE_MS?: string;
      TURNSTILE_SITEKEY?: string;
      TURNSTILE_SECRET?: string;
      SENTRY_DSN?: string;
    }
  }
}

export {};
