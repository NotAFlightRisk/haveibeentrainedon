import { byIndex, type Api, type Sources } from '#lib/corpora.ts';
import { USER_AGENT } from './fetcher.ts';

export const HOSTS: Record<Api, string> = {
  v4: 'https://api.infini-gram.io/',
  mini: 'https://api.infini-gram-mini.io/'
};
const DOCS_PER_SPAN = 10;

export interface Doc {
  url?: string;
  date?: string;
  part?: string;
}

/** The corpus host's gateway telling one address it's going too fast */
export class Throttled extends Error {
  name = 'Throttled';
}

async function ask<T>(index: string, query: object): Promise<T> {
  const api = byIndex(index)?.api ?? 'v4';
  const response = await fetch(HOSTS[api], {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ index, ...query }),
    signal: AbortSignal.timeout(30_000)
  });
  if (response.status === 403 || response.status === 429) {
    throw new Throttled(`${HOSTS[api]} answered ${response.status}`);
  }
  if (!response.ok) throw new Error(`${HOSTS[api]} answered ${response.status} for ${index}`);
  const body = (await response.json()) as T & { error?: string };
  if (body.error) throw new Error(`${index}: ${body.error}`);
  return body;
}

export async function count(index: string, query: string) {
  const { count } = await ask<{ count: number }>(index, { query_type: 'count', query });
  return count;
}

const DATE_KEYS = ['timestamp', 'created', 'WARC-Date'];
const PARTS: Record<string, string> = {
  common_crawl: 'Common Crawl',
  c4: 'C4',
  github: 'GitHub',
  wikipedia: 'Wikipedia',
  book: 'books',
  arxiv: 'arXiv',
  stackexchange: 'Stack Exchange'
};

// each index nests its metadata differently, so look for the fields wherever they are
function find(meta: unknown, keys: string[]): string | undefined {
  if (!meta || typeof meta !== 'object') return;
  const record = meta as Record<string, unknown>;
  for (const name of keys) if (typeof record[name] === 'string') return record[name] as string;
  for (const value of Object.values(record)) {
    const found = find(value, keys);
    if (found) return found;
  }
}

/** Where a RedPajama hit came from, like "Common Crawl 2021-04" */
export function slice(path = '') {
  const [top, month] = path.split('/');
  const name = PARTS[top] ?? top;
  return top === 'common_crawl' && /^\d{4}-\d{2}$/.test(month) ? `${name} ${month}` : name;
}

export function readDoc(raw: string, sources?: Sources): Doc {
  const meta = JSON.parse(raw) as { path?: string };
  const url = find(meta, ['url']);
  return sources === 'urls' && url?.startsWith('http')
    ? { url, date: find(meta, DATE_KEYS)?.slice(0, 10) }
    : { part: slice(meta.path) };
}

export async function documents(index: string, query: string) {
  const { documents = [] } = await ask<{ documents?: { doc_ix: number; metadata: string }[] }>(
    index,
    { query_type: 'search_docs', query, maxnum: DOCS_PER_SPAN, max_disp_len: 1 }
  );
  const unique = new Map(documents.map((doc) => [doc.doc_ix, doc]));
  return [...unique.values()].map((doc) => readDoc(doc.metadata, byIndex(index)?.sources));
}
