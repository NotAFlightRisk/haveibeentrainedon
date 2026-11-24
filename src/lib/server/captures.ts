import { DurableObject, env } from 'cloudflare:workers';
import type { Span } from '#lib/plan.ts';
import { PRIMARY } from '#lib/spans.ts';
import { USER_AGENT } from './fetcher.ts';
import { pageText } from './page.ts';
import { report } from './report.ts';

const INDEX = 'https://index.commoncrawl.org/';
const DATA = 'https://data.commoncrawl.org/';
// the newest crawl infini-gram mini can search, so these pick up where its text stops
const AFTER = 'CC-MAIN-2025-30';
const GAP_MS = 1_000;
const BACK_OFF_MS = 10_000;
const TRIES = 3;
// about a quarter of an hour of questions, well inside the half hour before a row gives up
const MOST_WAITING = 100;
const HOUR = 60 * 60_000;
const GIVE_UP_MS = HOUR / 2;
const MOST_RECORD = 2 * 1024 * 1024;

export interface Crawl {
  id: string;
  name: string;
}

export type CaptureState = 'waiting' | 'found' | 'missing' | 'failed';

export interface Capture extends Crawl {
  state: CaptureState;
  day: string | null;
  /** How many of the page's sentences that crawl's copy holds, once we've read it */
  held: number | null;
  sentences: number | null;
  asked: number;
}

/** Where a crawl keeps its copy of a page, inside one of its WARC files */
export interface Record {
  day: string;
  filename: string;
  offset: string;
  length: string;
}

/** Common Crawl's crawls since the searchable text stops, oldest first, new ones included */
export const newerCrawls = (list: Crawl[]) =>
  list
    .filter(({ id }) => id > AFTER)
    .map(({ id, name }) => ({ id, name: name.replace(/\s*Index$/i, '') }))
    .toSorted((a, b) => a.id.localeCompare(b.id));

let listed: { at: number; crawls: Promise<Crawl[]> } | undefined;

/** The crawl list, fetched once an hour at most and shared by everyone asking meanwhile */
function crawls() {
  if (!listed || Date.now() - listed.at > HOUR) {
    const crawls = ask('collinfo.json').then(async (response) =>
      newerCrawls(await response.json())
    );
    crawls.catch(() => (listed = undefined));
    listed = { at: Date.now(), crawls };
  }
  return listed.crawls;
}

async function ask(path: string) {
  const response = await fetch(`${INDEX}${path}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok && response.status !== 404)
    throw new Error(`${INDEX} answered ${response.status}`);
  return response;
}

/** The first copy in a crawl's index answer that actually loaded, if it holds one */
export function firstGood(lines: string): Record | undefined {
  const good = lines
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Omit<Record, 'day'> & { timestamp: string; status: string })
    .find(({ status }) => status === '200');
  if (!good) return;
  const { timestamp, filename, offset, length } = good;
  return {
    day: timestamp.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3'),
    filename,
    offset,
    length
  };
}

async function captured(crawl: string, url: string) {
  const query = new URLSearchParams({
    url,
    output: 'json',
    fl: 'timestamp,status,filename,offset,length'
  });
  const response = await ask(`${crawl}-index?${query}`);
  return response.status === 404 ? undefined : firstGood(await response.text());
}

/** The page as the crawl stored it, past the WARC record's headers and the HTTP ones */
async function storedPage({ filename, offset, length }: Record) {
  const start = Number(offset);
  if (!(Number(length) > 0 && Number(length) <= MOST_RECORD)) {
    throw new Error(`${DATA} record is ${length} bytes, more than we'll read`);
  }
  const response = await fetch(`${DATA}${filename}`, {
    headers: { range: `bytes=${start}-${start + Number(length) - 1}`, 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000)
  });
  if (response.status !== 206) throw new Error(`${DATA} answered ${response.status}`);
  const record = await new Response(
    response.body!.pipeThrough(new DecompressionStream('gzip'))
  ).text();
  return pageFrom(record);
}

/** The HTML in a WARC response record, after its own headers and the site's HTTP ones */
export function pageFrom(record: string) {
  const http = record.indexOf('\r\n\r\n');
  const body = http < 0 ? -1 : record.indexOf('\r\n\r\n', http + 4);
  // a copy still squashed by the site's own encoding is one we can't read word for word
  if (body < 0 || /^content-encoding:\s*(?!identity)\S/im.test(record.slice(http, body))) {
    throw new Error(`${DATA} sent a record we couldn't read`);
  }
  return record.slice(body + 4);
}

/** How many of our sentences a crawl's copy of the page holds, word for word */
export const holds = (html: string, spans: string[]) => {
  const text = pageText(html);
  return spans.filter((span) => text.includes(span)).length;
};

async function sentencesOf(id: string) {
  const lookup = await env.DB.prepare('select spans from lookups where id = ?')
    .bind(id)
    .first<{ spans: string }>();
  const spans: Span[] = lookup ? JSON.parse(lookup.spans) : [];
  return spans.slice(0, PRIMARY).flatMap(({ text }) => (text ? [text] : []));
}

/** What Common Crawl's index said about a page in each crawl since July 2025, oldest first */
export async function loadCaptures(url: string) {
  // a row the line has sat on for half an hour isn't coming, so the page can stop asking
  const { results } = await env.DB.prepare(
    `select crawl as id, name, day, held, sentences, asked_at as asked,
       case when state = 'waiting' and asked_at < ? then 'failed' else state end as state
     from captures where url = ? order by crawl`
  )
    .bind(Date.now() - GIVE_UP_MS, url)
    .all<Capture>();
  return results;
}

/** Queues a page's crawls, and any that failed an hour or more ago, unless the line's too long */
export async function askCaptures(url: string, lookup: string) {
  const now = Date.now();
  const count = (sql: string, ...values: unknown[]) =>
    env.DB.prepare(sql)
      .bind(...values)
      .first<{ count: number }>()
      .then((row) => row?.count ?? 0);
  const [list, waiting, settled] = await Promise.all([
    crawls(),
    count(`select count(*) as count from captures where state = 'waiting'`),
    count(
      `select count(*) as count from captures
       where url = ? and (state != 'failed' or asked_at > ?)`,
      url,
      now - HOUR
    )
  ]);
  if (waiting + list.length - settled > MOST_WAITING) return false;
  await env.DB.batch(
    list.map(({ id, name }) =>
      env.DB.prepare(
        `insert into captures (url, crawl, name, lookup, state, asked_at)
         values (?, ?, ?, ?, 'waiting', ?)
         on conflict do update set state = 'waiting', tries = 0, lookup = excluded.lookup,
           asked_at = excluded.asked_at
         where captures.state = 'failed' and captures.asked_at < ?`
      ).bind(url, id, name, lookup, now, now - HOUR)
    )
  );
  await env.CRAWLS.getByName('index').wake();
  return true;
}

/** What a crawl's copy holds, or nothing when the copy won't load, as it was still fetched */
async function reading(record: Record, lookup: string) {
  try {
    const spans = await sentencesOf(lookup);
    return { held: holds(await storedPage(record), spans), sentences: spans.length };
  } catch (error) {
    await report(error, undefined, 'crawls');
    return {};
  }
}

interface Waiting {
  url: string;
  crawl: string;
  lookup: string;
  tries: number;
}

/** Asks Common Crawl's index one thing at a time, as it's slow and easily upset */
export class Crawls extends DurableObject {
  async wake() {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm() {
    const next = await env.DB.prepare(
      `select url, crawl, lookup, tries from captures
       where state = 'waiting' order by tries, asked_at limit 1`
    ).first<Waiting>();
    if (!next) return;
    const settle = (state: CaptureState, found: Partial<Capture> = {}, tries = next.tries) =>
      env.DB.prepare(
        `update captures set state = ?, day = ?, held = ?, sentences = ?, tries = ?
         where url = ? and crawl = ?`
      )
        .bind(
          state,
          found.day ?? null,
          found.held ?? null,
          found.sentences ?? null,
          tries,
          next.url,
          next.crawl
        )
        .run();
    try {
      const record = await captured(next.crawl, next.url);
      if (!record) await settle('missing');
      else await settle('found', { day: record.day, ...(await reading(record, next.lookup)) });
      await this.ctx.storage.setAlarm(Date.now() + GAP_MS);
    } catch (error) {
      await report(error, undefined, 'crawls');
      await settle(next.tries + 1 < TRIES ? 'waiting' : 'failed', {}, next.tries + 1);
      await this.ctx.storage.setAlarm(Date.now() + BACK_OFF_MS);
    }
  }
}
