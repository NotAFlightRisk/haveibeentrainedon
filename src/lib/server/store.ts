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
  /** Changes on every save, so an undo only ever reverts its own write */
  rev: string;
}

interface LookupRow extends Omit<Lookup, 'spans' | 'indexes' | 'skipped' | 'checkedAt' | 'doneAt'> {
  spans: string;
  indexes: string;
  skipped: string;
  checked_at: number;
  done_at: number | null;
}

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

const FIELDS = [
  'url',
  'title',
  'published',
  'lang',
  'spans',
  'indexes',
  'skipped',
  'picker',
  'status',
  'checked_at',
  'done_at',
  'rev'
];
const marks = (values: unknown[]) => values.map(() => '?').join(', ');
const updates = FIELDS.map((field) => `${field} = excluded.${field}`).join(', ');
const assignments = FIELDS.map((field) => `${field} = ?`).join(', ');

/** A lookup's values in FIELDS order, keeping only the hashes of pasted text */
function fields(lookup: Lookup) {
  const spans = lookup.kind === 'paste' ? lookup.spans.map(({ hash }) => ({ hash })) : lookup.spans;
  return [
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
    lookup.doneAt,
    lookup.rev
  ];
}

export async function saveLookup(lookup: Lookup) {
  const values = [lookup.id, lookup.kind, ...fields(lookup)];
  await env.DB.prepare(
    `insert into lookups (id, kind, ${FIELDS.join(', ')}) values (${marks(values)})
     on conflict (id) do update set ${updates}`
  )
    .bind(...values)
    .run();
}

/** Puts back what a refused check replaced, unless a later check has saved over it since */
export async function undoLookup(ours: Lookup, previous: Lookup | null) {
  const statement = previous
    ? env.DB.prepare(`update lookups set ${assignments} where id = ? and rev = ?`).bind(
        ...fields(previous),
        ours.id,
        ours.rev
      )
    : env.DB.prepare('delete from lookups where id = ? and rev = ?').bind(ours.id, ours.rev);
  await statement.run();
}

/** Marks a check done, recording the sets it actually counted, which a later ask may have widened */
export async function finishLookup(id: string, indexes?: string[]) {
  const statement = indexes
    ? env.DB.prepare(
        `update lookups set status = 'done', done_at = ?, indexes = ? where id = ?`
      ).bind(Date.now(), JSON.stringify(indexes), id)
    : env.DB.prepare(`update lookups set status = 'done', done_at = ? where id = ?`).bind(
        Date.now(),
        id
      );
  await statement.run();
}

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
