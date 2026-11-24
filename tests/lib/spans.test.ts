import { describe, expect, it } from 'vitest';
import { pastedSpans, pickSpans, sentences, toSpan } from '#lib/spans.ts';

const sentence = (n: number) =>
  `Sentence number ${n} wanders on about gardening and the weather for long enough to count as prose here.`;
const paragraph = (...ns: number[]) => ns.map(sentence).join(' ');

describe('sentences', () => {
  it('keeps long wordy sentences from long paragraphs', () => {
    expect(sentences([paragraph(1, 2)])).toEqual([sentence(1), sentence(2)]);
  });

  it('skips short paragraphs, links, code and anything in brackets', () => {
    const noisy = [
      'Too short to bother with.',
      `${sentence(1)} See https://example.com for the rest of the story about the garden today.`,
      `${sentence(2)} Then run the \`make\` target and watch it build the whole tree for you.`,
      `${sentence(3)} It all went fine [citation needed] after a few weeks of rain and sun and wind.`
    ];
    expect(sentences(noisy)).toEqual([sentence(1), sentence(2), sentence(3)]);
  });

  it('drops a sentence the page repeats', () => {
    expect(sentences([paragraph(1, 1, 2)])).toEqual([sentence(1), sentence(2)]);
  });
});

describe('toSpan', () => {
  it('drops the first word and trailing punctuation', () => {
    expect(toSpan('The cat sat on the mat for a very long while indeed.')).toBe(
      'cat sat on the mat for a very long while indeed'
    );
  });

  it('cuts at a word boundary within 130 characters', () => {
    const span = toSpan(`Opening ${'word '.repeat(40)}end.`);
    expect(span.length).toBeLessThanOrEqual(130);
    expect(span.endsWith('word')).toBe(true);
  });
});

describe('pickSpans', () => {
  it('spreads three spans through the page and two spares, then a second round of the rest', () => {
    const spans = pickSpans([paragraph(1, 2, 3, 4, 5, 6, 7, 8, 9)]);
    expect(spans.slice(0, 3)).toEqual([2, 5, 8].map((n) => toSpan(sentence(n))));
    expect(new Set(spans).size).toBe(9);
  });

  it('gives what it can when the page is short', () => {
    expect(pickSpans([paragraph(1, 2)])).toHaveLength(2);
  });
});

describe('pastedSpans', () => {
  it("picks the same spans from the browser's line breaks as from the form's", () => {
    const text = [paragraph(1, 2, 3), paragraph(4, 5, 6)].join('\n\n');
    expect(pastedSpans(text).length).toBeGreaterThanOrEqual(3);
    expect(pastedSpans(text.replaceAll('\n', '\r\n'))).toEqual(pastedSpans(text));
  });
});
