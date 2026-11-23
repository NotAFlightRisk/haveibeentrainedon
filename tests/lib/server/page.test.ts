import { describe, expect, it } from 'vitest';
import { readPage } from '#lib/server/page.ts';
import { toSpan } from '#lib/spans.ts';

const prose = (topic: string) =>
  `My ${topic} is the one thing in this house that never stops making a racket at night. ` +
  `I keep meaning to write a proper complaint about the ${topic} to whoever made it last year.`;

describe('readPage', () => {
  it("takes the author's paragraphs and leaves quotes, comments and footers alone", () => {
    const html = `<html lang="en-GB"><head><title>Noisy things</title></head><body>
      <article>
        <p>${prose('fridge')}</p>
        <blockquote><p>${prose('quoted kettle')}</p></blockquote>
        <p>${prose('boiler')}</p>
        <div class="comments"><p>${prose('commenter dog')}</p></div>
        <p>${prose('neighbour')}</p>
      </article>
      <footer><p>${prose('footer clock')}</p></footer>
    </body></html>`;
    const page = readPage(html);
    expect(page.title).toBe('Noisy things');
    expect(page.lang).toBe('en-gb');
    const text = page.spans.join(' ');
    for (const word of ['fridge', 'boiler', 'neighbour']) expect(text).toContain(word);
    for (const word of ['kettle', 'dog', 'clock']) expect(text).not.toContain(word);
  });

  it('falls back to <br> breaks for pages with no paragraphs at all', () => {
    const html = `<table><tr><td><font>${prose('fridge')}<br><br>${prose('boiler')}<br /><br />${prose('cat')}</font></td></tr></table>`;
    expect(readPage(html).spans.length).toBeGreaterThanOrEqual(3);
  });

  it('reads a full publish date from JSON-LD or article metadata, and ignores a bare year', () => {
    const ld = `<script type="application/ld+json">{"@graph":[{"datePublished":"2024-03-09T10:00:00Z"}]}</script>`;
    expect(readPage(ld).published).toBe('2024-03-09');
    const meta = '<meta property="article:published_time" content="2021-06-01T08:00:00+00:00">';
    expect(readPage(meta).published).toBe('2021-06-01');
    expect(
      readPage('<meta property="article:published_time" content="2021">').published
    ).toBeUndefined();
  });

  it('flags inline code so a sentence quoting it is never searched', () => {
    const html = `<p>${prose('fridge')} Running <code>make fridge</code> fixes everything in the house for a week or so.</p>`;
    expect(readPage(html).spans.join(' ')).not.toContain('Running');
  });

  it('prefers og:title and keeps the canonical link', () => {
    const html = `<head><title>Site | Post</title><meta property="og:title" content="Post"><link rel="canonical" href="https://example.com/post"></head>`;
    expect(readPage(html)).toMatchObject({ title: 'Post', canonical: 'https://example.com/post' });
  });

  it('turns each sentence into a span without its first word', () => {
    const page = readPage(`<p>${prose('fridge')}</p>`);
    expect(page.spans[0]).toBe(
      toSpan(`My fridge is the one thing in this house that never stops making a racket at night.`)
    );
  });
});
