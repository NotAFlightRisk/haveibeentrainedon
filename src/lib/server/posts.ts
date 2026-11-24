import { Parser } from 'htmlparser2';
import { spread } from '#lib/spans.ts';
import { bare, fetchPage } from './fetcher.ts';

export interface Post {
  url: string;
  date?: string;
}

const MOST_MAPS = 4;
const DISCOVERY_MS = 20_000;
const MOST_KEPT = 200;
const ENTRIES = new Set(['url', 'sitemap', 'item', 'entry']);
const DATES = new Set(['lastmod', 'pubdate', 'published', 'updated', 'date']);
const NOT_POSTS =
  /\/(tags?|categor(y|ies)|authors?|page|search|feed|rss|wp-content|wp-json|attachment|archives?)(\/|$)|\.(xml|jpe?g|png|gif|webp|svg|pdf|zip|mp3|mp4)$/i;
// sitemaps of pages, tags and pictures aren't where the writing lives
const NOT_POST_MAPS = /page|tag|categor|author|user|taxonom|image|video|product|attachment/i;

const local = (name: string) => name.split(':').pop()!.toLowerCase();

function isoDay(value: string) {
  const when = Date.parse(value);
  return Number.isNaN(when) ? undefined : new Date(when).toISOString().slice(0, 10);
}

/** Every address in a sitemap, sitemap index, RSS or Atom feed, with the date beside it */
export function readListing(xml: string) {
  const found: (Post & { map: boolean })[] = [];
  let entry: (Partial<Post> & { map: boolean }) | undefined;
  let text = '';
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = local(name);
        text = '';
        if (ENTRIES.has(tag)) entry = { map: tag === 'sitemap' };
        if (
          entry &&
          tag === 'link' &&
          attribs.href &&
          (attribs.rel ?? 'alternate') === 'alternate'
        ) {
          entry.url ??= attribs.href;
        }
      },
      ontext(chunk) {
        text += chunk;
      },
      onclosetag(name) {
        const tag = local(name);
        const value = text.trim();
        text = '';
        if (!entry) return;
        if ((tag === 'loc' || tag === 'link') && value) entry.url ??= value;
        if (DATES.has(tag) && value) entry.date ??= isoDay(value);
        if (!ENTRIES.has(tag)) return;
        if (entry.url) found.push({ ...entry, url: entry.url });
        entry = undefined;
      }
    },
    { xmlMode: true, decodeEntities: true }
  );
  parser.end(xml);
  return {
    posts: found.filter(({ map }) => !map).map(({ url, date }): Post => ({ url, date })),
    sitemaps: found.filter(({ map }) => map).map(({ url }) => url)
  };
}

/** An address on the site itself or one of its subdomains, where its sitemaps and feeds live */
export function onSite(href: string, host: string) {
  try {
    const url = new URL(href);
    const site = bare(host);
    const name = bare(url.hostname);
    return /^https?:$/.test(url.protocol) && (name === site || name.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

/** A page of the site's own that looks like something somebody wrote, not a list of them */
export function isPost(href: string, host: string) {
  if (!onSite(href, host) || bare(new URL(href).hostname) !== bare(host)) return false;
  const { pathname } = new URL(href);
  return pathname.length > 1 && !NOT_POSTS.test(pathname);
}

/** The feed a home page points at, if it points at one */
export function feedOf(html: string, page: URL) {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)`, 'i').exec(tag)?.[1];
    if (/alternate/i.test(attr('rel') ?? '') && /(rss|atom)\+xml/i.test(attr('type') ?? '')) {
      const href = attr('href');
      if (href) return new URL(href, page);
    }
  }
}

/** Oldest first when everything's dated, as listed otherwise, and never the same post twice */
function order(posts: Post[]) {
  const unique = [...new Map(posts.map((post) => [post.url, post])).values()];
  const dated = unique.every(({ date }) => date);
  const sorted = dated ? unique.toSorted((a, b) => a.date!.localeCompare(b.date!)) : unique;
  return spread(sorted, MOST_KEPT);
}

/** A site's posts, from the sitemaps its robots.txt names, then /sitemap.xml, then its feed */
export async function findPosts(origin: URL) {
  const until = Date.now() + DISCOVERY_MS;
  // a missing robots.txt, sitemap or feed is normal, so a failure just means try the next thing
  const get = async (url: string | URL, kind: 'html' | 'xml' | 'text') => {
    if (Date.now() > until || !onSite(String(url), origin.hostname)) return;
    return fetchPage(url, kind).then(
      ({ body }) => body,
      () => undefined
    );
  };
  const ours = (posts: Post[]) => posts.filter(({ url }) => isPost(url, origin.hostname));

  const robots = (await get(new URL('/robots.txt', origin), 'text')) ?? '';
  const named = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(([, url]) => url);
  const queue = named.length ? named : [new URL('/sitemap.xml', origin).href];
  const seen = new Set<string>();
  const posts: Post[] = [];
  while (queue.length && seen.size < MOST_MAPS) {
    const map = queue.shift()!;
    if (seen.has(map)) continue;
    seen.add(map);
    const xml = await get(map, 'xml');
    if (!xml) continue;
    const listing = readListing(xml);
    posts.push(...ours(listing.posts));
    // a big archive splits its posts over several sitemaps, so read a few from across them
    const children = listing.sitemaps.filter((child) => !NOT_POST_MAPS.test(child));
    queue.unshift(...spread(children, MOST_MAPS - 1));
  }
  if (posts.length) return order(posts);

  const home = await get(origin, 'html');
  const feed = (home && feedOf(home, origin)) || new URL('/feed', origin);
  const xml = await get(feed, 'xml');
  return xml ? order(ours(readListing(xml).posts)) : [];
}
