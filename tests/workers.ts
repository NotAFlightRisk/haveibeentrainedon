// what the Workers runtime would hand over, for tests that never touch a real binding
export const env: Record<string, unknown> = {};
export function waitUntil() {}
export class DurableObject {
  constructor(
    protected ctx: unknown,
    protected env: unknown
  ) {}
}
