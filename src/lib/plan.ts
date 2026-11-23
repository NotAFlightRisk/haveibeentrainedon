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

/** Counts each candidate in January 2025's crawl until three aren't stock, using spares if it must */
export function screen(spans: Span[], counts: Counts) {
  const active: Span[] = [];
  for (const span of spans) {
    if (active.length === PRIMARY) break;
    const count = counts.get(key(SCREEN.index, span.hash));
    if (count === undefined) {
      return { active, next: { kind: 'count', index: SCREEN.index, span } satisfies Step };
    }
    if (count <= STOCK) active.push(span);
  }
  return { active };
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

/** Everything a lookup knows so far, and the one call that would tell it the most next */
export function evaluate(plan: Plan, counts: Counts, fetched: ReadonlySet<string> = new Set()) {
  if (!plan.indexes.length) return { active: [], thin: false, rows: [] as Row[] };
  const screened = screen(plan.spans, counts);
  if (screened.next) {
    const rows = plan.indexes.map((index): Row => ({ index, verdict: 'pending', hits: [] }));
    return { active: screened.active, thin: false, rows, next: screened.next as Step };
  }
  const { active } = screened;
  if (active.length < 2) return { active, thin: true, rows: [] as Row[] };
  const rows = plan.indexes.map((index) => decide(index, active, counts));
  const next =
    rows.find((row) => row.next)?.next ??
    rows.map((row) => docsStep(row, fetched)).find((step) => step);
  return { active, thin: false, rows, next };
}

/** Roughly how many calls a plan costs, for the line's sums */
export const estimate = (plan: Plan) =>
  plan.indexes.length ? 3 + 2 * plan.indexes.filter((i) => i !== SCREEN.index).length + 4 : 0;
