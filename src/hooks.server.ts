import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { report } from '#lib/server/report.ts';

// result pages are unlisted, so search engines get told to leave them be
const UNLISTED = /^\/(r|d|api)\//;
// what _headers gives the static files, for everything the Worker renders
const HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
  // only Cloudflare's edge sets this, so local dev stays on plain http
  if (event.request.headers.get('cf-visitor')?.includes('"http"')) {
    return Response.redirect(event.url.href.replace('http:', 'https:'), 301);
  }
  const response = await resolve(event);
  for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value);
  if (UNLISTED.test(event.url.pathname)) response.headers.set('x-robots-tag', 'noindex');
  return response;
};

export const handleError: HandleServerError = async ({ kind, error, event }) => {
  if (kind === 'unknown') await report(error, event.request);
};
