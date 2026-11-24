import { describe, expect, it } from 'vitest';
import { SCREEN, SETS } from '#lib/corpora.ts';
import {
  decide,
  docsStep,
  estimate,
  evaluate,
  FAILED,
  key,
  screen,
  STOCK,
  type Span
} from '#lib/plan.ts';

const spans: Span[] = ['a', 'b', 'c', 'd', 'e'].map((hash) => ({ hash, text: `span ${hash}` }));
const [c4, pile, rpj] = SETS.map((set) => set.index);
const counts = (entries: [string, string, number][]) =>
  new Map(entries.map(([index, hash, count]) => [key(index, hash), count]));
const screened = (...values: number[]) =>
  values.map((count, i): [string, string, number] => [SCREEN.index, spans[i].hash, count]);

describe('screen', () => {
  it('counts the first span in the January crawl before anything else', () => {
    expect(screen(spans, new Map()).next).toEqual({
      kind: 'count',
      index: SCREEN.index,
      span: spans[0]
    });
  });

  it('swaps a stock span for the next spare', () => {
    const result = screen(spans, counts(screened(3, STOCK + 1, 0, 1)));
    expect(result.next).toBeUndefined();
    expect(result.active.map(({ hash }) => hash)).toEqual(['a', 'c', 'd']);
  });

  it("prefers a screened spare to a span the crawl wouldn't count, and falls back to it", () => {
    const spared = screen(spans, counts(screened(FAILED, 3, 0, 1)));
    expect(spared.active.map(({ hash }) => hash)).toEqual(['b', 'c', 'd']);
    const fallback = screen(spans, counts(screened(FAILED, 3, 0, 900, 900)));
    expect(fallback.active.map(({ hash }) => hash)).toEqual(['a', 'b', 'c']);
  });

  it('settles for two spans when the spares are stock too', () => {
    const result = screen(spans, counts(screened(1, 900, 900, 2, 900)));
    expect(result.active.map(({ hash }) => hash)).toEqual(['a', 'd']);
  });
});

describe('decide', () => {
  const active = spans.slice(0, 3);

  it("doesn't count the third span when the first two agree", () => {
    expect(
      decide(
        c4,
        active,
        counts([
          [c4, 'a', 2],
          [c4, 'b', 5]
        ])
      ).verdict
    ).toBe('match');
    expect(
      decide(
        c4,
        active,
        counts([
          [c4, 'a', 0],
          [c4, 'b', 0]
        ])
      ).verdict
    ).toBe('none');
  });

  it('asks for the third span when the first two split, and lets it decide', () => {
    const split = counts([
      [c4, 'a', 4],
      [c4, 'b', 0]
    ]);
    expect(decide(c4, active, split).next?.span).toEqual(active[2]);
    expect(decide(c4, active, new Map([...split, [key(c4, 'c'), 1]])).verdict).toBe('match');
    expect(decide(c4, active, new Map([...split, [key(c4, 'c'), 0]])).verdict).toBe('none');
  });

  it('wants both spans to hit when there are only two', () => {
    expect(
      decide(
        c4,
        active.slice(0, 2),
        counts([
          [c4, 'a', 4],
          [c4, 'b', 0]
        ])
      ).verdict
    ).toBe('none');
  });

  it('says it failed only when a failed count could have changed the answer', () => {
    const failedFirst = counts([
      [c4, 'a', FAILED],
      [c4, 'b', 3],
      [c4, 'c', 0]
    ]);
    expect(decide(c4, active, failedFirst).verdict).toBe('failed');
    const settled = counts([
      [c4, 'a', FAILED],
      [c4, 'b', 0],
      [c4, 'c', 0]
    ]);
    expect(decide(c4, active, settled).verdict).toBe('none');
  });
});

describe('evaluate', () => {
  const plan = { spans, indexes: [c4, pile, SCREEN.index] };

  it('fills rows in order, reusing the screen for the January crawl', () => {
    const known = counts([...screened(1, 2, 0), [c4, 'a', 1], [c4, 'b', 1]]);
    const { rows, next } = evaluate(plan, known);
    expect(rows.map((row) => row.verdict)).toEqual(['match', 'pending', 'match']);
    expect(next).toMatchObject({ kind: 'count', index: pile, span: spans[0] });
  });

  it('fetches documents for matches in sets that keep addresses, once counting is done', () => {
    const known = counts([
      ...screened(1, 2, 0),
      [c4, 'a', 1],
      [c4, 'b', 1],
      [pile, 'a', 0],
      [pile, 'b', 0]
    ]);
    expect(evaluate(plan, known).next).toEqual({ kind: 'docs', index: c4, span: spans[0] });
    const fetched = new Set([key(c4, 'a'), key(c4, 'b')]);
    expect(evaluate(plan, known, fetched).next).toBeUndefined();
  });

  it('calls a page thin when fewer than two spans survive the screen', () => {
    const result = evaluate(plan, counts(screened(900, 900, 0, 900, 900)));
    expect(result.thin).toBe(true);
    expect(result.next).toBeUndefined();
  });

  it('has nothing to do when every set is too new', () => {
    expect(evaluate({ spans, indexes: [] }, new Map()).next).toBeUndefined();
  });

  it("doesn't go looking for documents on a domain sample's quick look", () => {
    const known = counts([...screened(1, 2, 0), [c4, 'a', 1], [c4, 'b', 1]]);
    expect(evaluate({ spans, indexes: [c4], quick: true }, known).next).toBeUndefined();
  });
});

describe('a deeper look', () => {
  const deep: Span[] = [...'abcdefghij'].map((hash) => ({ hash, text: `span ${hash}` }));
  const plan = { spans: deep, indexes: [c4, pile], deeper: true };
  const firstRound = counts([
    ...[0, 1, 2].map((i): [string, string, number] => [SCREEN.index, deep[i].hash, 1]),
    [c4, 'a', 0],
    [c4, 'b', 0],
    [pile, 'a', 2],
    [pile, 'b', 1]
  ]);

  it('screens the next round of sentences once a set has missed', () => {
    const { rows, next } = evaluate(plan, firstRound);
    expect(next).toEqual({ kind: 'count', index: SCREEN.index, span: deep[5] });
    expect(rows.map((row) => row.verdict)).toEqual(['pending', 'match']);
  });

  it('lets the second round decide a miss by the same two-of-three rule', () => {
    const known = new Map([
      ...firstRound,
      ...[5, 6, 7].map((i): [string, number] => [key(SCREEN.index, deep[i].hash), 1]),
      [key(c4, 'f'), 3],
      [key(c4, 'g'), 2]
    ]);
    const { rows, second } = evaluate(plan, known);
    expect(rows[0]).toMatchObject({ verdict: 'match', second: true });
    expect(rows[1].second).toBeUndefined();
    expect(second.map(({ hash }) => hash)).toEqual(['f', 'g', 'h']);
  });

  it('keeps the miss when there are no more sentences to try', () => {
    const { rows, next } = evaluate({ ...plan, spans: deep.slice(0, 5) }, firstRound);
    expect(rows[0].verdict).toBe('none');
    expect(next).toBeUndefined();
  });
});

describe('estimate', () => {
  it('covers the screen, two or three counts a set and every list of documents', () => {
    const everything = [...SETS.map((set) => set.index), SCREEN.index, 'v2_cc-2025-30'];
    expect(estimate({ spans, indexes: everything })).toBe(3 + 15 + 7);
    expect(estimate({ spans, indexes: [] })).toBe(0);
  });

  it('skips the documents on a quick look and doubles the counting for a deeper one', () => {
    const quick = [SETS[3].index, SETS[4].index, SCREEN.index];
    expect(estimate({ spans, indexes: quick, quick: true })).toBe(3 + 5);
    expect(estimate({ spans, indexes: [c4], deeper: true })).toBe(11 + 2);
  });
});

describe('docsStep', () => {
  it('only wants one document list from RedPajama, which names a slice rather than a site', () => {
    const row = { index: rpj, verdict: 'match' as const, hits: spans.slice(0, 2) };
    expect(docsStep(row, new Set([key(rpj, 'a')]))).toBeUndefined();
  });

  it('never asks the Pile, which keeps no sources', () => {
    expect(
      docsStep({ index: pile, verdict: 'match', hits: spans.slice(0, 2) }, new Set())
    ).toBeUndefined();
  });
});
