import { SCREEN, byIndex } from '#lib/corpora.ts';
import { PRIMARY } from '#lib/spans.ts';

/** More matches than this in a whole month's crawl is stock text, not anybody's own writing */
export const STOCK = 200;
/** What the gate writes for a count the corpus host wouldn't give us */
export const FAILED = -1;

export interface Span {
  hash: string;
  text?: string;
}

export type Counts = ReadonlyMap<string, number>;
export type Verdict = 'match' | 'none' | 'pending' | 'failed';

export interface Step {
  kind: 'count' | 'docs';
  index: string;
  span: Span;
}

export interface Row {
  index: string;
  verdict: Verdict;
  hits: Span[];
  next?: Step;
}

export interface Plan {
  spans: Span[];
  indexes: string[];
}

export const key = (index: string, hash: string) => `${index} ${hash}`;

/**
 * Counts each candidate in January 2025's crawl until three aren't stock, using spares if it
 * must. One the crawl wouldn't count only gets in when the spares have run out
 */
export function screen(spans: Span[], counts: Counts) {
  const active: Span[] = [];
  const unchecked: Span[] = [];
  for (const span of spans) {
    if (active.length === PRIMARY) break;
    const count = counts.get(key(SCREEN.index, span.hash));
    if (count === undefined) {
      return { active, next: { kind: 'count', index: SCREEN.index, span } satisfies Step };
    }
    if (count === FAILED) unchecked.push(span);
    else if (count <= STOCK) active.push(span);
  }
  const order = (span: Span) => spans.indexOf(span);
  const filled = [...active, ...unchecked.slice(0, PRIMARY - active.length)];
  return { active: filled.sort((a, b) => order(a) - order(b)) };
}

/** Two of three spans is a match, so the third only gets counted when the first two disagree */
export function decide(index: string, active: Span[], counts: Counts): Row {
  const hits: Span[] = [];
  let failed = 0;
  for (const [position, span] of active.entries()) {
    const couldStillMatch = hits.length + failed + active.length - position >= 2;
    if (hits.length >= 2 || !couldStillMatch) break;
    const count = counts.get(key(index, span.hash));
    if (count === undefined) {
      return { index, verdict: 'pending', hits, next: { kind: 'count', index, span } };
    }
    if (count === FAILED) failed++;
    else if (count > 0) hits.push(span);
  }
  if (hits.length >= 2) return { index, verdict: 'match', hits };
  return { index, verdict: failed && hits.length + failed >= 2 ? 'failed' : 'none', hits };
}

/** The matched documents worth listing: two spans' worth where a set keeps addresses */
export function docsStep(row: Row, fetched: ReadonlySet<string>): Step | undefined {
  const sources = byIndex(row.index)?.sources;
  if (row.verdict !== 'match' || !sources || sources === 'part') return;
  const wanted = row.hits.slice(0, sources === 'slice' ? 1 : 2);
  const span = wanted.find(({ hash }) => !fetched.has(key(row.index, hash)));
  return span && { kind: 'docs', index: row.index, span };
}

export interface Evaluation {
  active: Span[];
  screening: boolean;
  thin: boolean;
  rows: Row[];
  next?: Step;
}

/** Everything a lookup knows so far, and the one call that would tell it the most next */
export function evaluate(
  plan: Plan,
  counts: Counts,
  fetched: ReadonlySet<string> = new Set()
): Evaluation {
  const nothing: Evaluation = { active: [], screening: false, thin: false, rows: [] };
  if (!plan.indexes.length) return nothing;
  const screened = screen(plan.spans, counts);
  if (screened.next) {
    const rows = plan.indexes.map((index): Row => ({ index, verdict: 'pending', hits: [] }));
    return { ...nothing, active: screened.active, screening: true, rows, next: screened.next };
  }
  const { active } = screened;
  if (active.length < 2) return { ...nothing, active, thin: true };
  const rows = plan.indexes.map((index) => decide(index, active, counts));
  const next =
    rows.find((row) => row.next)?.next ??
    rows.map((row) => docsStep(row, fetched)).find((step) => step);
  return { ...nothing, active, rows, next };
}

const DOCS_CALLS = { urls: 2, slice: 1, part: 0 };

/** A cautious guess at a plan's calls: the screen, two or three counts a set, every list of documents */
export function estimate(plan: Plan) {
  if (!plan.indexes.length) return 0;
  const counted = plan.indexes.filter((index) => index !== SCREEN.index);
  const docs = counted.reduce((sum, index) => {
    const sources = byIndex(index)?.sources;
    return sum + (sources ? DOCS_CALLS[sources] : 0);
  }, 0);
  return Math.ceil(PRIMARY + 2.5 * counted.length + docs);
}
