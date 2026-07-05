/**
 * In-memory Prisma stub for characterization tests.
 *
 * Records every call so tests can assert on writes (the observable surface),
 * and behaves like a real Prisma client for the operations the code paths use
 * (create/update/find/findFirst/findUnique/count/updateMany/$transaction).
 *
 * Design principles (see plans/mailops-refactor/phase-0-characterization-tests.md):
 * - Each model is backed by a Map keyed by `id` (or by a unique field for
 *   findUnique, registered per-test via `seedUnique`).
 * - `update` with nested `events: { create: ... }` etc. is supported by
 *   delegating to the related model's store — so the nested writes land where
 *   a test can read them back.
 * - Unknown ops throw — this surfaces missing cases as test failures rather
 *   than silent passes. Add support as the tests demand.
 */
import { randomUUID } from "node:crypto";

export type ModelName =
  | "emailTracking"
  | "emailEvent"
  | "trackedLink"
  | "linkClick"
  | "sequenceStats"
  | "sequenceContact"
  | "sequence"
  | "sequenceStep"
  | "mailbox"
  | "emailWatch"
  | "emailWatchHistory"
  | "processedMessage"
  | "businessHours"
  | "template"
  | "contact"
  | "emailThread"
  | "emailList"
  | "listSyncRecord"
  | "list";

export interface RecordedCall {
  model: ModelName;
  op: string;
  args: any;
}

type Row = Record<string, any> & { id: string };

interface ModelStore {
  rows: Map<string, Row>;
  /** Map of unique field name → Map of value → row id, for findUnique. */
  uniques: Map<string, Map<string, string>>;
}

function makeModelStore(): ModelStore {
  return { rows: new Map(), uniques: new Map() };
}

export interface FakePrisma {
  /** The proxy itself — pass this in place of the real prisma client. */
  prisma: any;
  /** All calls recorded, in order. Reset with `reset()` between tests. */
  calls: RecordedCall[];
  /** Direct access to the in-memory stores for seeding/assertions. */
  stores: Record<ModelName, ModelStore>;
  /** Clear all data + recorded calls. Call in `beforeEach`. */
  reset(): void;
  /** Seed a row + register its unique fields for findUnique lookups. */
  seed(model: ModelName, row: Row, uniqueFields?: string[]): Row;
  /** Register a non-id unique field for findUnique (e.g. `hash` on emailTracking). */
  seedUnique(model: ModelName, field: string, value: string, id: string): void;
}

export function makeFakePrisma(): FakePrisma {
  const calls: RecordedCall[] = [];
  const stores = Object.fromEntries(
    (
      [
        "emailTracking",
        "emailEvent",
        "trackedLink",
        "linkClick",
        "sequenceStats",
        "sequenceContact",
        "sequence",
        "sequenceStep",
        "mailbox",
        "emailWatch",
        "emailWatchHistory",
        "processedMessage",
        "businessHours",
        "template",
        "contact",
        "emailThread",
        "emailList",
        "listSyncRecord",
        "list",
      ] as ModelName[]
    ).map((m) => [m, makeModelStore()])
  ) as Record<ModelName, ModelStore>;

  function record(model: ModelName, op: string, args: any): void {
    calls.push({ model, op, args });
  }

  // ---- per-op handlers -------------------------------------------------

  function handleCreate(model: ModelName, args: any): Row {
    record(model, "create", args);
    // Generated id wins only when the caller didn't provide one (a passed
    // `id: undefined` would otherwise shadow the generated id after spread).
    const data: Row = {
      id: randomUUID(),
      ...args.data,
      ...(args.data?.id ? { id: args.data.id } : {}),
    };
    // Resolve nested creates like { events: { create: {...} } } or
    // { events: { create: [{...},{...}] } } into related model writes.
    // Convention: nested relation name = related model name (Prisma's default).
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === "object" && "create" in val) {
        const related = key as ModelName; // e.g. "events" — see mapping below
        const targetModel = RELATION_TO_MODEL[related] ?? (related as ModelName);
        const createData = (val as any).create;
        if (Array.isArray(createData)) {
          for (const d of createData) seedRow(targetModel, d);
        } else {
          seedRow(targetModel, createData);
        }
        // Keep a shallow reference on the parent row so tests can introspect.
        data[key] = createData;
      }
    }
    seedRow(model, data);
    return data;
  }

  function seedRow(model: ModelName, data: any): Row {
    const store = stores[model];
    const id = data.id ?? randomUUID();
    const row = { ...data, id };
    store.rows.set(id, row);
    // Register default unique: id
    store.uniques.get("id")?.set(id, id);
    registerUnique(model, "id", id, id);
    // Register any other seeded uniques
    if (model === "emailTracking" && data.hash) {
      registerUnique(model, "hash", data.hash, id);
    }
    if (model === "mailbox" && data.email) {
      registerUnique(model, "email", data.email, id);
    }
    if (model === "emailWatch" && data.email) {
      registerUnique(model, "email", data.email, id);
    }
    if (model === "trackedLink" && data.id) {
      registerUnique(model, "id", data.id, id);
    }
    return row;
  }

  function registerUnique(
    model: ModelName,
    field: string,
    value: string,
    id: string
  ): void {
    let m = stores[model].uniques.get(field);
    if (!m) {
      m = new Map();
      stores[model].uniques.set(field, m);
    }
    m.set(String(value), id);
  }

  function handleUpdate(model: ModelName, args: any): Row {
    record(model, "update", args);
    const where = args.where ?? {};
    const id = resolveByWhere(model, where);
    if (!id) {
      // Mimic Prisma: updating a missing record throws.
      throw new Error(`FakePrisma: update on missing ${model} where=${JSON.stringify(where)}`);
    }
    const row = stores[model].rows.get(id)!;
    const data = args.data ?? {};

    // Handle Prisma update operators we care about.
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object") {
        if ("increment" in v) {
          row[k] = (row[k] ?? 0) + (v as any).increment;
          continue;
        }
        if ("decrement" in v) {
          row[k] = (row[k] ?? 0) - (v as any).decrement;
          continue;
        }
        // Nested relation: { events: { create: {...} } } or { links: {...} }
        if ("create" in v) {
          const related = k as ModelName;
          const target = RELATION_TO_MODEL[related] ?? (related as ModelName);
          const createData = (v as any).create;
          const created = Array.isArray(createData)
            ? createData.map((d) => seedRow(target, d))
            : [seedRow(target, createData)];
          // Attach a shallow array reference
          row[k] = Array.isArray(row[k]) ? [...row[k], ...created] : created;
          continue;
        }
      }
      // Plain field assignment
      row[k] = v;
    }
    return row;
  }

  function handleUpdateMany(model: ModelName, args: any): { count: number } {
    record(model, "updateMany", args);
    const where = args.where ?? {};
    let count = 0;
    for (const row of stores[model].rows.values()) {
      if (matchesWhere(row, where)) {
        Object.assign(row, args.data ?? {});
        count++;
      }
    }
    return { count };
  }

  function handleFindUnique(model: ModelName, args: any): Row | null {
    record(model, "findUnique", args ?? {});
    const where = args.where ?? {};
    for (const [field, value] of Object.entries(where)) {
      const m = stores[model].uniques.get(field);
      if (m) {
        const id = m.get(String(value));
        if (id) {
          return applyIncludes(stores[model].rows.get(id)!, args, model);
        }
      }
    }
    return null;
  }

  function handleFindFirst(model: ModelName, args: any): Row | null {
    record(model, "findFirst", args);
    const where = args.where ?? {};
    for (const row of stores[model].rows.values()) {
      if (matchesWhere(row, where)) {
        return applyIncludes(row, args, model);
      }
    }
    return null;
  }

  function handleFindMany(model: ModelName, args: any): Row[] {
    record(model, "findMany", args);
    const where = args.where ?? {};
    const out: Row[] = [];
    for (const row of stores[model].rows.values()) {
      if (matchesWhere(row, where)) out.push(applyIncludes(row, args, model));
    }
    // Basic orderBy support
    const orderBy = args.orderBy;
    if (orderBy && typeof orderBy === "object") {
      for (const [field, dir] of Object.entries(orderBy).reverse()) {
        out.sort((a, b) => {
          const av = a[field];
          const bv = b[field];
          if (av === bv) return 0;
          const cmp = av > bv ? 1 : -1;
          return dir === "desc" ? -cmp : cmp;
        });
      }
    }
    return out;
  }

  function handleCount(model: ModelName, args: any): number {
    record(model, "count", args ?? {});
    const where = args?.where ?? {};
    let n = 0;
    for (const row of stores[model].rows.values()) {
      if (matchesWhere(row, where)) n++;
    }
    return n;
  }

  function handleUpsert(model: ModelName, args: any): Row {
    record(model, "upsert", args ?? {});
    const where = args.where ?? {};
    const id = resolveByWhere(model, where);
    if (id) {
      const row = stores[model].rows.get(id)!;
      const update = args.update?.data ?? args.update ?? {};
      Object.assign(row, update);
      return row;
    }
    // Create path — use `create.data` if present, else `create` itself.
    const createData = args.create?.data ?? args.create ?? {};
    return seedRow(model, { ...createData, ...(where.id ? { id: where.id } : {}) });
  }

  function handleDelete(model: ModelName, args: any): Row {
    record(model, "delete", args ?? {});
    const where = args.where ?? {};
    const id = resolveByWhere(model, where);
    if (id) {
      const row = stores[model].rows.get(id)!;
      stores[model].rows.delete(id);
      return row;
    }
    throw new Error(`FakePrisma: delete on missing ${model}`);
  }

  function handleDeleteMany(model: ModelName, args: any): { count: number } {
    record(model, "deleteMany", args ?? {});
    const where = args.where ?? {};
    let count = 0;
    for (const [id, row] of [...stores[model].rows.entries()]) {
      if (matchesWhere(row, where)) {
        stores[model].rows.delete(id);
        count++;
      }
    }
    return { count };
  }

  // ---- helpers ---------------------------------------------------------

  function resolveByWhere(model: ModelName, where: any): string | undefined {
    if (!where) return undefined;
    // by id
    if (where.id) return stores[model].rows.has(where.id) ? where.id : undefined;
    // by unique field
    for (const [field, value] of Object.entries(where)) {
      const m = stores[model].uniques.get(field);
      if (m && m.has(String(value))) return m.get(String(value));
    }
    // by arbitrary match (fallback)
    for (const [id, row] of stores[model].rows.entries()) {
      if (matchesWhere(row, where)) return id;
    }
    return undefined;
  }

  function matchesWhere(row: Row, where: any): boolean {
    if (!where || Object.keys(where).length === 0) return true;
    for (const [key, cond] of Object.entries(where)) {
      // Operators
      if (key === "AND" && Array.isArray(cond)) {
        if (!cond.every((c) => matchesWhere(row, c))) return false;
        continue;
      }
      if (key === "OR" && Array.isArray(cond)) {
        if (!cond.some((c) => matchesWhere(row, c))) return false;
        continue;
      }
      const rowVal = row[key];
      if (cond && typeof cond === "object") {
        // Operator objects: { in }, { not }, { notIn }, { gte/lte/gt/lt }.
        // A condition may combine multiple operators (e.g. { lte, not }).
        if (
          "in" in cond ||
          "notIn" in cond ||
          "not" in cond ||
          "gte" in cond ||
          "lte" in cond ||
          "gt" in cond ||
          "lt" in cond
        ) {
          if ("in" in cond) {
            if (!Array.isArray(cond.in) || !cond.in.includes(rowVal))
              return false;
          }
          if ("notIn" in cond) {
            if (Array.isArray(cond.notIn) && cond.notIn.includes(rowVal))
              return false;
          }
          if ("not" in cond) {
            if (rowVal === cond.not) return false;
          }
          if ("gte" in cond) {
            if (!(rowVal != null && rowVal >= (cond.gte as any))) return false;
          }
          if ("lte" in cond) {
            if (!(rowVal != null && rowVal <= (cond.lte as any))) return false;
          }
          if ("gt" in cond) {
            if (!(rowVal != null && rowVal > (cond.gt as any))) return false;
          }
          if ("lt" in cond) {
            if (!(rowVal != null && rowVal < (cond.lt as any))) return false;
          }
          continue;
        }
        // Nested relation filter: { sequence: { status: X } } — recurse into
        // the related row/object attached to this row.
        if (rowVal && typeof rowVal === "object") {
          if (!matchesWhere(rowVal, cond)) return false;
          continue;
        }
        // Condition object but row value is not an object — can't match.
        return false;
      }
      if (rowVal !== cond) return false;
    }
    return true;
  }

  function applyIncludes(row: Row, args: any, model: ModelName): Row {
    const include = args?.include;
    if (!include) return row;
    // For each included relation, attach the related rows. We use the
    // convention from RELATION_TO_MODEL to find them.
    const result = { ...row };
    for (const [rel, condRaw] of Object.entries(include)) {
      const cond = condRaw as any;
      const target = RELATION_TO_MODEL[rel] ?? (rel as ModelName);
      if (target === "emailEvent" && (model === "emailTracking" || model === "sequence")) {
        const fkField = model === "emailTracking" ? "trackingId" : "sequenceId";
        let events = [...stores.emailEvent.rows.values()].filter(
          (e) => e[fkField] === row.id
        );
        // Support `events: { where: { type } }`
        if (cond && typeof cond === "object" && cond.where) {
          events = events.filter((e) => matchesWhere(e, cond.where));
        }
        result[rel] = events;
        continue;
      }
      if (target === "trackedLink" && model === "emailTracking") {
        const links = [...stores.trackedLink.rows.values()].filter(
          (l) => l.emailTrackingId === row.id
        );
        let filtered = links;
        if (cond && typeof cond === "object" && cond.where) {
          filtered = links.filter((l) => matchesWhere(l, cond.where));
        }
        result[rel] = filtered;
        continue;
      }
      if ((target as string) === "aliases" || rel === "aliases") {
        // mailbox.aliases — not in our model list; skip (tests seed manually)
        continue;
      }
      if (rel === "contact" && target === "contact") {
        // sequenceContact.contact — skip (tests seed manually)
        continue;
      }
      if (rel === "sequence") {
        const seq = stores.sequence.rows.get(row.sequenceId ?? "");
        result[rel] = seq ?? null;
        continue;
      }
      if (rel === "businessHours") {
        const bh = [...stores.businessHours.rows.values()].find(
          (b) => b.sequenceId === row.id
        );
        result[rel] = bh ?? null;
        continue;
      }
    }
    return result;
  }

  // Relation-name → model-name mapping. Prisma's default relation field name
  // is the plural/camelCase of the related model, but the codebase uses
  // specific names — capture them here.
  const RELATION_TO_MODEL: Record<string, ModelName> = {
    events: "emailEvent",
    event: "emailEvent",
    links: "trackedLink",
    contact: "contact",
    sequence: "sequence",
    sequenceStep: "sequenceStep",
    emailTracking: "emailTracking",
  };

  // ---- build the proxy -------------------------------------------------

  /** Build a plain (non-Proxy) handler for a given model. */
  function makeModelHandler(model: string): ProxyHandler<Record<string, any>> {
    return {
      get(_: any, op: string) {
        // Symbol properties (then, Symbol.toPrimitive, etc.) — return
        // undefined so the proxy isn't mistaken for a thenable / primitive.
        if (typeof op !== "string") return undefined;
        return (args: any) => {
          const m = model as ModelName;
          switch (op) {
            case "create":
              return handleCreate(m, args ?? {});
            case "update":
              return handleUpdate(m, args ?? {});
            case "updateMany":
              return handleUpdateMany(m, args ?? {});
            case "findUnique":
              return handleFindUnique(m, args ?? {});
            case "findFirst":
              return handleFindFirst(m, args ?? {});
            case "findMany":
              return handleFindMany(m, args ?? {});
                case "count":
                  return handleCount(m, args ?? {});
                case "upsert":
                  return handleUpsert(m, args ?? {});
                case "delete":
                  return handleDelete(m, args ?? {});
                case "deleteMany":
                  return handleDeleteMany(m, args ?? {});
                case "aggregate":
              // Minimal shape so callers reading fields don't crash.
              record(m, "aggregate", args ?? {});
              return { _count: {} };
            case "groupBy":
              record(m, "groupBy", args ?? {});
              return [];
            default:
              throw new Error(
                `FakePrisma: unsupported op prisma.${model}.${op}(…) — add it to fake-prisma.ts`
              );
          }
        };
      },
    };
  }

  // Cache model proxies so repeated access (e.g. prisma.emailTracking.update
  // then prisma.emailTracking.create) returns the same model proxy per model.
  const modelProxyCache = new Map<string, any>();

  const prisma = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      record("$transaction" as any, "$transaction", {});
      return fn(prismaProxy);
    },
  };

  // Wrap prisma in a proxy that returns a per-model proxy lazily.
  const prismaProxy = new Proxy(prisma, {
    get(target: any, prop: string) {
      if (typeof prop !== "string") return undefined;
      if (prop === "$transaction") return target.$transaction;
      if (prop === "then") return undefined; // not thenable
      let cached = modelProxyCache.get(prop);
      if (!cached) {
        cached = new Proxy({}, makeModelHandler(prop));
        modelProxyCache.set(prop, cached);
      }
      return cached;
    },
  });

  function reset(): void {
    calls.length = 0;
    for (const store of Object.values(stores)) {
      store.rows.clear();
      store.uniques.clear();
    }
  }

  function seed(model: ModelName, row: Row, uniqueFields: string[] = []): Row {
    const r = seedRow(model, row);
    for (const f of uniqueFields) {
      if (row[f] != null) registerUnique(model, f, String(row[f]), r.id);
    }
    return r;
  }

  function seedUnique(
    model: ModelName,
    field: string,
    value: string,
    id: string
  ): void {
    registerUnique(model, field, value, id);
  }

  return { prisma: prismaProxy, calls, stores, reset, seed, seedUnique };
}
