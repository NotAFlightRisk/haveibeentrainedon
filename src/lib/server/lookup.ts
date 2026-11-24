import { env, waitUntil } from 'cloudflare:workers';
import { BETWEEN, QUICK, SETS, TIMELINE } from '#lib/corpora.ts';
import { estimate, type Span } from '#lib/plan.ts';
import { hashSpan, pastedSpans, PRIMARY, ROUND } from '#lib/spans.ts';
import { bare, checkAddress, fetchPage } from './fetcher.ts';
import type { Admission, Kind } from './gate.ts';
import { readPage } from './page.ts';
import { report } from './report.ts';
import { lookupByUrl, saveLookup, undoLookup, type Lookup } from './store.ts';

/** Bumped whenever the picker changes, so old verdicts get counted afresh */
export const PICKER = 2;
export const STALE_MS = 30 * 24 * 60 * 60_000;
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi)$/i;

export type Refusal = Extract<Admission, { ok: false }>;
export type Outcome = { id: string } | { refused: Refusal };

export function normalise(input: URL) {
  const url = new URL(input);
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.test(name)) url.searchParams.delete(name);
  }
  return url.href;
}

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

/** What a check can ask for beyond the usual */
export interface Ask {
  /** Sets a dated page is too new for */
  force?: boolean;
  /** The crawls between January and July */
  between?: boolean;
  /** A second round of sentences wherever the first missed */
  deeper?: boolean;
  /** Just a domain sample's look */
  quick?: boolean;
}

/** Sets a dated page can't be in are "too new" without asking, unless someone asks anyway */
export function splitByDate(published: string | undefined, { force, between, quick }: Ask = {}) {
  const wanted = quick ? QUICK : [...SETS, ...TIMELINE, ...(between ? BETWEEN : [])];
  const tooNew = (newest: string) => !force && !!published && published > newest;
  return {
    indexes: wanted.filter((corpus) => !tooNew(corpus.newest)).map((corpus) => corpus.index),
    skipped: wanted.filter((corpus) => tooNew(corpus.newest)).map((corpus) => corpus.index)
  };
}

/** A check answers the ask when it already counted, or is counting, everything the ask wants */
const covers = (lookup: Lookup, ask: Ask) =>
  lookup.spans.length < 2 ||
  ((ask.quick || !lookup.quick) &&
    (!ask.deeper || lookup.deeper || lookup.spans.slice(ROUND).length < 2) &&
    splitByDate(lookup.published ?? undefined, ask).indexes.every((index) =>
      lookup.indexes.includes(index)
    ));

export const newId = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
    .replaceAll('+', '-')
    .replaceAll('/', '_');

const gate = () => env.GATE.getByName('line');

/** A recent result that answers the ask, unless the line has lost it */
async function reuse(lookup: Lookup | null, ask: Ask) {
  if (!lookup || lookup.picker !== PICKER || Date.now() - lookup.checkedAt > STALE_MS) return;
  if (!covers(lookup, ask)) return;
  if (lookup.status === 'queued') return (await gate().place(lookup.id)) ? lookup.id : undefined;
  return lookup.id;
}

/** A check to file: one we've already got, or a lookup to save and count */
export type Prepared = { id: string } | { lookup: Lookup; previous: Lookup | null };

/** Somebody else filed the same page a moment before us */
class Raced extends Error {}

async function save({ lookup, previous }: { lookup: Lookup; previous: Lookup | null }) {
  try {
    await saveLookup(lookup);
  } catch (error) {
    if (!previous && lookup.url && (await lookupByUrl(lookup.url))) throw new Raced();
    throw error;
  }
}

/** Saves the checks and puts the ones with counting to do in the line as one ticket */
export async function file(
  items: Prepared[],
  kind: Kind,
  who: string
): Promise<{ ids: string[] } | { refused: Refusal }> {
  const saved: Extract<Prepared, { lookup: Lookup }>[] = [];
  // a failed undo mustn't hide whatever went wrong first
  const undo = () =>
    Promise.allSettled(saved.map(({ lookup, previous }) => undoLookup(lookup, previous)));
  const ids = items.map((item) => ('id' in item ? item.id : item.lookup.id));
  try {
    for (const item of items) {
      if ('id' in item) continue;
      await save(item);
      saved.push(item);
    }
    const checks = saved
      .filter(({ lookup }) => lookup.status === 'queued')
      .map(({ lookup: { id, spans, indexes, quick, deeper } }) => {
        const plan = { spans, indexes, quick, deeper };
        return { id, plan, cost: estimate(plan) };
      });
    const admission: Admission = checks.length
      ? await gate().admit({ kind, who, checks })
      : { ok: true };
    if (admission.ok) return { ids };
    await undo();
    return { refused: admission };
  } catch (error) {
    await undo();
    throw error;
  }
}

/** Tries once more when another check filed the same page first, as its row's there to find now */
export async function retryingRaces<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Raced) return work();
    throw error;
  }
}

const hashed = (texts: string[]): Promise<Span[]> =>
  Promise.all(texts.map(async (text) => ({ text, hash: await hashSpan(text) })));

/** Fetches and reads a page, unless there's already a result that answers the ask */
export async function prepare(input: string, ask: Ask = {}): Promise<Prepared> {
  const asked = normalise(checkAddress(input.trim()));
  const cached = await lookupByUrl(asked);
  const known = await reuse(cached, ask);
  if (known) return { id: known };

  const { url: landed, body } = await fetchPage(asked);
  const page = readPage(body);
  const url = canonicalOf(page.canonical, landed);
  const previous = url === asked ? cached : await lookupByUrl(url);
  const filed = url === asked ? undefined : await reuse(previous, ask);
  if (filed) return { id: filed };

  const spans = await hashed(page.spans);
  if (spans.length < PRIMARY && !ask.quick) {
    // odd markup the picker can't read shows up here, minus any query string that might be private
    const { origin, pathname } = new URL(url);
    const thin = new Error(
      `The picker found ${spans.length} of 3 sentences on ${origin}${pathname}`
    );
    waitUntil(report(Object.assign(thin, { name: 'ThinPage' }), undefined, 'picker', 'warning'));
  }
  const split = splitByDate(page.published, ask);
  // anything an earlier check counted stays in, so asking for the months doesn't lose a forced set
  const indexes = [...new Set([...(previous?.indexes ?? []), ...split.indexes])];
  const skipped = split.skipped.filter((index) => !indexes.includes(index));
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
    quick: !!ask.quick && (previous?.quick ?? true),
    deeper: !!ask.deeper || !!previous?.deeper,
    picker: PICKER,
    status: ready ? 'done' : 'queued',
    checkedAt: Date.now(),
    doneAt: ready ? Date.now() : null,
    rev: newId()
  };
  return { lookup, previous };
}

const single = (filed: Awaited<ReturnType<typeof file>>): Outcome =>
  'ids' in filed ? { id: filed.ids[0] } : filed;

/** Finds a page's result, fetching and queueing it only when there isn't a recent one */
export const lookUpUrl = (input: string, who: string, ask: Ask = {}) =>
  retryingRaces(async () => single(await file([await prepare(input, ask)], 'url', who)));

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
    indexes: ready ? [] : splitByDate(undefined).indexes,
    skipped: [],
    quick: false,
    deeper: false,
    picker: PICKER,
    status: ready ? 'done' : 'queued',
    checkedAt: Date.now(),
    doneAt: ready ? Date.now() : null,
    rev: newId()
  };
  return single(await file([{ lookup, previous: null }], 'url', who));
}
