import { describe, expect, it } from 'vitest';
import { firstGood, holds, newerCrawls, pageFrom } from '#lib/server/captures.ts';

describe('newerCrawls', () => {
  it('keeps the crawls after the searchable text stops, oldest first, whatever turns up next', () => {
    const list = [
      { id: 'CC-MAIN-2027-05', name: 'January 2027 Index' },
      { id: 'CC-MAIN-2025-30', name: 'July 2025 Index' },
      { id: 'CC-MAIN-2025-33', name: 'August 2025 Index' }
    ];
    expect(newerCrawls(list)).toEqual([
      { id: 'CC-MAIN-2025-33', name: 'August 2025' },
      { id: 'CC-MAIN-2027-05', name: 'January 2027' }
    ]);
  });
});

describe('firstGood', () => {
  it('takes the first copy that loaded, skipping redirects', () => {
    const record = '"filename": "a.warc.gz", "offset": "10", "length": "20"';
    const lines = [
      `{"timestamp": "20260906111555", "status": "301", ${record}}`,
      `{"timestamp": "20260907080000", "status": "200", ${record}}`,
      ''
    ].join('\n');
    expect(firstGood(lines)).toEqual({
      day: '2026-09-07',
      filename: 'a.warc.gz',
      offset: '10',
      length: '20'
    });
  });

  it('has nothing when the crawl only holds redirects and errors', () => {
    expect(firstGood('{"timestamp": "20260906111555", "status": "404"}\n')).toBeUndefined();
  });
});

describe('holds', () => {
  it('counts the sentences a stored copy holds, however its markup and spacing fall', () => {
    const html = `<html><head><style>p { color: red }</style></head><body>
      <p>We   went to the <em>seaside</em> and it rained on every single one of the eleven days.</p>
      <script>var spans = "it rained on every single one";</script></body></html>`;
    const spans = ['went to the seaside and it rained', 'never went anywhere at all'];
    expect(holds(html, spans)).toBe(1);
  });
});

describe('pageFrom', () => {
  const warc = 'WARC/1.0\r\nWARC-Type: response\r\n\r\n';

  it('skips the WARC headers and the HTTP ones to reach the page', () => {
    const record = `${warc}HTTP/1.1 200 OK\r\nX-Crawler-Content-Encoding: gzip\r\n\r\n<p>hi</p>`;
    expect(pageFrom(record)).toBe('<p>hi</p>');
  });

  it("won't read a record that's cut short or still gzipped", () => {
    expect(() => pageFrom(warc)).toThrow();
    expect(() =>
      pageFrom(`${warc}HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n\x1f\x8b`)
    ).toThrow();
  });
});
