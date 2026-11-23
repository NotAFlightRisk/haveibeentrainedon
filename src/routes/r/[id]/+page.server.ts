import { error } from '@sveltejs/kit';
import { loadResult } from '#lib/server/result.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const result = await loadResult(params.id);
  if (!result) error(404, "There's no result at this address");
  return { result };
};
