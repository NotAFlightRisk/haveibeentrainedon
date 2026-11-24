import { error, fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { DomainError, loadDomain, swapPost } from '#lib/server/domain.ts';
import { NOT_A_PERSON, refusal } from '#lib/server/form.ts';
import { isHuman } from '#lib/server/turnstile.ts';
import { OG_DOMAIN } from '#lib/share.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const sample = await loadDomain(params.id);
  if (!sample) error(404, "There's no result at this address");
  const sitekey = env.TURNSTILE_SECRET ? env.TURNSTILE_SITEKEY : undefined;
  return { sample, sitekey, ogImage: OG_DOMAIN };
};

export const actions: Actions = {
  swap: async ({ request, params, getClientAddress }) => {
    const form = await request.formData();
    const ip = getClientAddress();
    if (!(await isHuman(form.get('cf-turnstile-response'), ip))) {
      return fail(400, { error: NOT_A_PERSON });
    }
    try {
      const outcome = await swapPost(params.id, String(form.get('post') ?? ''), ip);
      if (!outcome) return fail(400, { error: "That post can't be swapped any more." });
      if ('refused' in outcome) return fail(429, { error: refusal(outcome.refused) });
    } catch (problem) {
      if (problem instanceof DomainError) return fail(422, { error: problem.message });
      throw problem;
    }
    redirect(303, `/d/${params.id}`);
  }
};
