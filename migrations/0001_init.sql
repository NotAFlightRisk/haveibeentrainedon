create table lookups (
  id text primary key,
  kind text not null check (kind in ('url', 'paste')),
  url text unique,
  title text,
  published text,
  lang text,
  spans text not null,
  indexes text not null,
  skipped text not null,
  picker integer not null,
  status text not null check (status in ('queued', 'done')),
  checked_at integer not null,
  done_at integer
);

create table counts (
  idx text not null,
  span text not null,
  count integer not null,
  counted_at integer not null,
  primary key (idx, span)
) without rowid;

create table docs (
  idx text not null,
  span text not null,
  docs text not null,
  fetched_at integer not null,
  primary key (idx, span)
) without rowid;
