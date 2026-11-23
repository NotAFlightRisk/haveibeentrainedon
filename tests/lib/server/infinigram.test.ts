import { describe, expect, it } from 'vitest';
import { readDoc, slice } from '#lib/server/infinigram.ts';

describe('readDoc', () => {
  it('finds the address and crawl date wherever an index nests them', () => {
    const c4 =
      '{"path":"c4-train.json.gz","metadata":{"timestamp":"2019-04-24T10:30:15Z","url":"http://ghgd.info/a.html"}}\n';
    expect(readDoc(c4, 'urls')).toEqual({ url: 'http://ghgd.info/a.html', date: '2019-04-24' });
    const dolma =
      '{"path":"falcon.json.gz","metadata":{"added":"2023-05-28T12:37:09Z","created":"2018-06-17T23:57:28Z","metadata":{"url":"http://b.info/c.html"}}}';
    expect(readDoc(dolma, 'urls')).toEqual({ url: 'http://b.info/c.html', date: '2018-06-17' });
    const dclm =
      '{"metadata":{"id":"https://d.net/e","metadata":{"WARC-Date":"2019-06-25T14:09:42Z","url":"https://d.net/e"}}}';
    expect(readDoc(dclm, 'urls')).toEqual({ url: 'https://d.net/e', date: '2019-06-25' });
  });

  it("names RedPajama's slice from the file path", () => {
    const rpj = '{"path":"common_crawl/2021-04/en_head_0037.json.gz.dedup.classifier.jsonl.zst"}';
    expect(readDoc(rpj, 'slice')).toEqual({ part: 'Common Crawl 2021-04' });
    expect(slice('arxiv/arxiv_0001.jsonl')).toBe('arXiv');
  });
});
