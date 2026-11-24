import app from '../.svelte-kit/cloudflare/_worker.js';
import { env } from 'cloudflare:workers';
import { report } from './lib/server/report.ts';

export { Crawls } from './lib/server/captures.ts';
export { Gate } from './lib/server/gate.ts';

export default {
  fetch: app.fetch,

  async scheduled() {
    await env.GATE.getByName('line')
      .canary()
      .catch((error: unknown) => report(error, undefined, 'cron'));
  }
};
