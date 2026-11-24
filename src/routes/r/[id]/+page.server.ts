import { error, fail } from '@sveltejs/kit';
import { askCaptures } from '#lib/server/captures.ts';
import { report } from '#lib/server/report.ts';
import { lookupById } from '#lib/server/store.ts';
import { loadResult } from '#lib/server/result.ts';
import { ogImage } from '#lib/share.ts';
import { unwrap } from '#lib/wayback.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const result = await loadResult(params.id);
  if (!result) error(404, "There's no result at this address");
  return { result, ogImage: result.thin ? '/og.png' : ogImage(result.sets) };
};

export const actions: Actions = {
  crawls: async ({ params }) => {
    const lookup = await lookupById(params.id);
    if (!lookup?.url) return fail(404, { crawlError: "There's no page here to look up." });
    const page = unwrap(lookup.url)?.original ?? lookup.url;
    const asked = await askCaptures(page, lookup.id).catch(async (problem: unknown) => {
      await report(problem, undefined, 'crawls');
      return undefined;
    });
    if (asked === undefined) {
      return fail(503, { crawlError: "Common Crawl's index didn't answer. Give it a minute." });
    }
    if (!asked) {
      return fail(429, {
        crawlError: "Common Crawl's index is busy with other pages. Try again in a few minutes."
      });
    }
  }
};
