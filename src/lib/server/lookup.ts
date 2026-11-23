import { env } from 'cloudflare:workers';
import { SETS, TIMELINE } from '#lib/corpora.ts';
import { estimate, type Span } from '#lib/plan.ts';
import { hashSpan, pastedSpans } from '#lib/spans.ts';
import { checkAddress, fetchPage } from './fetcher.ts';
import type { Admission } from './gate.ts';
import { readPage } from './page.ts';
import { lookupByUrl, saveLookup, undoLookup, type Lookup } from './store.ts';

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

/** The page's own canonical address if it's a plain one on the same site, as copies abound */
function canonicalOf(href: string | undefined, landed: URL) {
  if (!href) return normalise(landed);
  try {
    const canonical = checkAddress(new URL(href, landed));
    if (bare(canonical.hostname) === bare(landed.hostname)) return normalise(canonical);
  } catch {
    // a canonical we wouldn't fetch isn't one worth filing a result under
  }
  return normalise(landed);
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

const gate = () => env.GATE.getByName('line');

/** A recent result to send people to, or one still in the line even when they asked anyway */
async function reuse(lookup: Lookup | null, force: boolean) {
  if (!lookup || lookup.picker !== PICKER || Date.now() - lookup.checkedAt > STALE_MS) return;
  if (lookup.status === 'queued') return (await gate().place(lookup.id)) ? lookup.id : undefined;
  return force ? undefined : lookup.id;
}

async function queue(lookup: Lookup, who: string, previous: Lookup | null): Promise<Outcome> {
  try {
    await saveLookup(lookup);
  } catch (error) {
    // somebody else filed the same page a moment ago, so theirs it is
    const winner = lookup.url ? await lookupByUrl(lookup.url) : null;
    if (winner && winner.id !== lookup.id) return { id: winner.id };
    throw error;
  }
  if (lookup.status === 'done') return { id: lookup.id };
  const plan = { spans: lookup.spans, indexes: lookup.indexes };
  const ticket = { id: lookup.id, plan, cost: estimate(plan), kind: 'url' as const, who };
  const admission = await gate()
    .admit(ticket)
    .catch(async (error: unknown) => {
      await undoLookup(lookup, previous);
      throw error;
    });
  if (admission.ok) return { id: lookup.id };
  await undoLookup(lookup, previous);
  return { refused: admission };
}

const hashed = (texts: string[]): Promise<Span[]> =>
  Promise.all(texts.map(async (text) => ({ text, hash: await hashSpan(text) })));

/** Checks pasted text. Only its spans' hashes get saved, and the text leaves the line once counted */
export async function lookUpText(text: string, who: string): Promise<Outcome> {
  const spans = await hashed(pastedSpans(text));
  const ready = spans.length < 2;
  const lookup: Lookup = {
    id: newId(),
    kind: 'paste',
    url: null,
    title: null,
    published: null,
    lang: null,
    spans,
    indexes: ready ? [] : splitByDate(undefined, false).indexes,
    skipped: [],
    picker: PICKER,
    status: ready ? 'done' : 'queued',
    checkedAt: Date.now(),
    doneAt: ready ? Date.now() : null
  };
  return queue(lookup, who, null);
}

/** Finds a page's result, fetching and queueing it only when there isn't a recent one */
export async function lookUpUrl(input: string, who: string, force = false): Promise<Outcome> {
  const asked = normalise(checkAddress(input.trim()));
  const cached = await lookupByUrl(asked);
  const known = await reuse(cached, force);
  if (known) return { id: known };

  const { url: landed, html } = await fetchPage(asked);
  const page = readPage(html);
  const url = canonicalOf(page.canonical, landed);
  const previous = url === asked ? cached : await lookupByUrl(url);
  const filed = url === asked ? undefined : await reuse(previous, force);
  if (filed) return { id: filed };

  const spans = await hashed(page.spans);
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
