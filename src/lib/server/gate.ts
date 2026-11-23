import { DurableObject, env } from 'cloudflare:workers';
import { byIndex, SCREEN, SETS } from '#lib/corpora.ts';
import { evaluate, FAILED, key, type Plan, type Step } from '#lib/plan.ts';
import { count, documents, Throttled } from './infinigram.ts';
import { report } from './report.ts';
import { finishLookup, loadCounts, loadDocs, saveCount, saveDocs } from './store.ts';

const MINUTE = 60_000;
const PAUSE_MS = 2 * MINUTE;
const SLOW_MS = 60 * MINUTE;
const LINE_MS = 10 * MINUTE;
const TRIES = 3;
const LIMITS = { url: { most: 5, per: 60 * MINUTE } };
const CANARY = 'what goes on the internet stays on the internet';

export type Kind = keyof typeof LIMITS;

export interface Ticket {
  id: string;
  plan: Plan;
  cost: number;
  kind: Kind;
  who: string;
}

export type Admission =
  | { ok: true; ahead: number; wait: number }
  | { ok: false; reason: 'busy' | 'limited'; retryAt: number };

export interface Place {
  ahead: number;
  wait: number;
  paused: boolean;
  slow: boolean;
}

interface Job {
  seq: number;
  id: string;
  plan: string;
  cost: number;
  calls: number;
  tries: number;
  failed: string;
}

/** The one line every call to the corpus host waits in, one call per alarm */
export class Gate extends DurableObject {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.sql.exec(`create table if not exists line (
      seq integer primary key autoincrement, id text unique not null, plan text not null,
      cost integer not null, calls integer not null default 0, tries integer not null default 0,
      failed text not null default '[]', added integer not null)`);
    this.sql.exec(
      'create table if not exists seen (who text not null, kind text not null, at integer not null)'
    );
    this.sql.exec(
      'create table if not exists state (key text primary key, value integer not null)'
    );
  }

  private get(name: string) {
    return this.sql
      .exec<{ value: number }>('select value from state where key = ?', name)
      .toArray()[0]?.value;
  }

  private set(name: string, value: number) {
    this.sql.exec(
      'insert into state (key, value) values (?, ?) on conflict do update set value = excluded.value',
      name,
      value
    );
  }

  private interval(now = Date.now()) {
    const base = Number(env.GATE_MS) || 2_000;
    return now < (this.get('slow') ?? 0) ? base * 2 : base;
  }

  private jobs() {
    return this.sql.exec<Job>('select * from line order by seq').toArray();
  }

  private remaining = (job: Job) => Math.max(job.cost - job.calls, 1);

  private async who(address: string) {
    let salt = this.get('salt');
    if (salt === undefined) {
      salt = crypto.getRandomValues(new Uint32Array(1))[0];
      this.set('salt', salt);
    }
    const bytes = new TextEncoder().encode(`${salt} ${address}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return btoa(String.fromCharCode(...new Uint8Array(digest).slice(0, 12)));
  }

  async admit(ticket: Ticket): Promise<Admission> {
    const now = Date.now();
    const limit = LIMITS[ticket.kind];
    const who = await this.who(ticket.who);
    this.sql.exec('delete from seen where at < ?', now - 24 * 60 * MINUTE);
    const recent = this.sql
      .exec<{ at: number }>(
        'select at from seen where who = ? and kind = ? and at > ? order by at',
        who,
        ticket.kind,
        now - limit.per
      )
      .toArray();
    if (recent.length >= limit.most) {
      return { ok: false, reason: 'limited', retryAt: recent[0].at + limit.per };
    }
    const queued = this.jobs().reduce((sum, job) => sum + this.remaining(job), 0);
    const interval = this.interval(now);
    const over = (queued + ticket.cost) * interval - LINE_MS;
    if (over > 0) return { ok: false, reason: 'busy', retryAt: now + over };
    this.sql.exec('insert into seen (who, kind, at) values (?, ?, ?)', who, ticket.kind, now);
    this.sql.exec(
      `insert into line (id, plan, cost, added) values (?, ?, ?, ?)
       on conflict (id) do update set plan = excluded.plan, cost = excluded.cost, calls = 0,
         tries = 0, failed = '[]'`,
      ticket.id,
      JSON.stringify(ticket.plan),
      ticket.cost,
      now
    );
    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Math.max(now, this.get('next') ?? 0));
    }
    return { ok: true, ahead: queued, wait: queued * interval };
  }

  async place(id: string): Promise<Place | null> {
    const now = Date.now();
    const jobs = this.jobs();
    const position = jobs.findIndex((job) => job.id === id);
    if (position < 0) return null;
    const ahead = jobs.slice(0, position + 1).reduce((sum, job) => sum + this.remaining(job), 0);
    const pausedUntil = this.get('paused') ?? 0;
    return {
      ahead: position,
      wait: ahead * this.interval(now) + Math.max(pausedUntil - now, 0),
      paused: now < pausedUntil,
      slow: now < (this.get('slow') ?? 0)
    };
  }

  async health() {
    const now = Date.now();
    return {
      v4: this.get('ok:v4') ?? null,
      mini: this.get('ok:mini') ?? null,
      line: this.jobs().length,
      paused: now < (this.get('paused') ?? 0),
      slow: now < (this.get('slow') ?? 0)
    };
  }

  /** Keeps /health honest when nobody's looked anything up for a while */
  async canary() {
    const quiet = Date.now() - (this.get('called') ?? 0) > 50 * MINUTE;
    if (!quiet || this.jobs().length || (await this.ctx.storage.getAlarm())) return;
    for (const { index } of [SETS[0], SCREEN]) {
      await this.call({ kind: 'count', index, span: { hash: '', text: CANARY } });
    }
  }

  async alarm() {
    const now = Date.now();
    const pausedUntil = this.get('paused') ?? 0;
    if (now < pausedUntil) return this.ctx.storage.setAlarm(pausedUntil);
    for (const job of this.jobs()) {
      const step = await this.nextStep(job);
      if (!step) {
        await finishLookup(job.id);
        this.sql.exec('delete from line where seq = ?', job.seq);
        continue;
      }
      const outcome = await this.call(step, job);
      if (outcome === 'throttled') return this.ctx.storage.setAlarm(this.get('paused') ?? now);
      const next = Date.now() + this.interval();
      this.set('next', next);
      return this.ctx.storage.setAlarm(next);
    }
  }

  private async nextStep(job: Job) {
    const plan = JSON.parse(job.plan) as Plan;
    const failed = JSON.parse(job.failed) as string[];
    const hashes = plan.spans.map(({ hash }) => hash);
    const [counts, docs] = await Promise.all([loadCounts(hashes), loadDocs(hashes)]);
    const fetched = new Set(docs.keys());
    for (const failure of failed) {
      const [kind, ...rest] = failure.split(' ');
      if (kind === 'count') counts.set(rest.join(' '), FAILED);
      else fetched.add(rest.join(' '));
    }
    return evaluate(plan, counts, fetched).next;
  }

  private async call(step: Step, job?: Job) {
    const query = step.span.text ?? '';
    const api = byIndex(step.index)?.api ?? 'v4';
    this.set('called', Date.now());
    try {
      if (step.kind === 'count') {
        const found = await count(step.index, query);
        if (job) await saveCount(step.index, step.span.hash, found);
      } else {
        await saveDocs(step.index, step.span.hash, await documents(step.index, query));
      }
      this.set(`ok:${api}`, Date.now());
      if (job) this.sql.exec('update line set calls = calls + 1, tries = 0 where seq = ?', job.seq);
      return 'ok';
    } catch (error) {
      if (error instanceof Throttled) {
        const now = Date.now();
        this.set('paused', now + PAUSE_MS);
        this.set('slow', now + PAUSE_MS + SLOW_MS);
        await report(error, undefined, 'gate');
        return 'throttled';
      }
      await report(error, undefined, 'gate');
      if (job) this.giveUpAfterTries(job, `${step.kind} ${key(step.index, step.span.hash)}`);
      return 'failed';
    }
  }

  private giveUpAfterTries(job: Job, failure: string) {
    if (job.tries + 1 < TRIES) {
      this.sql.exec('update line set tries = tries + 1 where seq = ?', job.seq);
      return;
    }
    const failed = [...(JSON.parse(job.failed) as string[]), failure];
    this.sql.exec(
      'update line set tries = 0, calls = calls + 1, failed = ? where seq = ?',
      JSON.stringify(failed),
      job.seq
    );
  }
}
