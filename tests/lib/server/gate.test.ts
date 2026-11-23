import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETS } from '#lib/corpora.ts';
import { Gate, type Ticket } from '#lib/server/gate.ts';
import { count } from '#lib/server/infinigram.ts';
import { loadCounts } from '#lib/server/store.ts';

vi.mock('#lib/server/infinigram.ts', () => ({
  count: vi.fn(async () => 3),
  documents: vi.fn(async () => []),
  Throttled: class Throttled extends Error {}
}));
vi.mock('#lib/server/store.ts', () => ({
  loadCounts: vi.fn(async () => new Map()),
  loadDocs: vi.fn(async () => new Map()),
  saveCount: vi.fn(),
  saveDocs: vi.fn(),
  finishLookup: vi.fn()
}));
vi.mock('#lib/server/report.ts', () => ({ report: vi.fn() }));

// a Durable Object's storage, over node's own SQLite, with the alarm kept to hand
function fakeState() {
  const db = new DatabaseSync(':memory:');
  const state = {
    alarm: null as number | null,
    blockConcurrencyWhile: (work: () => Promise<unknown>) => work(),
    storage: {
      sql: {
        exec: (query: string, ...values: unknown[]) => {
          const rows = db.prepare(query).all(...(values as never[]));
          return { toArray: () => rows };
        }
      },
      getAlarm: async () => state.alarm,
      setAlarm: async (when: number) => {
        state.alarm = when;
      }
    }
  };
  return state;
}

const spans = ['a', 'b', 'c'].map((hash) => ({ hash, text: `span ${hash}` }));
const ticket = (id: string, who = '1.2.3.4'): Ticket => ({
  id,
  plan: { spans, indexes: [SETS[0].index] },
  cost: 20,
  kind: 'url',
  who
});

describe('Gate', () => {
  let state: ReturnType<typeof fakeState>;
  let gate: Gate;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-23T12:00:00Z') });
    vi.mocked(count).mockClear();
    state = fakeState();
    gate = new Gate(state as never, {} as never);
  });

  afterEach(() => vi.useRealTimers());

  it('takes a check, wakes itself and says nobody is ahead', async () => {
    expect(await gate.admit(ticket('one'))).toEqual({ ok: true, ahead: 0, wait: 0 });
    expect(state.alarm).toBe(Date.now());
  });

  it("doesn't reset a check that's already in the line", async () => {
    await gate.admit(ticket('one'));
    await gate.alarm();
    const again = await gate.admit({ ...ticket('one'), plan: { spans: [], indexes: [] } });
    expect(again.ok).toBe(true);
    expect((await gate.place('one'))?.ahead).toBe(0);
    expect(state.storage.sql.exec('select calls from line').toArray()).toEqual([{ calls: 1 }]);
  });

  it('folds a wider ask for a waiting check into its plan instead of dropping it', async () => {
    await gate.admit(ticket('one'));
    const wider = { ...ticket('one'), plan: { spans, indexes: [SETS[0].index, SETS[1].index] } };
    expect((await gate.admit(wider)).ok).toBe(true);
    const [job] = state.storage.sql.exec('select plan from line').toArray() as { plan: string }[];
    expect(JSON.parse(job.plan).indexes).toEqual([SETS[0].index, SETS[1].index]);
  });

  it('turns away the sixth fresh check from one address in an hour', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await gate.admit({ ...ticket(id), cost: 1 });
    const sixth = await gate.admit({ ...ticket('f'), cost: 1 });
    expect(sixth).toMatchObject({ ok: false, reason: 'limited' });
    expect((await gate.admit({ ...ticket('g', '5.6.7.8'), cost: 1 })).ok).toBe(true);
  });

  it('turns everyone away once the line holds ten minutes of calls', async () => {
    await gate.admit({ ...ticket('big', '9.9.9.9'), cost: 290 });
    const refused = await gate.admit(ticket('late'));
    expect(refused).toMatchObject({ ok: false, reason: 'busy' });
    if (!refused.ok) expect(refused.retryAt).toBe(Date.now() + (290 + 20) * 2_000 - 600_000);
  });

  it('makes one call per alarm and books the next one two seconds on', async () => {
    await gate.admit(ticket('one'));
    await gate.alarm();
    expect(count).toHaveBeenCalledTimes(1);
    expect(state.alarm).toBe(Date.now() + 2_000);
  });

  it('never calls early, even when an alarm turns up before its time', async () => {
    await gate.admit(ticket('one'));
    await gate.alarm();
    const booked = state.alarm;
    await gate.alarm();
    expect(count).toHaveBeenCalledTimes(1);
    expect(state.alarm).toBe(booked);
  });

  it("holds the line while the canary's call is out, so nothing overlaps it", async () => {
    let finish = () => {};
    vi.mocked(count).mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve(1)))
    );
    const started = Date.now();
    const canary = gate.canary();
    await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(1));
    await gate.admit(ticket('one'));
    expect(state.alarm).toBeGreaterThanOrEqual(started + 30_000);
    finish();
    await canary;
    expect(state.alarm).toBe(Date.now() + 2_000);
  });

  it("lets the canary go only when it's been quiet for a while, one call at a time", async () => {
    await gate.canary();
    expect(count).toHaveBeenCalledTimes(1);
    await gate.canary();
    expect(count).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(51 * 60_000);
    await gate.canary();
    const asked = vi.mocked(count).mock.calls.map(([index]) => index);
    expect(new Set(asked).size).toBe(2);
  });

  it('finishes a check once the plan has nothing left to ask, then moves on', async () => {
    vi.mocked(loadCounts).mockResolvedValue(
      new Map(
        ['v2_cc-2025-05', SETS[0].index].flatMap((index) =>
          spans.map(({ hash }) => [`${index} ${hash}`, 0])
        )
      )
    );
    await gate.admit(ticket('one'));
    await gate.alarm();
    expect(await gate.place('one')).toBeNull();
    expect(count).not.toHaveBeenCalled();
    vi.mocked(loadCounts).mockResolvedValue(new Map());
  });
});
