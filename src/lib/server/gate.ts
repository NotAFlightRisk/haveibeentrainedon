import { DurableObject, env } from 'cloudflare:workers';
import { byIndex, SCREEN, SETS, type Api } from '#lib/corpora.ts';
import { estimate, evaluate, FAILED, key, type Plan, type Step } from '#lib/plan.ts';
import { count, documents, Throttled } from './infinigram.ts';
import { report } from './report.ts';
import { finishLookup, loadCounts, loadDocs, saveCount, saveDocs } from './store.ts';

const MINUTE = 60_000;
const PAUSE_MS = 2 * MINUTE;
const SLOW_MS = 60 * MINUTE;
const LINE_MS = 10 * MINUTE;
const RETRY_MS = 30_000;
// a call can take this long, so nothing else may start until it's back
const CALL_MS = 30_000;
const GIVE_UP_MS = 30 * MINUTE;
const DAY = 24 * 60 * MINUTE;
const TRIES = 3;
const CANARY = 'what goes on the internet stays on the internet';
const CANARIES: Record<Api, string> = { v4: SETS[0].index, mini: SCREEN.index };

export type Kind = 'url' | 'domain' | 'swap';
// a swap is part of a domain check that's already been counted against its day
const LIMITS: Partial<Record<Kind, { most: number; per: number }>> = {
  url: { most: 5, per: 60 * MINUTE },
  domain: { most: 2, per: DAY }
};

export interface Check {
  id: string;
  plan: Plan;
  cost: number;
}

/** Everything one person asked for at once, let in or turned away together */
export interface Ticket {
  kind: Kind;
  who: string;
  checks: Check[];
}

export type Admission = { ok: true } | { ok: false; reason: 'busy' | 'limited'; retryAt: number };

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
  added: number;
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
    // a line with nobody waking it would sit there until the next visitor
    ctx.blockConcurrencyWhile(() => (this.jobs().length ? this.wake() : Promise.resolve()));
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

  /** The soonest the next call may go, whatever asked for it */
  private due() {
    return Math.max(this.get('next') ?? 0, this.get('paused') ?? 0);
  }

  private async wake() {
    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Math.max(Date.now(), this.due()));
    }
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

  /** A waiting job with a wider ask folded in, on the newest sentences, and what it adds */
  private widened(job: Job, { id, plan }: Check): Check & { added: number } {
    const current = JSON.parse(job.plan) as Plan;
    const wider: Plan = {
      spans: plan.spans,
      indexes: [...new Set([...current.indexes, ...plan.indexes])],
      quick: Boolean(current.quick && plan.quick),
      deeper: Boolean(current.deeper || plan.deeper)
    };
    // calls already spent on sentences the page no longer has don't count towards the new ones
    const respun = JSON.stringify(current.spans) !== JSON.stringify(plan.spans);
    const cost = respun ? job.calls + estimate(wider) : Math.max(estimate(wider), job.calls + 1);
    return { id, plan: wider, cost, added: cost - job.cost };
  }

  /** When this address may ask again, if it's had its share of this kind of check */
  private limited(address: string, kind: Kind, now: number) {
    const limit = LIMITS[kind];
    if (!limit) return;
    const recent = this.sql
      .exec<{ at: number }>(
        'select at from seen where who = ? and kind = ? and at > ? order by at',
        address,
        kind,
        now - limit.per
      )
      .toArray();
    return recent.length >= limit.most ? recent[0].at + limit.per : undefined;
  }

  /** Lets a whole ticket in or none of it, and a wider ask for a waiting check counts as a fresh one */
  async admit({ kind, who, checks }: Ticket): Promise<Admission> {
    const jobs = this.jobs();
    const changes = checks.map((check) => {
      const job = jobs.find((waiting) => waiting.id === check.id);
      const seq: number | undefined = job?.seq;
      return job ? { ...this.widened(job, check), seq } : { ...check, added: check.cost, seq };
    });
    const extra = changes.reduce((sum, change) => sum + Math.max(change.added, 0), 0);
    const now = Date.now();
    const address = await this.who(who);
    this.sql.exec('delete from seen where at < ?', now - DAY);
    if (extra > 0) {
      const retryAt = this.limited(address, kind, now);
      if (retryAt) return { ok: false, reason: 'limited', retryAt };
      const queued = jobs.reduce((sum, job) => sum + this.remaining(job), 0);
      const over = (queued + extra) * this.interval(now) - LINE_MS;
      if (over > 0) return { ok: false, reason: 'busy', retryAt: now + over };
      this.sql.exec('insert into seen (who, kind, at) values (?, ?, ?)', address, kind, now);
    }
    for (const { id, plan, cost, seq } of changes) {
      const saved = JSON.stringify(plan);
      if (seq === undefined) {
        this.sql.exec(
          'insert into line (id, plan, cost, added) values (?, ?, ?, ?)',
          id,
          saved,
          cost,
          now
        );
      } else {
        this.sql.exec('update line set plan = ?, cost = ? where seq = ?', saved, cost, seq);
      }
    }
    await this.wake();
    return { ok: true };
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

  /** One call to whichever API we've asked least lately, so /health stays honest when it's quiet */
  async canary() {
    const now = Date.now();
    const quiet = now - (this.get('called') ?? 0) > 50 * MINUTE;
    if (!quiet || now < this.due() || this.jobs().length || (await this.ctx.storage.getAlarm())) {
      return;
    }
    const api = (['v4', 'mini'] as const).toSorted(
      (a, b) => (this.get(`tried:${a}`) ?? 0) - (this.get(`tried:${b}`) ?? 0)
    )[0];
    await this.call({ kind: 'count', index: CANARIES[api], span: { hash: '', text: CANARY } });
    // anyone who joined the line during the call shouldn't wait out the whole reservation
    if (this.jobs().length) await this.ctx.storage.setAlarm(this.due());
  }

  async alarm() {
    const due = this.due();
    if (Date.now() < due) return this.ctx.storage.setAlarm(due);
    for (const job of this.jobs()) {
      let step: Step | undefined;
      try {
        step = await this.nextStep(job);
        if (!step) await finishLookup(job.id, (JSON.parse(job.plan) as Plan).indexes);
      } catch (error) {
        await report(error, undefined, 'gate');
        if (Date.now() - job.added < GIVE_UP_MS) {
          return this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
        }
        await finishLookup(job.id).catch((failed: unknown) => report(failed, undefined, 'gate'));
      }
      if (!step) {
        this.sql.exec('delete from line where seq = ?', job.seq);
        continue;
      }
      await this.call(step, job);
      return this.ctx.storage.setAlarm(this.due());
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

  /** Makes one call and books the next slot, whether it worked or not */
  private async call(step: Step, job?: Job) {
    const query = step.span.text ?? '';
    const api = byIndex(step.index)?.api ?? 'v4';
    const now = Date.now();
    this.set('called', now);
    this.set(`tried:${api}`, now);
    this.set('next', now + CALL_MS);
    try {
      if (step.kind === 'count') {
        const found = await count(step.index, query);
        if (job) await saveCount(step.index, step.span.hash, found);
      } else {
        await saveDocs(step.index, step.span.hash, await documents(step.index, query));
      }
      this.set(`ok:${api}`, Date.now());
      if (job) this.sql.exec('update line set calls = calls + 1, tries = 0 where seq = ?', job.seq);
    } catch (error) {
      await report(error, undefined, 'gate');
      if (error instanceof Throttled) {
        this.set('paused', Date.now() + PAUSE_MS);
        this.set('slow', Date.now() + PAUSE_MS + SLOW_MS);
      } else if (job) {
        this.giveUpAfterTries(job, `${step.kind} ${key(step.index, step.span.hash)}`);
      }
    } finally {
      this.set('next', Date.now() + this.interval());
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
