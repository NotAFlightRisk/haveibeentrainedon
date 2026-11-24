import { describe, expect, it } from 'vitest';
import type { CellVerdict } from '#lib/server/result.ts';
import { headlineFor, ogImage } from '#lib/share.ts';

const sets = (...verdicts: CellVerdict[]) => verdicts.map((verdict) => ({ verdict }));
const finished = (...verdicts: CellVerdict[]) => ({
  thin: false,
  done: true,
  sets: sets(...verdicts)
});

describe('ogImage', () => {
  it('names the image after each set in order', () => {
    expect(ogImage(sets('match', 'none', 'new', 'none', 'match'))).toBe('/og/r/mntnm.png');
  });

  it.each(['pending', 'failed'] as const)(
    'falls back to the site image while a set is %s',
    (odd) => {
      expect(ogImage(sets('match', 'none', odd, 'none', 'match'))).toBe('/og.png');
    }
  );
});

describe('headlineFor', () => {
  it('counts only the sets old enough to hold the page', () => {
    expect(headlineFor(finished('match', 'none', 'new', 'none', 'match'))).toBe(
      'Text from this page is in 2 of the 4 sets old enough to hold it'
    );
  });

  it('talks about the one set when only one is old enough', () => {
    expect(headlineFor(finished('new', 'new', 'none', 'new', 'new'))).toBe(
      'No match for these sentences in the one set old enough to hold it'
    );
  });
});
