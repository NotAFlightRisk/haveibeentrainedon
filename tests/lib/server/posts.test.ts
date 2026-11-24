import { describe, expect, it } from 'vitest';
import { feedOf, isPost, onSite, readListing } from '#lib/server/posts.ts';

describe('readListing', () => {
  it('reads a sitemap with its dates', () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://blog.example.com/2019/05/a-post/</loc><lastmod>2019-05-02T10:00:00+01:00</lastmod></url>
      <url><loc> https://blog.example.com/about </loc></url></urlset>`;
    expect(readListing(xml)).toEqual({
      posts: [
        { url: 'https://blog.example.com/2019/05/a-post/', date: '2019-05-02' },
        { url: 'https://blog.example.com/about', date: undefined }
      ],
      sitemaps: []
    });
  });

  it('lists the sitemaps a sitemap index points at', () => {
    const xml = `<sitemapindex><sitemap><loc>https://blog.example.com/post-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://blog.example.com/page-sitemap.xml</loc></sitemap></sitemapindex>`;
    expect(readListing(xml).sitemaps).toEqual([
      'https://blog.example.com/post-sitemap.xml',
      'https://blog.example.com/page-sitemap.xml'
    ]);
  });

  it("takes an RSS item's link and date but not the channel's own link", () => {
    const xml = `<rss><channel><link>https://blog.example.com/</link>
      <item><title>Hi</title><link><![CDATA[https://blog.example.com/hi?a=1&amp;b=2]]></link>
      <pubDate>Tue, 03 Mar 2020 09:00:00 GMT</pubDate></item></channel></rss>`;
    expect(readListing(xml).posts).toEqual([
      { url: 'https://blog.example.com/hi?a=1&amp;b=2', date: '2020-03-03' }
    ]);
  });

  it("takes an Atom entry's alternate link, not its replies", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><link href="https://blog.example.com/"/>
      <entry><link rel="replies" href="https://blog.example.com/hi#comments"/>
      <link rel="alternate" href="https://blog.example.com/hi"/><published>2021-01-09T00:00:00Z</published></entry></feed>`;
    expect(readListing(xml).posts).toEqual([
      { url: 'https://blog.example.com/hi', date: '2021-01-09' }
    ]);
  });
});

describe('isPost', () => {
  it.each([
    ['https://www.example.com/2019/a-post/', true],
    ['https://example.com/', false],
    ['https://example.com/tag/gardening/', false],
    ['https://example.com/category/news', false],
    ['https://example.com/wp-content/uploads/cat.jpg', false],
    ['https://elsewhere.com/2019/a-post/', false]
  ])('%s is a post: %s', (url, expected) => {
    expect(isPost(url, 'example.com')).toBe(expected);
  });
});

describe('feedOf', () => {
  it('finds the feed a home page links to, wherever its attributes sit', () => {
    const html = `<head><link href="/feed.xml" type="application/atom+xml" rel="alternate"></head>`;
    expect(feedOf(html, new URL('https://example.com/'))?.href).toBe(
      'https://example.com/feed.xml'
    );
  });
});

describe('onSite', () => {
  it.each([
    ['https://example.com/sitemap.xml', true],
    ['https://blog.example.com/feed', true],
    ['https://cdn.elsewhere.net/example.com/sitemap.xml', false],
    ['https://notexample.com/sitemap.xml', false],
    ['ftp://example.com/sitemap.xml', false]
  ])("%s is the site's own: %s", (url, expected) => {
    expect(onSite(url, 'www.example.com')).toBe(expected);
  });
});
