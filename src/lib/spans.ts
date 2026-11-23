// brackets, code, markup and links make for spans that only ever match themselves
const NOISY = /[[\]{}<>|`$=@#\\]|https?:|www\.|\.(com|org|net|io)\b/i;
const OPENER = /^[A-Z]/;
const SENTENCE_END = /(?<=[.!?])["'”’)]?\s+(?=["'“‘(]?[A-Z])/;
const MAX_SPAN = 130;
export const PRIMARY = 3;
export const SPARES = 2;

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Sentences worth searching for: long, wordy and free of anything that isn't prose */
export function sentences(paragraphs: string[]) {
  const seen = new Set<string>();
  return paragraphs.flatMap((paragraph) => {
    const text = tidy(paragraph);
    if (text.length < 120) return [];
    return text.split(SENTENCE_END).filter((sentence) => {
      const fits = sentence.length >= 70 && sentence.length <= 220;
      const ok = fits && sentence.split(' ').length >= 12 && OPENER.test(sentence);
      if (!ok || NOISY.test(sentence) || seen.has(sentence)) return false;
      seen.add(sentence);
      return true;
    });
  });
}

/** Cut at a word to 130 characters and drop the first word, which the indexes miss at a paragraph's start */
export function toSpan(sentence: string) {
  let text = sentence.replace(/[.!?:;,"”’)]+$/, '');
  if (text.length > MAX_SPAN) text = text.slice(0, MAX_SPAN).replace(/\s+\S*$/, '');
  return text.split(' ').slice(1).join(' ');
}

const spread = (items: string[], count: number) => {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(step * i + step / 2)]);
};

/** Three spans spread through the text, then a couple of spares in case one turns out to be stock */
export function pickSpans(paragraphs: string[]) {
  const all = sentences(paragraphs);
  const primary = spread(all, PRIMARY);
  const spares = spread(
    all.filter((sentence) => !primary.includes(sentence)),
    SPARES
  );
  const picks = [...primary, ...spares].map(toSpan);
  return [...new Set(picks)].filter((span) => span.split(' ').length >= 10);
}

/** Pasted text's spans, picked the same way in the browser and on the server */
export const pastedSpans = (text: string) =>
  pickSpans(text.replace(/\r\n?/g, '\n').split(/\n\s*\n/));

export async function hashSpan(span: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(span));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
