import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { minutes } from '#lib/format.ts';
import { FetchError } from '#lib/server/fetcher.ts';
import { lookUpUrl, type Outcome } from '#lib/server/lookup.ts';
import { isHuman } from '#lib/server/turnstile.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
  sitekey: env.TURNSTILE_SECRET ? env.TURNSTILE_SITEKEY : undefined,
  prefill: url.searchParams.get('url') ?? '',
  force: url.searchParams.has('force')
});

const withScheme = (input: string) => (/^https?:\/\//i.test(input) ? input : `https://${input}`);

export const actions: Actions = {
  check: async ({ request, getClientAddress }) => {
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
      outcome = await lookUpUrl(withScheme(url), ip, form.get('force') === '1');
    } catch (error) {
      if (error instanceof FetchError) return fail(422, { url, error: error.message });
      throw error;
    }
    if ('id' in outcome) redirect(303, `/r/${outcome.id}`);
    const wait = minutes(outcome.refused.retryAt - Date.now());
    const error =
      outcome.refused.reason === 'busy'
        ? `The line's full, as the corpus host only takes so many searches an hour. Try again in ${wait}.`
        : `That's your 5 fresh checks for this hour. Try again in ${wait}, or look up a page someone's already checked.`;
    return fail(429, { url, error });
  }
};
