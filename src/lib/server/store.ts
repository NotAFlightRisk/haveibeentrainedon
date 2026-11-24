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
  /** A domain sample's look: the screen, Dolma and DCLM, with no lists of matching documents */
  quick: boolean;
  /** Asked for a second round of sentences wherever the first missed */
  deeper: boolean;
  picker: number;
  status: 'queued' | 'done';
  checkedAt: number;
  doneAt: number | null;
  /** Changes on every save, so an undo only ever reverts its own write */
  rev: string;
}

type Stored = 'spans' | 'indexes' | 'skipped' | 'quick' | 'deeper' | 'checkedAt' | 'doneAt';

interface LookupRow extends Omit<Lookup, Stored> {
  spans: string;
  indexes: string;
  skipped: string;
  quick: number;
  deeper: number;
  checked_at: number;
  done_at: number | null;
}

const fromRow = ({ checked_at, done_at, ...row }: LookupRow): Lookup => ({
  ...row,
  spans: JSON.parse(row.spans),
  indexes: JSON.parse(row.indexes),
  skipped: JSON.parse(row.skipped),
  quick: !!row.quick,
  deeper: !!row.deeper,
  checkedAt: checked_at,
  doneAt: done_at
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
  'quick',
  'deeper',
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
    Number(lookup.quick),
    Number(lookup.deeper),
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

export interface Picked {
  url: string;
  lookup: string;
}

export interface Domain {
  id: string;
  host: string;
  /** Every post we found, oldest first when the site dates them */
  posts: string[];
  picked: Picked[];
  /** Posts we've already fetched for this sample, used or not */
  tried: string[];
  swaps: number;
  picker: number;
  checkedAt: number;
}

interface DomainRow extends Omit<Domain, 'posts' | 'picked' | 'tried' | 'checkedAt'> {
  posts: string;
  picked: string;
  tried: string;
  checked_at: number;
}

async function domain(where: string, value: string): Promise<Domain | null> {
  const row = await env.DB.prepare(`select * from domains where ${where} = ?`)
    .bind(value)
    .first<DomainRow>();
  if (!row) return null;
  const { checked_at, ...rest } = row;
  return {
    ...rest,
    posts: JSON.parse(row.posts),
    picked: JSON.parse(row.picked),
    tried: JSON.parse(row.tried),
    checkedAt: checked_at
  };
}

export const domainById = (id: string) => domain('id', id);
export const domainByHost = (host: string) => domain('host', host);

export async function saveDomain(found: Domain) {
  const values = [
    found.id,
    found.host,
    JSON.stringify(found.posts),
    JSON.stringify(found.picked),
    JSON.stringify(found.tried),
    found.swaps,
    found.picker,
    found.checkedAt
  ];
  await env.DB.prepare(
    `insert into domains (id, host, posts, picked, tried, swaps, picker, checked_at)
     values (${marks(values)})
     on conflict (id) do update set posts = excluded.posts, picked = excluded.picked,
       tried = excluded.tried, swaps = excluded.swaps, picker = excluded.picker,
       checked_at = excluded.checked_at`
  )
    .bind(...values)
    .run();
}

/** Takes one of a sample's swaps, unless they've all gone */
export async function claimSwap(id: string, most: number) {
  const claimed = await env.DB.prepare(
    'update domains set swaps = swaps + 1 where id = ? and swaps < ? returning swaps'
  )
    .bind(id, most)
    .first();
  return claimed !== null;
}

export async function releaseSwap(id: string) {
  await env.DB.prepare('update domains set swaps = swaps - 1 where id = ? and swaps > 0')
    .bind(id)
    .run();
}

export async function savePicked(id: string, picked: Picked[], tried: string[]) {
  await env.DB.prepare('update domains set picked = ?, tried = ? where id = ?')
    .bind(JSON.stringify(picked), JSON.stringify(tried), id)
    .run();
}
