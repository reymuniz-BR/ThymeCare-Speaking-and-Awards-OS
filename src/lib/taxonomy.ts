import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { asTone, labelize, type ChipTone, type TaxonomyRow } from "@/lib/program";

export function useTaxonomy() {
  return useQuery({
    queryKey: ["taxonomy_options"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TaxonomyRow[]> => {
      const { data, error } = await supabase
        .from("taxonomy_options")
        .select("*")
        .order("kind")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Options for a taxonomy kind, optionally scoped to an opportunity type. */
export function optionsFor(
  rows: TaxonomyRow[] | undefined,
  kind: string,
  appliesTo?: string | null,
): TaxonomyRow[] {
  return (rows ?? [])
    .filter((r) => r.kind === kind && r.is_active)
    .filter((r) => (appliesTo ? r.applies_to === null || r.applies_to === appliesTo : true))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function optionFor(
  rows: TaxonomyRow[] | undefined,
  kind: string,
  value: string | null | undefined,
  appliesTo?: string | null,
): TaxonomyRow | undefined {
  if (!value) return undefined;
  const matches = (rows ?? []).filter((r) => r.kind === kind && r.value === value);
  return matches.find((r) => r.applies_to === appliesTo) ?? matches[0];
}

export function taxonomyLabel(
  rows: TaxonomyRow[] | undefined,
  kind: string,
  value: string | null | undefined,
  appliesTo?: string | null,
): string {
  return optionFor(rows, kind, value, appliesTo)?.label ?? labelize(value);
}

export function taxonomyTone(
  rows: TaxonomyRow[] | undefined,
  kind: string,
  value: string | null | undefined,
  appliesTo?: string | null,
): ChipTone {
  return asTone(optionFor(rows, kind, value, appliesTo)?.tone);
}
