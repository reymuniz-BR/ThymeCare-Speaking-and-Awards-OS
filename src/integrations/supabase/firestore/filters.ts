/**
 * In-memory PostgREST filter, ordering and projection semantics.
 *
 * Firestore can only push down a narrow slice of what the app asks for
 * (and silently drops documents that lack an ordered field), so the backends
 * push down equality filters only and everything else is evaluated here, with
 * SQL's NULL rules.
 */
import { DbError } from "./errors.ts";

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in" | "contains";

export type Filter = {
  column: string;
  op: FilterOp;
  value: unknown;
  /** `.not(...)`: negate with SQL three-valued logic. */
  negate?: boolean;
};

export type Order = { column: string; ascending: boolean; nullsFirst: boolean };

export type Json = Record<string, unknown>;

const ISO_TS = /^\d{4}-\d{2}-\d{2}T/;

function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

/** -1 / 0 / 1 for two non-null values of the same column. */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") {
    if (ISO_TS.test(a) && ISO_TS.test(b)) {
      const ta = Date.parse(a);
      const tb = Date.parse(b);
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta < tb ? -1 : ta > tb ? 1 : 0;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === "string" && typeof b === "string" && ISO_TS.test(a) && ISO_TS.test(b)) {
    return compareValues(a, b) === 0;
  }
  return a === b;
}

function testOne(value: unknown, op: FilterOp, operand: unknown): boolean {
  switch (op) {
    case "eq":
      return valuesEqual(value, operand);
    case "neq":
      return !valuesEqual(value, operand);
    case "gt":
      return compareValues(value, operand) > 0;
    case "gte":
      return compareValues(value, operand) >= 0;
    case "lt":
      return compareValues(value, operand) < 0;
    case "lte":
      return compareValues(value, operand) <= 0;
    case "in":
      return Array.isArray(operand) && operand.some((o) => valuesEqual(value, o));
    case "contains":
      return (
        Array.isArray(value) &&
        Array.isArray(operand) &&
        operand.every((o) => value.some((v) => valuesEqual(v, o)))
      );
    case "is":
      return operand === null ? isNil(value) : value === operand;
  }
}

export function matchesFilter(row: Json, f: Filter): boolean {
  const value = row[f.column];
  if (f.op === "is") {
    const hit = testOne(value, "is", f.value);
    return f.negate ? !hit : hit;
  }
  // SQL: any comparison against NULL is unknown, i.e. the row is excluded,
  // with or without NOT.
  if (isNil(value)) return false;
  const hit = testOne(value, f.op, f.value);
  return f.negate ? !hit : hit;
}

export function matchesAll(row: Json, filters: readonly Filter[]): boolean {
  return filters.every((f) => matchesFilter(row, f));
}

/** Stable multi-column sort with Postgres null placement. */
export function sortRows<R extends Json>(rows: R[], orders: readonly Order[]): R[] {
  if (orders.length === 0) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      for (const o of orders) {
        const a = x.row[o.column];
        const b = y.row[o.column];
        const an = isNil(a);
        const bn = isNil(b);
        if (an && bn) continue;
        if (an || bn) return (an ? -1 : 1) * (o.nullsFirst ? 1 : -1);
        const cmp = compareValues(a, b);
        if (cmp !== 0) return o.ascending ? cmp : -cmp;
      }
      return x.index - y.index;
    })
    .map((x) => x.row);
}

/**
 * Parse PostgREST's `in` operand used by `.not(col, "in", "(a,b)")`.
 * Also accepts a real array.
 */
export function parseInList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") {
    throw new DbError(`Invalid "in" list: ${String(value)}`, "PGRST100");
  }
  const inner = value.trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!inner) return [];
  return inner.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
}
