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

const NOT_ASKED = {
  down: "Common Crawl's index didn't answer. Give it a minute.",
  busy: "Common Crawl's index is busy with other pages. Try again in a few minutes.",
  resting:
    'Nothing to ask about just yet. A crawl the index missed can be asked about again ten minutes on, and new ones turn up about once a month.'
};

export const actions: Actions = {
  crawls: async ({ params }) => {
    const lookup = await lookupById(params.id);
    if (!lookup?.url) return fail(404, { crawlError: "There's no page here to look up." });
    const page = unwrap(lookup.url)?.original ?? lookup.url;
    const asked = await askCaptures(page, lookup.id).catch(async (problem: unknown) => {
      await report(problem, undefined, 'crawls');
      return 'down' as const;
    });
    if (asked !== 'asked')
      return fail(asked === 'down' ? 503 : 429, { crawlError: NOT_ASKED[asked] });
  }
};
