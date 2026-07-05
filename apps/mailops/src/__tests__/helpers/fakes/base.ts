/**
 * Shared base for the Phase 7 per-repo fakes.
 *
 * Each fake implements its repository interface with in-memory `Map`s. They
 * record every call (so tests can assert "markSent was called once with these
 * args") and behave like a real repository (so tests can seed state and read
 * it back). This base provides the call-recording + reset plumbing; the
 * per-repo files add the actual method implementations.
 *
 * Reuses the in-memory patterns from the Phase 0 `fake-prisma.ts` harness but
 * presents them as proper `*Repository`-typed objects (so the domain services
 * can take them via constructor injection — no module mocking).
 */
import { randomUUID } from "node:crypto";

export interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * In-memory store backing one repository fake. The row type need not carry an
 * `id` field — callers pass an explicit key when setting/getting (e.g. the
 * email-thread fake keys by `threadId`, sequence-stats by `sequenceId`).
 */
export class MemoryStore<T extends Record<string, any>> {
  rows = new Map<string, T>();
  /** Secondary index: field name → (value → key). */
  private indexes = new Map<string, Map<string, string>>();

  /** Insert/replace a row under `key`. Returns the row. */
  set(key: string, row: T): T;
  /** Convenience overload: row carries its own `id` field. */
  set(row: T & { id: string }): T;
  set(keyOrRow: string | (T & { id: string }), row?: T): T {
    if (row === undefined) {
      const r = keyOrRow as T & { id: string };
      this.rows.set(r.id, r);
      this.index("id", r.id, r.id);
      return r;
    }
    this.rows.set(keyOrRow as string, row);
    return row;
  }

  get(key: string): T | undefined {
    return this.rows.get(key);
  }

  /** Register a secondary unique index for lookups. */
  index(field: string, value: string, id: string): void {
    let m = this.indexes.get(field);
    if (!m) {
      m = new Map();
      this.indexes.set(field, m);
    }
    m.set(value, id);
  }

  /** Find a row by an indexed field (e.g. `hash`). */
  findByIndexed(field: string, value: string): T | undefined {
    const id = this.indexes.get(field)?.get(value);
    return id ? this.rows.get(id) : undefined;
  }

  /** All rows matching a predicate. */
  filter(pred: (row: T) => boolean): T[] {
    return [...this.rows.values()].filter(pred);
  }

  clear(): void {
    this.rows.clear();
    this.indexes.clear();
  }
}

/** Base class for repo fakes — manages the call log + a `reset()`. */
export abstract class FakeBase {
  calls: RecordedCall[] = [];

  /** Record a method call (called at the top of each fake method). */
  protected record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  /** Clear the call log. Subclasses override to also clear their stores. */
  reset(): void {
    this.calls.length = 0;
  }
}

/** Generate a stable-ish id for created rows (tests rarely care about the value). */
export function genId(prefix = "id"): string {
  return `${prefix}-${randomUUID()}`;
}
