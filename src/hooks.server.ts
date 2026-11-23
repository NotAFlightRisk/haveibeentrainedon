import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { report } from '#lib/server/report.ts';

// result pages are unlisted, so search engines get told to leave them be
const UNLISTED = /^\/(r|api)\//;

export const handle: Handle = async ({ event, resolve }) => {
  // only Cloudflare's edge sets this, so local dev stays on plain http
  if (event.request.headers.get('cf-visitor')?.includes('"http"')) {
    return Response.redirect(event.url.href.replace('http:', 'https:'), 301);
  }
  const response = await resolve(event);
  if (UNLISTED.test(event.url.pathname)) response.headers.set('x-robots-tag', 'noindex');
  return response;
};

export const handleError: HandleServerError = async ({ kind, error, event }) => {
  if (kind === 'unknown') await report(error, event.request);
};
