import { error, json } from '@sveltejs/kit';
import { loadDomain } from '#lib/server/domain.ts';
import { loadResult } from '#lib/server/result.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const result = (await loadResult(params.id)) ?? (await loadDomain(params.id));
  if (!result) error(404, "There's no result at this address");
  return json(result, { headers: { 'access-control-allow-origin': '*' } });
};
