import { describe, expect, it } from 'vitest';
import { SCREEN, SETS } from '#lib/corpora.ts';
import { decide, docsStep, evaluate, FAILED, key, screen, STOCK, type Span } from '#lib/plan.ts';

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
