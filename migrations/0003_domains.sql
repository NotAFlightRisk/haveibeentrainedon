alter table lookups add column quick integer not null default 0;
alter table lookups add column deeper integer not null default 0;

create table domains (
  id text primary key,
  host text unique not null,
  posts text not null,
  picked text not null,
  tried text not null,
  swaps integer not null default 0,
  picker integer not null,
  checked_at integer not null
);

create table captures (
  url text not null,
  crawl text not null,
  name text not null,
  lookup text not null,
  state text not null check (state in ('waiting', 'found', 'missing', 'failed')),
  day text,
  held integer,
  sentences integer,
  tries integer not null default 0,
  asked_at integer not null,
  primary key (url, crawl)
) without rowid;

create index captures_waiting on captures (state, tries, asked_at);
