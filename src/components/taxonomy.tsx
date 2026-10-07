import { Chip } from "@/components/chip";
import { useTaxonomy, taxonomyLabel, taxonomyTone, optionsFor } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export function TaxonomyChip({
  kind,
  value,
  appliesTo,
  className,
}: {
  kind: string;
  value: string | null | undefined;
  appliesTo?: string | null | undefined;
  className?: string | undefined;
}) {
  const { data: rows } = useTaxonomy();
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Chip tone={taxonomyTone(rows, kind, value, appliesTo)} className={className}>
      {taxonomyLabel(rows, kind, value, appliesTo)}
    </Chip>
  );
}

export function StatusBadge({
  status,
  type,
  className,
}: {
  status: string | null | undefined;
  type?: string | null | undefined;
  className?: string | undefined;
}) {
  return <TaxonomyChip kind="status" value={status} appliesTo={type} className={className} />;
}

/** A select driven by the configurable taxonomy table. */
export function TaxonomySelect({
  kind,
  appliesTo,
  value,
  onChange,
  allowEmpty,
  emptyLabel = "—",
  includeAll,
  className,
}: {
  kind: string;
  appliesTo?: string | null | undefined;
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  includeAll?: boolean;
  className?: string | undefined;
}) {
  const { data: rows } = useTaxonomy();
  const options = optionsFor(rows, kind, appliesTo);
  const known = options.some((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground",
        className,
      )}
    >
      {includeAll ? <option value="all">All</option> : null}
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {!known && value && value !== "all" ? <option value={value}>{value}</option> : null}
      {options.map((o) => (
        <option key={o.id} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
