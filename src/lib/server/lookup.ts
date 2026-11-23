import { env } from 'cloudflare:workers';
import { SETS, TIMELINE } from '#lib/corpora.ts';
import { estimate, type Span } from '#lib/plan.ts';
import { hashSpan } from '#lib/spans.ts';
import { checkAddress, fetchPage } from './fetcher.ts';
import type { Admission } from './gate.ts';
import { readPage } from './page.ts';
import { dropLookup, lookupByUrl, saveLookup, type Lookup } from './store.ts';

/** Bumped whenever the picker changes, so old verdicts get counted afresh */
export const PICKER = 1;
const STALE_MS = 30 * 24 * 60 * 60_000;
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi)$/i;

export type Outcome = { id: string } | { refused: Extract<Admission, { ok: false }> };

export function normalise(input: URL) {
  const url = new URL(input);
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.test(name)) url.searchParams.delete(name);
  }
  return url.href;
}

const bare = (host: string) => host.replace(/^www\./, '');

/** The page's own canonical address if it's on the same site, as copies of copies abound */
function canonicalOf(href: string | undefined, landed: URL) {
  if (!href) return normalise(landed);
  try {
    const canonical = new URL(href, landed);
    return bare(canonical.hostname) === bare(landed.hostname)
      ? normalise(canonical)
      : normalise(landed);
  } catch {
    return normalise(landed);
  }
}

/** Sets a dated page can't be in are "too new" without asking, unless someone asks anyway */
export function splitByDate(published: string | undefined, force: boolean) {
  const wanted = [...SETS, ...TIMELINE];
  const tooNew = (newest: string) => !force && !!published && published > newest;
  return {
    indexes: wanted.filter((corpus) => !tooNew(corpus.newest)).map((corpus) => corpus.index),
    skipped: wanted.filter((corpus) => tooNew(corpus.newest)).map((corpus) => corpus.index)
  };
}

export const newId = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
    .replaceAll('+', '-')
    .replaceAll('/', '_');

const fresh = (lookup: Lookup | null) =>
  !!lookup && lookup.picker === PICKER && Date.now() - lookup.checkedAt < STALE_MS;

async function queue(lookup: Lookup, who: string, previous: Lookup | null): Promise<Outcome> {
  await saveLookup(lookup);
  if (lookup.status === 'done') return { id: lookup.id };
  const plan = { spans: lookup.spans, indexes: lookup.indexes };
  const admission = await env.GATE.getByName('line').admit({
    id: lookup.id,
    plan,
    cost: estimate(plan),
    kind: 'url',
    who
  });
  if (admission.ok) return { id: lookup.id };
  await (previous ? saveLookup(previous) : dropLookup(lookup.id));
  return { refused: admission };
}

/** Finds a page's result, fetching and queueing it only when there isn't a recent one */
export async function lookUpUrl(input: string, who: string, force = false): Promise<Outcome> {
  const asked = normalise(checkAddress(input.trim()));
  const cached = await lookupByUrl(asked);
  if (fresh(cached) && !force) return { id: cached!.id };

  const { url: landed, html } = await fetchPage(asked);
  const page = readPage(html);
  const url = canonicalOf(page.canonical, landed);
  const previous = url === asked ? cached : await lookupByUrl(url);
  if (fresh(previous) && !force) return { id: previous!.id };

  const spans: Span[] = await Promise.all(
    page.spans.map(async (text) => ({ text, hash: await hashSpan(text) }))
  );
  const { indexes, skipped } = splitByDate(page.published, force);
  const ready = spans.length < 2 || !indexes.length;
  const lookup: Lookup = {
    id: previous?.id ?? newId(),
    kind: 'url',
    url,
    title: page.title || null,
    published: page.published ?? null,
    lang: page.lang ?? null,
    spans,
    indexes: spans.length < 2 ? [] : indexes,
    skipped,
    picker: PICKER,
    status: ready ? 'done' : 'queued',
    checkedAt: Date.now(),
    doneAt: ready ? Date.now() : null
  };
  return queue(lookup, who, previous);
}
