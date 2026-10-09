/**
 * Runtime half of the select mini-language (the types live in select-types.ts):
 * parse the string, and resolve each embedded relation against the schema
 * with the same precedence the types use.
 */
import { DbError, UNKNOWN_RELATIONSHIP } from "./errors.ts";
import { TABLE_SCHEMA, type ForeignKey, type TableName } from "./schema.generated.ts";

export type SelectNode =
  | { kind: "star" }
  | { kind: "column"; column: string; as: string }
  | {
      kind: "relation";
      /** Key in the result object (the alias, else the relation name). */
      as: string;
      name: string;
      hint: string;
      children: SelectNode[];
    };

function splitTop(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseSelect(input: string): SelectNode[] {
  return splitTop(input).map((raw): SelectNode => {
    if (raw === "*") return { kind: "star" };
    const open = raw.indexOf("(");
    if (open === -1) {
      const [as, column] = raw.includes(":") ? (raw.split(":") as [string, string]) : [raw, raw];
      return { kind: "column", column: column.trim(), as: as.trim() };
    }
    if (!raw.endsWith(")")) throw new DbError(`Malformed select: ${raw}`, "PGRST100");
    let head = raw.slice(0, open).trim();
    const children = parseSelect(raw.slice(open + 1, -1));
    let alias = "";
    const colon = head.indexOf(":");
    if (colon !== -1) {
      alias = head.slice(0, colon).trim();
      head = head.slice(colon + 1).trim();
    }
    let hint = "";
    const bang = head.indexOf("!");
    if (bang !== -1) {
      const h = head.slice(bang + 1).trim();
      head = head.slice(0, bang).trim();
      if (h !== "inner" && h !== "left") hint = h;
    }
    return { kind: "relation", as: alias || head, name: head, hint, children };
  });
}

export type ResolvedRelation =
  | {
      /** This row holds the FK: fetch the target by `targetColumn`. */
      kind: "to-one";
      table: TableName;
      localColumn: string;
      targetColumn: string;
    }
  | {
      /** The target holds the FK back at this row. */
      kind: "to-many";
      table: TableName;
      /** FK column on the target. */
      foreignColumn: string;
      /** Referenced column on this table (usually `id`). */
      localColumn: string;
      /** True when the FK is unique, so the embed is a single object. */
      single: boolean;
    };

export function resolveRelation(
  from: TableName,
  node: Extract<SelectNode, { kind: "relation" }>,
): ResolvedRelation {
  const key = node.hint || node.name;
  const own: readonly ForeignKey[] = TABLE_SCHEMA[from].relationships;

  const byColumn = own.find((r) => r.columns.length === 1 && r.columns[0] === key);
  if (byColumn) {
    return {
      kind: "to-one",
      table: byColumn.referencedRelation,
      localColumn: byColumn.columns[0]!,
      targetColumn: byColumn.referencedColumns[0]!,
    };
  }

  if (key in TABLE_SCHEMA) {
    const target = key as TableName;
    const forward = own.find((r) => r.referencedRelation === target);
    if (forward) {
      return {
        kind: "to-one",
        table: target,
        localColumn: forward.columns[0]!,
        targetColumn: forward.referencedColumns[0]!,
      };
    }
    const targetFks: readonly ForeignKey[] = TABLE_SCHEMA[target].relationships;
    const reverse = targetFks.find((r) => r.referencedRelation === from);
    if (reverse) {
      return {
        kind: "to-many",
        table: target,
        foreignColumn: reverse.columns[0]!,
        localColumn: reverse.referencedColumns[0]!,
        single: reverse.isOneToOne,
      };
    }
  }

  throw new DbError(
    `Could not find a relationship between '${from}' and '${node.name}'`,
    UNKNOWN_RELATIONSHIP,
  );
}
