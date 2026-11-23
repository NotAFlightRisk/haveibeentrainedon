import type { Gate } from '#lib/server/gate.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      GATE: DurableObjectNamespace<Gate>;
      GATE_MS?: string;
      TURNSTILE_SITEKEY?: string;
      TURNSTILE_SECRET?: string;
      SENTRY_DSN?: string;
    }
  }
}

export {};
