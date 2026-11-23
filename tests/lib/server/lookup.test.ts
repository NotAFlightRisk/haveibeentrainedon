import { describe, expect, it } from 'vitest';
import { BETWEEN, SETS, TIMELINE } from '#lib/corpora.ts';
import { normalise, splitByDate } from '#lib/server/lookup.ts';

describe('normalise', () => {
  it('drops the fragment and tracking parameters but keeps the rest of the query', () => {
    const url = new URL('https://Example.com/post?id=7&utm_source=x&fbclid=y&gclid=z#comments');
    expect(normalise(url)).toBe('https://example.com/post?id=7');
  });
});

describe('splitByDate', () => {
  const all = [...SETS, ...TIMELINE].map((corpus) => corpus.index);

  it('checks everything when there is no full publish date', () => {
    expect(splitByDate(undefined)).toEqual({ indexes: all, skipped: [] });
  });

  it('skips the sets that stopped before the page was published', () => {
    const { indexes, skipped } = splitByDate('2023-01-15');
    expect(skipped).toEqual(['v4_c4train_llama', 'v4_piletrain_llama', 'v4_dclm-baseline_llama']);
    expect(indexes).toContain('v4_dolma-v1_7_llama');
  });

  it('answers a post from after July 2025 without a single call', () => {
    expect(splitByDate('2025-09-01').indexes).toEqual([]);
  });

  it('checks anyway when asked to', () => {
    expect(splitByDate('2025-09-01', { force: true }).indexes).toEqual(all);
  });

  it('adds the months between, minus any the page is too new for', () => {
    const { indexes, skipped } = splitByDate('2025-03-15', { between: true });
    expect(indexes).toEqual(['v2_cc-2025-30', ...BETWEEN.slice(1).map((crawl) => crawl.index)]);
    expect(skipped).toContain(BETWEEN[0].index);
  });
});
