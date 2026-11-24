import { describe, expect, it } from 'vitest';
import { snapshot, unwrap } from '#lib/wayback.ts';

describe('unwrap', () => {
  it('finds the page and the day inside a Wayback Machine address', () => {
    const url =
      'https://web.archive.org/web/20190103112649id_/http://www.paulgraham.com/start.html';
    expect(unwrap(url)).toEqual({
      original: 'http://www.paulgraham.com/start.html',
      day: '2019-01-03'
    });
  });

  it('leaves an ordinary address alone', () => {
    expect(unwrap('https://example.com/web/2019/post')).toBeUndefined();
  });
});

describe('snapshot', () => {
  it('asks for the raw copy nearest the day', () => {
    expect(snapshot('https://example.com/post', '2023-10-31')).toBe(
      'https://web.archive.org/web/20231031id_/https://example.com/post'
    );
  });
});
