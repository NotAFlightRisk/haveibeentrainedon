import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';

// the hourly canary keeps both fresh, so anything older means an API has stopped answering
const STALE_MS = 3 * 60 * 60_000;

export const GET: RequestHandler = async () => {
  const gate = await env.GATE.getByName('line').health();
  const fresh = (at: number | null) => at !== null && Date.now() - at < STALE_MS;
  const ok = fresh(gate.v4) && fresh(gate.mini);
  const when = (at: number | null) => (at ? new Date(at).toISOString() : null);
  return json(
    {
      ok,
      infinigram: when(gate.v4),
      infinigramMini: when(gate.mini),
      line: gate.line,
      paused: gate.paused,
      slow: gate.slow
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  );
};
