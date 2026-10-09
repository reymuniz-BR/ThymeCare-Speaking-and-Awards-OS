/**
 * Compile-time checks for the select-string types. Nothing runs: `tsc` fails
 * if the parser stops resolving the shapes the app depends on.
 */
import type { Row, SelectResult } from "./select-types.ts";

type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// "*" is the row; a column list is a Pick.
export type Star = Expect<Equal<SelectResult<"speakers", "*">, Row<"speakers">>>;
export type Cols = Expect<
  Equal<
    SelectResult<"allowed_emails", "id,email,note">,
    Pick<Row<"allowed_emails">, "id" | "email" | "note">
  >
>;

// To-one through the referenced table name (submissions -> opportunities).
export type ToOne = Expect<
  Equal<
    SelectResult<"submissions", "id, opportunities(id, name)">,
    { id: string; opportunities: Pick<Row<"opportunities">, "id" | "name"> }
  >
>;

// Nested, mixed to-one/to-one (the draft.functions.ts shape).
type Nested = SelectResult<
  "submission_fields",
  "id, prompt, submissions(title, opportunities(name, type))"
>;
export type NestedOk = Expect<
  Equal<Nested["submissions"]["opportunities"], Pick<Row<"opportunities">, "name" | "type">>
>;

// To-many (opportunities -> opportunity_dates), alongside "*".
type Many = SelectResult<"opportunities", "*, opportunity_dates(*), submissions(*)">;
export type ManyOk = Expect<Equal<Many["opportunity_dates"], Row<"opportunity_dates">[]>>;
export type ManyKeepsStar = Expect<Equal<Many["name"], string>>;

// Aliased FK columns (activity_log.actor_id -> profiles).
type Aliased = SelectResult<
  "activity_log",
  "*, profiles:actor_id(full_name), opportunities:opportunity_id(name)"
>;
export type AliasOk = Expect<Equal<Aliased["profiles"], Pick<Row<"profiles">, "full_name"> | null>>;
export type AliasOk2 = Expect<
  Equal<Aliased["opportunities"], Pick<Row<"opportunities">, "name"> | null>
>;

// Two aliases onto the same table (brief_items).
type Brief = SelectResult<
  "brief_items",
  "*, owner:follow_up_owner_id(full_name), reviewer:reviewed_by(full_name)"
>;
export type TwoAliases = Expect<
  Equal<keyof Pick<Brief, "owner" | "reviewer">, "owner" | "reviewer">
>;
export type OwnerNullable = Expect<
  Equal<Brief["owner"], Pick<Row<"profiles">, "full_name"> | null>
>;

// Unknown relations resolve to never (so misuse is a type error downstream).
type Bogus = SelectResult<"speakers", "id, nope(id)">;
export type BogusNever = Expect<Equal<Bogus["nope"], never>>;

// Non-literal strings degrade to a generic record, not any.
export type Dynamic = Expect<Equal<SelectResult<"speakers", string>, Record<string, unknown>>>;
