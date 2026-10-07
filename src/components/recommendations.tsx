/**
 * Question-level content recommendations.
 *
 * For a single application question this ranks everything reusable the
 * program holds — prior submission answers, approved messaging snippets,
 * proof points and metrics, executive bios and Drive source files — and lets
 * the writer pull the language straight into the draft. Reuse is recorded on
 * the field (reused_from_field_id / reused_from_asset_id) and counted on the
 * library entry, so "what did we reuse" stops being invisible.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/program";
import { SOURCE_KIND_LABEL, isStale } from "@/lib/strategy";
import { recommendForField } from "@/lib/recommend.functions";
import type { RecommendedSource } from "@/lib/recommend.functions";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";

const KIND_TONE: Record<string, "primary" | "info" | "success" | "neutral"> = {
  proof_point: "primary",
  submission_field: "info",
  snippet: "success",
  asset: "neutral",
};

/** Record that this field reused a library entry. */
async function recordReuse(fieldId: string, source: RecommendedSource) {
  try {
    if (source.kind === "submission_field") {
      await supabase
        .from("submission_fields")
        .update({ reused_from_field_id: source.id })
        .eq("id", fieldId);
    } else if (source.kind === "asset") {
      await supabase
        .from("submission_fields")
        .update({ reused_from_asset_id: source.id })
        .eq("id", fieldId);
    } else if (source.kind === "snippet") {
      const { data } = await supabase
        .from("content_snippets")
        .select("usage_count")
        .eq("id", source.id)
        .maybeSingle();
      await supabase
        .from("content_snippets")
        .update({ usage_count: (data?.usage_count ?? 0) + 1 })
        .eq("id", source.id);
    } else if (source.kind === "proof_point") {
      const { data } = await supabase
        .from("proof_points")
        .select("usage_count")
        .eq("id", source.id)
        .maybeSingle();
      await supabase
        .from("proof_points")
        .update({ usage_count: (data?.usage_count ?? 0) + 1 })
        .eq("id", source.id);
    }
  } catch {
    // Provenance is bookkeeping — never block the writer on it.
  }
}

function SourceCard({
  source,
  fieldId,
  onInsert,
  onReplace,
}: {
  source: RecommendedSource;
  fieldId: string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const stale = isStale(source.sourceDate);
  const text = source.body?.trim() || source.preview;

  async function use(mode: "insert" | "replace") {
    if (mode === "insert") onInsert(text);
    else onReplace(text);
    await recordReuse(fieldId, source);
    toast.success(mode === "insert" ? "Inserted into the draft" : "Draft replaced with this text");
  }

  return (
    <li className="rounded-md border border-border bg-surface-2/40 p-2.5 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-medium">{source.title}</span>
            <Chip tone={KIND_TONE[source.kind] ?? "neutral"}>{SOURCE_KIND_LABEL[source.kind]}</Chip>
            {stale ? <Chip tone="warning">Verify — dated</Chip> : null}
            <span className="tabnum ml-auto text-[10.5px] text-muted-foreground">
              {Math.round(source.score * 100)}% match
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {[source.subtitle, source.sourceDate ? formatDate(source.sourceDate) : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <p
            className={cn(
              "mt-1 text-[12px] leading-relaxed text-muted-foreground",
              open ? "whitespace-pre-wrap" : "line-clamp-2",
            )}
          >
            {open ? text : source.preview}
          </p>
          {source.reasons.length ? (
            <p className="mt-1 text-[11px] text-primary/85">Why: {source.reasons.join(" · ")}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => use("insert")}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Insert
            </button>
            <button
              onClick={() => use("replace")}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <Wand2 className="h-3.5 w-3.5" /> Use as starting point
            </button>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open source
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function QuestionRecommendations({
  fieldId,
  onInsert,
  onReplace,
}: {
  fieldId: string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const run = useServerFn(recommendForField);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["field_recommendations", fieldId],
    queryFn: () => run({ data: { fieldId, limit: 8 } }),
    staleTime: 5 * 60_000,
  });

  const sources = data?.sources ?? [];

  return (
    <div className="mt-3 rounded-md border border-primary/25 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Recommended content
          <span className="tabnum rounded-full bg-primary/12 px-1.5 text-[10.5px]">
            {sources.length}
          </span>
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => refetch()}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {collapsed ? null : (
        <>
          {isFetching && !sources.length ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Matching this question against the library…
            </p>
          ) : error ? (
            <p className="mt-2 text-[12px] text-critical">
              Could not load recommendations. Try refresh.
            </p>
          ) : sources.length === 0 ? (
            <div className="mt-2 text-[12px] text-muted-foreground">
              Nothing in the library matches this question yet. Add approved language or bios in the
              Library, or sync Drive, and refresh.
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {sources.map((s) => (
                <SourceCard
                  key={`${s.kind}:${s.id}`}
                  source={s}
                  fieldId={fieldId}
                  onInsert={onInsert}
                  onReplace={onReplace}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** A small "insert" helper shared by the drafter. */
export function appendText(current: string, addition: string): string {
  if (!current.trim()) return addition;
  return `${current.trimEnd()}\n\n${addition}`;
}
