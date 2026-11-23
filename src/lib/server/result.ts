import { env } from 'cloudflare:workers';
import { CRAWLS, SCREEN, SETS, TIMELINE, type Corpus } from '#lib/corpora.ts';
import { evaluate, key, STOCK, type Counts, type Row, type Span } from '#lib/plan.ts';
import { PRIMARY } from '#lib/spans.ts';
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
  stock: number[];
  thin: boolean;
  sets: Cell[];
  crawls: Cell[];
  place: Place | null;
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

function hostOf(url: string) {
  try {
    return bare(new URL(url).hostname);
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
  pageHost?: string
): Where | undefined {
  if (row.verdict !== 'match' || !corpus.sources) return;
  if (corpus.sources === 'part') return { kind: 'unrecorded' };
  const wanted = row.hits.slice(0, corpus.sources === 'slice' ? 1 : 2);
  const lists = wanted.map(({ hash }) => docs.get(key(corpus.index, hash)));
  const ready = lists.every(Boolean);
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
  counts: Counts;
  docs: Map<string, Doc[]>;
  done: boolean;
}

function cell(corpus: Corpus, { lookup, rows, active, counts, docs, done }: Known): Cell {
  const { id, name, snapshot, models, note, card } = corpus;
  const base = { id, name, snapshot, models, note, card };
  const shown = active.map(({ hash }) => counts.get(key(corpus.index, hash)) ?? null);
  if (lookup.skipped.includes(corpus.index)) return { ...base, verdict: 'new', counts: [] };
  const row = rows.find((candidate) => candidate.index === corpus.index);
  if (!row) return { ...base, verdict: 'pending', counts: shown };
  const verdict =
    row.verdict === 'failed' || (row.verdict === 'pending' && done) ? 'failed' : row.verdict;
  const pageHost = lookup.url ? hostOf(lookup.url) : undefined;
  return { ...base, verdict, counts: shown, where: where(corpus, row, docs, pageHost) };
}

/** Everything the result page and its JSON show, worked out from what's been counted so far */
export async function loadResult(id: string): Promise<Result | null> {
  const lookup = await lookupById(id);
  if (!lookup) return null;
  const hashes = lookup.spans.map(({ hash }) => hash);
  const [counts, docs] = await Promise.all([loadCounts(hashes), loadDocs(hashes)]);
  const plan = { spans: lookup.spans, indexes: lookup.indexes };
  const { active, screening, thin, rows } = evaluate(plan, counts, new Set(docs.keys()));
  const place = lookup.status === 'done' ? null : await env.GATE.getByName('line').place(id);
  // a check the line has lost (it gave up on it, say) is as done as it's ever going to be
  const lost = lookup.status === 'queued' && !place && Date.now() - lookup.checkedAt > LOST_MS;
  if (lost) await finishLookup(id);
  const done = lookup.status === 'done' || lost;
  const stock = lookup.spans
    .map(({ hash }) => counts.get(key(SCREEN.index, hash)) ?? 0)
    .filter((count) => count > STOCK);
  const toCell = (corpus: Corpus) => cell(corpus, { lookup, rows, active, counts, docs, done });
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
    stock,
    thin: thin || lookup.spans.length < 2,
    sets: SETS.map(toCell),
    crawls: CRAWLS.filter((crawl) => TIMELINE.includes(crawl) || asked.has(crawl.index)).map(
      toCell
    ),
    place
  };
}
