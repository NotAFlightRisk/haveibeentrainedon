import { env } from 'cloudflare:workers';
import { CRAWLS, SCREEN, SETS, TIMELINE, type Corpus } from '#lib/corpora.ts';
import { evaluate, key, STOCK, type Counts, type Row, type Span } from '#lib/plan.ts';
import { PRIMARY, ROUND } from '#lib/spans.ts';
import { unwrap } from '#lib/wayback.ts';
import { loadCaptures, type Capture } from './captures.ts';
import { bare } from './fetcher.ts';
import type { Place } from './gate.ts';
import type { Doc } from './infinigram.ts';
import { finishLookup, loadCounts, loadDocs, lookupById, type Lookup } from './store.ts';

const LOST_MS = 2 * 60_000;

export type CellVerdict = 'match' | 'none' | 'new' | 'pending' | 'failed';

export interface Copy {
  host: string;
  date?: string;
  both: boolean;
}

export type Where =
  | { kind: 'sites'; ready: boolean; own: 'both' | 'one' | 'neither'; mine?: Copy; others: Copy[] }
  | { kind: 'slice'; ready: boolean; parts: string[] }
  | { kind: 'unrecorded' };

export interface Cell {
  id: string;
  name: string;
  snapshot: string;
  models: string;
  note?: string;
  card: string;
  verdict: CellVerdict;
  counts: (number | null)[];
  /** Decided by the second round of sentences, after the first missed */
  second?: boolean;
  where?: Where;
}

export interface Result {
  id: string;
  kind: Lookup['kind'];
  url: string | null;
  title: string | null;
  published: string | null;
  english: boolean;
  checkedAt: number;
  done: boolean;
  spans: Span[];
  /** The second round's sentences, once a deeper look has picked them */
  second: Span[];
  /** Whether there are sentences left for a deeper look nobody's asked for yet */
  more: boolean;
  stock: number[];
  thin: boolean;
  sets: Cell[];
  crawls: Cell[];
  /** What Common Crawl's own index says about the page since July 2025, once somebody asks */
  captures: Capture[];
  place: Place | null;
}

function hostOf(url: string) {
  try {
    return bare(new URL(unwrap(url)?.original ?? url).hostname);
  } catch {
    return undefined;
  }
}

/** Joins two sentences' document lists by site, the sites holding both first */
function sites(lists: Doc[][], pageHost: string | undefined): Where {
  const byHost = new Map<string, { host: string; date?: string; seen: Set<number> }>();
  lists.forEach((docs, sentence) => {
    for (const doc of docs) {
      const host = doc.url && hostOf(doc.url);
      if (!host) continue;
      const entry = byHost.get(host) ?? { host, seen: new Set() };
      entry.seen.add(sentence);
      if (doc.date && (!entry.date || doc.date < entry.date)) entry.date = doc.date;
      byHost.set(host, entry);
    }
  });
  const copies = [...byHost.values()]
    .map(({ host, date, seen }): Copy => ({ host, date, both: lists.length > 1 && seen.size > 1 }))
    .sort((a, b) => Number(b.both) - Number(a.both));
  const mine = copies.find(({ host }) => host === pageHost);
  const own = !mine ? 'neither' : mine.both ? 'both' : 'one';
  const others = copies.filter((copy) => copy !== mine);
  return { kind: 'sites', ready: true, own, mine, others };
}

function where(
  corpus: Corpus,
  row: Row,
  docs: Map<string, Doc[]>,
  quick: boolean,
  pageHost?: string
): Where | undefined {
  if (row.verdict !== 'match' || !corpus.sources) return;
  if (corpus.sources === 'part') return { kind: 'unrecorded' };
  const wanted = row.hits.slice(0, corpus.sources === 'slice' ? 1 : 2);
  const lists = wanted.map(({ hash }) => docs.get(key(corpus.index, hash)));
  const ready = lists.every(Boolean);
  if (!ready && quick) return;
  if (corpus.sources === 'slice') {
    const parts = [...new Set(lists.flat().flatMap((doc) => (doc?.part ? [doc.part] : [])))];
    return { kind: 'slice', ready, parts };
  }
  return ready
    ? sites(lists as Doc[][], pageHost)
    : { kind: 'sites', ready, own: 'neither', others: [] };
}

interface Known {
  lookup: Lookup;
  rows: Row[];
  active: Span[];
  second: Span[];
  counts: Counts;
  docs: Map<string, Doc[]>;
  done: boolean;
}

function cell(corpus: Corpus, known: Known): Cell {
  const { lookup, rows, counts, docs, done } = known;
  const { id, name, snapshot, models, note, card } = corpus;
  const base = { id, name, snapshot, models, note, card };
  const row = rows.find((candidate) => candidate.index === corpus.index);
  const spans = row?.second ? known.second : known.active;
  const shown = spans.map(({ hash }) => counts.get(key(corpus.index, hash)) ?? null);
  if (!row && lookup.skipped.includes(corpus.index)) return { ...base, verdict: 'new', counts: [] };
  if (!row) return { ...base, verdict: 'pending', counts: shown };
  const verdict =
    row.verdict === 'failed' || (row.verdict === 'pending' && done) ? 'failed' : row.verdict;
  const pageHost = lookup.url ? hostOf(lookup.url) : undefined;
  const matched = where(corpus, row, docs, lookup.quick, pageHost);
  return { ...base, verdict, counts: shown, second: row.second, where: matched };
}

/** Everything the result page and its JSON show, worked out from what's been counted so far */
export async function loadResult(id: string): Promise<Result | null> {
  const lookup = await lookupById(id);
  if (!lookup) return null;
  const hashes = lookup.spans.map(({ hash }) => hash);
  const [counts, docs, captures] = await Promise.all([
    loadCounts(hashes),
    loadDocs(hashes),
    lookup.url ? loadCaptures(unwrap(lookup.url)?.original ?? lookup.url) : []
  ]);
  const { spans, indexes, quick, deeper } = lookup;
  const plan = { spans, indexes, quick, deeper };
  const { active, second, screening, thin, rows } = evaluate(plan, counts, new Set(docs.keys()));
  const place = lookup.status === 'done' ? null : await env.GATE.getByName('line').place(id);
  // a check the line has lost (it gave up on it, say) is as done as it's ever going to be
  const lost = lookup.status === 'queued' && !place && Date.now() - lookup.checkedAt > LOST_MS;
  if (lost) await finishLookup(id);
  const done = lookup.status === 'done' || lost;
  const stock = lookup.spans
    .map(({ hash }) => counts.get(key(SCREEN.index, hash)) ?? 0)
    .filter((count) => count > STOCK);
  const known = { lookup, rows, active, second, counts, docs, done };
  const toCell = (corpus: Corpus) => cell(corpus, known);
  const asked = new Set([...lookup.indexes, ...lookup.skipped]);
  return {
    id: lookup.id,
    kind: lookup.kind,
    url: lookup.url,
    title: lookup.title,
    published: lookup.published,
    english: !lookup.lang || lookup.lang.startsWith('en'),
    checkedAt: lookup.checkedAt,
    done,
    spans: screening || !active.length ? lookup.spans.slice(0, PRIMARY) : active,
    second,
    more: lookup.kind === 'url' && !deeper && spans.slice(ROUND).length >= 2,
    stock,
    thin: thin || lookup.spans.length < 2,
    sets: SETS.map(toCell),
    crawls: CRAWLS.filter((crawl) => TIMELINE.includes(crawl) || asked.has(crawl.index)).map(
      toCell
    ),
    captures,
    place
  };
}
