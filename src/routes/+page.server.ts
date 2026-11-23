import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { minutes } from '#lib/format.ts';
import { FetchError } from '#lib/server/fetcher.ts';
import type { Admission } from '#lib/server/gate.ts';
import { lookUpText, lookUpUrl, type Outcome } from '#lib/server/lookup.ts';
import { isHuman } from '#lib/server/turnstile.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
  sitekey: env.TURNSTILE_SECRET ? env.TURNSTILE_SITEKEY : undefined,
  prefill: url.searchParams.get('url') ?? '',
  force: url.searchParams.has('force'),
  between: url.searchParams.has('between')
});

const withScheme = (input: string) => (/^https?:\/\//i.test(input) ? input : `https://${input}`);
const NOT_A_PERSON = "The person check hadn't finished. Give it a second and try again.";
const MOST_PASTED = 100_000;
// generous for 100,000 characters of anything plus the form around them, and no more
const MOST_BYTES = 5 * MOST_PASTED;

const tooBig = (request: Request) => Number(request.headers.get('content-length')) > MOST_BYTES;

function refusal({ reason, retryAt }: Extract<Admission, { ok: false }>) {
  const wait = minutes(retryAt - Date.now());
  return reason === 'busy'
    ? `The line's full, as the corpus host only takes so many searches an hour. Try again in ${wait}.`
    : `That's your 5 fresh checks for this hour. Try again in ${wait}, or look up a page someone's already checked.`;
}

export const actions: Actions = {
  check: async ({ request, getClientAddress }) => {
    if (tooBig(request))
      return fail(413, { url: '', error: "That's far too much for an address." });
    const form = await request.formData();
    const url = String(form.get('url') ?? '').trim();
    const ip = getClientAddress();
    if (!url) return fail(400, { url, error: 'Paste the address of a page first.' });
    if (!(await isHuman(form.get('cf-turnstile-response'), ip))) {
      return fail(400, {
        url,
        error: "The person check hadn't finished. Give it a second and try again."
      });
    }
    let outcome: Outcome;
    try {
      outcome = await lookUpUrl(withScheme(url), ip, {
        force: form.get('force') === '1',
        between: form.get('between') === '1'
      });
    } catch (error) {
      if (error instanceof FetchError) {
        return fail(422, { url, error: error.message, paste: error.reason !== 'address' });
      }
      throw error;
    }
    if ('id' in outcome) redirect(303, `/r/${outcome.id}`);
    return fail(429, { url, error: refusal(outcome.refused) });
  },

  paste: async ({ request, getClientAddress }) => {
    const long = `That's over ${MOST_PASTED.toLocaleString('en-GB')} characters. A few paragraphs will do.`;
    if (tooBig(request)) return fail(413, { pasteError: long });
    const form = await request.formData();
    const text = String(form.get('text') ?? '');
    const ip = getClientAddress();
    if (text.length > MOST_PASTED) return fail(413, { pasteError: long });
    if (text.trim().length < 200) {
      return fail(400, { pasteError: 'Paste a few paragraphs, as it needs three long sentences.' });
    }
    if (!(await isHuman(form.get('cf-turnstile-response'), ip))) {
      return fail(400, { pasteError: NOT_A_PERSON });
    }
    const outcome = await lookUpText(text, ip);
    if ('id' in outcome) redirect(303, `/r/${outcome.id}`);
    return fail(429, { pasteError: refusal(outcome.refused) });
  }
};
