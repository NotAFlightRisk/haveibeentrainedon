import { env } from 'cloudflare:workers';
import { key, type Span } from '#lib/plan.ts';
import type { Doc } from './infinigram.ts';

export interface Lookup {
  id: string;
  kind: 'url' | 'paste';
  url: string | null;
  title: string | null;
  published: string | null;
  lang: string | null;
  spans: Span[];
  indexes: string[];
  skipped: string[];
  picker: number;
  status: 'queued' | 'done';
  checkedAt: number;
  doneAt: number | null;
}

interface LookupRow extends Omit<Lookup, 'spans' | 'indexes' | 'skipped' | 'checkedAt' | 'doneAt'> {
  spans: string;
  indexes: string;
  skipped: string;
  checked_at: number;
  done_at: number | null;
}

const COLUMNS = 'id, kind, url, title, published, lang, spans, indexes, skipped, picker, status';

const fromRow = (row: LookupRow): Lookup => ({
  ...row,
  spans: JSON.parse(row.spans),
  indexes: JSON.parse(row.indexes),
  skipped: JSON.parse(row.skipped),
  checkedAt: row.checked_at,
  doneAt: row.done_at
});

const one = async (where: string, value: string) => {
  const row = await env.DB.prepare(`select * from lookups where ${where} = ?`)
    .bind(value)
    .first<LookupRow>();
  return row && fromRow(row);
};

export const lookupById = (id: string) => one('id', id);
export const lookupByUrl = (url: string) => one('url', url);

export async function saveLookup(lookup: Lookup) {
  const spans = lookup.kind === 'paste' ? lookup.spans.map(({ hash }) => ({ hash })) : lookup.spans;
  await env.DB.prepare(
    `insert into lookups (${COLUMNS}, checked_at, done_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set url = excluded.url, title = excluded.title,
       published = excluded.published, lang = excluded.lang, spans = excluded.spans,
       indexes = excluded.indexes, skipped = excluded.skipped, picker = excluded.picker,
       status = excluded.status, checked_at = excluded.checked_at, done_at = excluded.done_at`
  )
    .bind(
      lookup.id,
      lookup.kind,
      lookup.url,
      lookup.title,
      lookup.published,
      lookup.lang,
      JSON.stringify(spans),
      JSON.stringify(lookup.indexes),
      JSON.stringify(lookup.skipped),
      lookup.picker,
      lookup.status,
      lookup.checkedAt,
      lookup.doneAt
    )
    .run();
}

export async function dropLookup(id: string) {
  await env.DB.prepare('delete from lookups where id = ?').bind(id).run();
}

export async function finishLookup(id: string) {
  await env.DB.prepare(`update lookups set status = 'done', done_at = ? where id = ?`)
    .bind(Date.now(), id)
    .run();
}

const marks = (hashes: string[]) => hashes.map(() => '?').join(', ');

export async function loadCounts(hashes: string[]) {
  if (!hashes.length) return new Map<string, number>();
  const { results } = await env.DB.prepare(
    `select idx, span, count from counts where span in (${marks(hashes)})`
  )
    .bind(...hashes)
    .all<{ idx: string; span: string; count: number }>();
  return new Map(results.map((row) => [key(row.idx, row.span), row.count]));
}

export async function loadDocs(hashes: string[]) {
  if (!hashes.length) return new Map<string, Doc[]>();
  const { results } = await env.DB.prepare(
    `select idx, span, docs from docs where span in (${marks(hashes)})`
  )
    .bind(...hashes)
    .all<{ idx: string; span: string; docs: string }>();
  return new Map(results.map((row) => [key(row.idx, row.span), JSON.parse(row.docs) as Doc[]]));
}

export async function saveCount(index: string, hash: string, count: number) {
  await env.DB.prepare(
    `insert into counts (idx, span, count, counted_at) values (?, ?, ?, ?)
     on conflict do update set count = excluded.count, counted_at = excluded.counted_at`
  )
    .bind(index, hash, count, Date.now())
    .run();
}

export async function saveDocs(index: string, hash: string, docs: Doc[]) {
  await env.DB.prepare(
    `insert into docs (idx, span, docs, fetched_at) values (?, ?, ?, ?)
     on conflict do update set docs = excluded.docs, fetched_at = excluded.fetched_at`
  )
    .bind(index, hash, JSON.stringify(docs), Date.now())
    .run();
}
