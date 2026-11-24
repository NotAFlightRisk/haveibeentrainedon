import { QUICK } from '#lib/corpora.ts';
import { spread } from '#lib/spans.ts';
import { bare, checkAddress, FetchError } from './fetcher.ts';
import type { Place } from './gate.ts';
import {
  file,
  newId,
  PICKER,
  prepare,
  retryingRaces,
  STALE_MS,
  type Outcome,
  type Prepared
} from './lookup.ts';
import { findPosts } from './posts.ts';
import { loadResult, type Cell } from './result.ts';
import {
  claimSwap,
  domainByHost,
  domainById,
  releaseSwap,
  saveDomain,
  savePicked
} from './store.ts';

const SAMPLE = 4;
const MOST_SWAPS = 2;
// the screen's crawl comes along for free, but the sample is about the two training sets
const COLUMNS = QUICK.filter(({ api }) => api === 'v4').map(({ id }) => id);

/** A site we couldn't take a sample from, in words fit for the form */
export class DomainError extends Error {
  name = 'DomainError';
}

/** A site's home page, or just its name, rather than one post on it */
export const isDomain = (url: URL) => url.pathname === '/' && !url.search;

// a post we can't fetch is one to skip, but anything else going wrong is ours to hear about
const unreadable = (error: unknown) => {
  if (error instanceof FetchError) return undefined;
  throw error;
};

/** Reads posts spread through the list until it has `count` worth checking, three goes at most */
async function sample(posts: string[], tried: Set<string>, count: number) {
  const picked: { url: string; item: Prepared }[] = [];
  for (let go = 0; go < 3 && picked.length < count; go++) {
    const untried = posts.filter((post) => !tried.has(post));
    const batch = spread(untried, count - picked.length);
    batch.forEach((post) => tried.add(post));
    const read = await Promise.all(
      batch.map((url) => prepare(url, { quick: true }).then((item) => ({ url, item }), unreadable))
    );
    for (const post of read) {
      if (post && ('id' in post.item || post.item.lookup.spans.length >= 2)) picked.push(post);
    }
  }
  return picked;
}

/** Samples a site's posts, or sends people to the sample someone took this month */
export async function lookUpDomain(input: URL, who: string): Promise<Outcome> {
  const origin = new URL(checkAddress(input).origin);
  const host = bare(origin.hostname);
  const cached = await domainByHost(host);
  const fresh = cached?.picker === PICKER && Date.now() - cached.checkedAt < STALE_MS;
  if (cached && fresh) return { id: cached.id };

  const posts = (await findPosts(origin)).map(({ url }) => url);
  if (!posts.length) {
    throw new DomainError(
      "We couldn't find a sitemap or feed listing that site's posts. Try the address of one post instead."
    );
  }
  return retryingRaces(async () => {
    const tried = new Set<string>();
    const picked = await sample(posts, tried, SAMPLE);
    if (!picked.length) {
      throw new DomainError(
        "None of the posts we tried had enough sentences of their own to search for. Try the address of one you're proud of."
      );
    }
    const filed = await file(
      picked.map(({ item }) => item),
      'domain',
      who
    );
    if ('refused' in filed) return filed;
    const id = cached?.id ?? newId();
    try {
      await saveDomain({
        id,
        host,
        posts,
        picked: picked.map(({ url }, at) => ({ url, lookup: filed.ids[at] })),
        tried: [...tried],
        swaps: 0,
        picker: PICKER,
        checkedAt: Date.now()
      });
    } catch (error) {
      // somebody sampled the same site a moment before us, and theirs will do
      const theirs = await domainByHost(host);
      if (theirs && theirs.id !== id) return { id: theirs.id };
      throw error;
    }
    return { id };
  });
}

/** Swaps one post in a sample for another, twice a sample at most */
export async function swapPost(id: string, url: string, who: string): Promise<Outcome | null> {
  if (!(await claimSwap(id, MOST_SWAPS))) return null;
  try {
    const outcome = await retryingRaces(async (): Promise<Outcome | null> => {
      // read after claiming, so a swap that landed meanwhile is already in the list
      const found = await domainById(id);
      if (!found?.picked.some((post) => post.url === url)) return null;
      const tried = new Set(found.tried);
      const [next] = await sample(found.posts, tried, 1);
      if (!next) throw new DomainError("We've tried every post we could find on that site.");
      const filed = await file([next.item], 'swap', who);
      if ('refused' in filed) return filed;
      const latest = (await domainById(id)) ?? found;
      if (!latest.picked.some((post) => post.url === url)) return null;
      const picked = latest.picked.map((post) =>
        post.url === url ? { url: next.url, lookup: filed.ids[0] } : post
      );
      await savePicked(id, picked, [...new Set([...latest.tried, ...tried])]);
      return { id };
    });
    if (!outcome || 'refused' in outcome) await releaseSwap(id);
    return outcome;
  } catch (error) {
    await releaseSwap(id);
    throw error;
  }
}

export interface SampledPost {
  url: string;
  /** The address as the site listed it, which is how a swap finds it */
  listed: string;
  title: string | null;
  published: string | null;
  thin: boolean;
  cells: Cell[];
}

export interface DomainResult {
  id: string;
  kind: 'domain';
  host: string;
  checkedAt: number;
  done: boolean;
  swapsLeft: number;
  posts: SampledPost[];
  place: Place | null;
}

/** A domain's sample as its page and JSON show it, each post read from its own lookup */
export async function loadDomain(id: string): Promise<DomainResult | null> {
  const found = await domainById(id);
  if (!found) return null;
  const results = await Promise.all(
    found.picked.map(async (pick) => ({ pick, result: await loadResult(pick.lookup) }))
  );
  const checked = results.flatMap(({ result }) => (result ? [result] : []));
  const posts = results.flatMap(({ pick, result }) => {
    if (!result) return [];
    const { url, title, published, thin, sets, crawls } = result;
    const cells = COLUMNS.flatMap((column) =>
      [...sets, ...crawls].filter((cell) => cell.id === column)
    );
    return [{ url: url ?? pick.url, listed: pick.url, title, published, thin, cells }];
  });
  return {
    id: found.id,
    kind: 'domain',
    host: found.host,
    checkedAt: found.checkedAt,
    done: checked.every((result) => result.done),
    swapsLeft: MOST_SWAPS - found.swaps,
    posts,
    place: checked
      .flatMap((result) => (result.place ? [result.place] : []))
      .reduce<Place | null>((last, place) => (!last || place.wait > last.wait ? place : last), null)
  };
}
