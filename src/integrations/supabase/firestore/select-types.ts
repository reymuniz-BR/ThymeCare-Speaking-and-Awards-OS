/**
 * Type-level model of the PostgREST `select()` mini-language, driven by the
 * generated Supabase `Database` type. It understands the forms the app uses:
 *
 *   "*"  ·  "a, b"  ·  "*, rel(*)"  ·  "rel(a, b)"  ·  "a(b(c))"
 *   "alias:fk_column(cols)"  ·  "rel!hint(cols)"
 *
 * Relations resolve exactly as the runtime does (see ./select-parse.ts):
 * an FK column on this table (many-to-one), a table this one points at
 * (many-to-one), or a table that points back at this one (one-to-many).
 */
import type { Database } from "../types.ts";
import type { TableName } from "./schema.generated.ts";

type Tables = Database["public"]["Tables"];

export type Row<T extends TableName> = Tables[T]["Row"];
export type InsertRow<T extends TableName> = Tables[T]["Insert"];
export type UpdateRow<T extends TableName> = Tables[T]["Update"];
export type ColumnOf<T extends TableName> = keyof Row<T> & string;

type Rel<T extends TableName> = Tables[T]["Relationships"][number];
type Whitespace = " " | "\n" | "\t" | "\r";

type Trim<S extends string> = S extends `${Whitespace}${infer R}`
  ? Trim<R>
  : S extends `${infer R}${Whitespace}`
    ? Trim<R>
    : S;

/** Split on commas that are not nested inside parentheses. */
type SplitTop<
  S extends string,
  Cur extends string = "",
  Depth extends unknown[] = [],
  Out extends string[] = [],
> = S extends `${infer C}${infer Rest}`
  ? C extends "("
    ? SplitTop<Rest, `${Cur}${C}`, [...Depth, 0], Out>
    : C extends ")"
      ? SplitTop<Rest, `${Cur}${C}`, Depth extends [0, ...infer D] ? D : [], Out>
      : C extends ","
        ? Depth extends []
          ? SplitTop<Rest, "", Depth, Cur extends "" ? Out : [...Out, Trim<Cur>]>
          : SplitTop<Rest, `${Cur}${C}`, Depth, Out>
        : SplitTop<Rest, `${Cur}${C}`, Depth, Out>
  : Trim<Cur> extends ""
    ? Out
    : [...Out, Trim<Cur>];

type Alias<H extends string> = H extends `${infer A}:${string}` ? A : never;
type AfterAlias<H extends string> = H extends `${string}:${infer B}` ? B : H;
type NameOf<H extends string> = AfterAlias<H> extends `${infer N}!${string}` ? N : AfterAlias<H>;
type HintOf<H extends string> =
  AfterAlias<H> extends `${string}!${infer X}` ? (X extends "inner" | "left" ? "" : X) : "";

type FwdByColumn<T extends TableName, C extends string> = Extract<
  Rel<T>,
  { columns: readonly [C] }
>;
type FwdByTable<T extends TableName, N extends string> = Extract<Rel<T>, { referencedRelation: N }>;
type RevByTable<T extends TableName, N extends TableName> = Extract<
  Rel<N>,
  { referencedRelation: T }
>;

type FkNullable<T extends TableName, R> = R extends {
  columns: readonly [infer C extends keyof Row<T>];
}
  ? null extends Row<T>[C]
    ? true
    : false
  : true;

type ResolveRel<T extends TableName, Key extends string> = [FwdByColumn<T, Key>] extends [never]
  ? Key extends TableName
    ? [FwdByTable<T, Key>] extends [never]
      ? [RevByTable<T, Key>] extends [never]
        ? never
        : {
            kind: "many";
            table: Key;
            single: RevByTable<T, Key> extends { isOneToOne: true } ? true : false;
          }
      : { kind: "one"; table: Key; nullable: FkNullable<T, FwdByTable<T, Key>> }
    : never
  : {
      kind: "one";
      table: FwdByColumn<T, Key>["referencedRelation"];
      nullable: FkNullable<T, FwdByColumn<T, Key>>;
    };

type RelField<
  T extends TableName,
  Head extends string,
  Sub extends string,
  Name extends string = NameOf<Head>,
  Hint extends string = HintOf<Head>,
  Key extends string = Hint extends "" ? Name : Hint,
  As extends string = [Alias<Head>] extends [never] ? Name : Alias<Head>,
> = [ResolveRel<T, Key>] extends [never]
  ? { [K in As]: never }
  : ResolveRel<T, Key> extends {
        kind: "one";
        table: infer U extends TableName;
        nullable: infer N;
      }
    ? { [K in As]: N extends true ? SelectResult<U, Sub> | null : SelectResult<U, Sub> }
    : ResolveRel<T, Key> extends {
          kind: "many";
          table: infer U extends TableName;
          single: infer S;
        }
      ? { [K in As]: S extends true ? SelectResult<U, Sub> | null : SelectResult<U, Sub>[] }
      : never;

type ItemResult<T extends TableName, I extends string> = I extends "*"
  ? Row<T>
  : I extends `${infer Head}(${infer Rest}`
    ? Rest extends `${infer Sub})`
      ? RelField<T, Trim<Head>, Sub>
      : never
    : I extends keyof Row<T>
      ? Pick<Row<T>, I>
      : I extends `${infer A}:${infer C}`
        ? C extends keyof Row<T>
          ? { [K in A]: Row<T>[C] }
          : { [K in A]: unknown }
        : { [K in I]: unknown };

type Merge<T extends TableName, Items extends string[]> = Items extends [
  infer H extends string,
  ...infer R extends string[],
]
  ? ItemResult<T, H> & Merge<T, R>
  : unknown;

type Flatten<X> = { [K in keyof X]: X[K] } & {};

/** The row shape returned by `.select(S)` on table T. */
export type SelectResult<T extends TableName, S extends string> = string extends S
  ? Record<string, unknown>
  : Flatten<Merge<T, SplitTop<S>>>;
