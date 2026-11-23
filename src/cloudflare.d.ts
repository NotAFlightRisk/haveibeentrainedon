// the slice of the Workers runtime we use, as @cloudflare/workers-types fights the DOM ones

interface D1Result<T = unknown> {
  results: T[];
  meta: { rows_read: number; rows_written: number; changes: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): { toArray(): T[] };
}

interface DurableObjectState {
  storage: {
    sql: SqlStorage;
    getAlarm(): Promise<number | null>;
    setAlarm(when: number): Promise<void>;
  };
}

interface DurableObjectNamespace<T> {
  getByName(name: string): T;
}

interface ExportedHandler<Env> {
  fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>;
}

declare namespace Cloudflare {
  interface Env {}
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
  export function waitUntil(work: Promise<unknown>): void;
  export abstract class DurableObject {
    protected ctx: DurableObjectState;
    protected env: Cloudflare.Env;
    constructor(ctx: DurableObjectState, env: Cloudflare.Env);
  }
}
