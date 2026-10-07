import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAnswerVersions, useInvalidate } from "@/lib/hooks";
import { wordCount, formatDateTime, formatDate } from "@/lib/program";
import { draftAnswer } from "@/lib/draft.functions";
import { limitState } from "@/lib/draft";
import type { AnswerVersion, DraftResult } from "@/lib/draft";
import { SOURCE_KIND_LABEL, isStale } from "@/lib/strategy";
import type { BriefSource } from "@/lib/strategy";
import { QuestionRecommendations, appendText } from "@/components/recommendations";
import {
  AlertTriangle,
  ExternalLink,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

export type DraftField = {
  id: string;
  submission_id: string;
  prompt: string;
  answer: string;
  word_limit: number | null;
  char_limit: number | null;
};

function Counts({
  text,
  wordLimit,
  charLimit,
}: {
  text: string;
  wordLimit: number | null;
  charLimit: number | null;
}) {
  const s = limitState(text, wordCount(text), wordLimit, charLimit);
  return (
    <span className="tabnum text-[11px] text-muted-foreground">
      <span className={cn(s.overWords && "font-semibold text-critical")}>
        {s.words} words{s.wordLimit ? ` / ${s.wordLimit}` : ""}
      </span>
      <span className="px-1.5 text-border">·</span>
      <span className={cn(s.overChars && "font-semibold text-critical")}>
        {s.chars} chars{s.charLimit ? ` / ${s.charLimit}` : ""}
      </span>
    </span>
  );
}

function SourceLine({ source, note }: { source: BriefSource; note?: string }) {
  return (
    <li className="flex items-start gap-2 py-1 text-[12px]">
      <span className="tabnum mt-0.5 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
        {source.ref}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {source.title} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-medium">{source.title}</span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {SOURCE_KIND_LABEL[source.kind]}
            {source.sourceDate ? ` · ${formatDate(source.sourceDate)}` : ""}
          </span>
          {isStale(source.sourceDate) ? (
            <span className="text-[11px] font-medium text-warning">dated</span>
          ) : null}
        </span>
        {note ? <span className="block text-muted-foreground">{note}</span> : null}
      </span>
    </li>
  );
}

function VersionRow({
  v,
  onRestore,
  onFinal,
}: {
  v: AnswerVersion;
  onRestore: (v: AnswerVersion) => void;
  onFinal: (v: AnswerVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-border py-1.5 text-[12px] first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="tabnum font-semibold text-foreground hover:underline"
        >
          v{v.version}
        </button>
        <Chip tone={v.origin === "ai" ? "info" : "neutral"}>
          {v.origin === "ai" ? "AI draft" : "Edited"}
        </Chip>
        {v.is_final ? <Chip tone="success">Submitted answer</Chip> : null}
        {v.reusable ? <Chip tone="primary">Reusable</Chip> : null}
        <span className="tabnum text-[11px] text-muted-foreground">
          {v.word_count}w · {v.char_count}c · {formatDateTime(v.created_at)}
        </span>
        <span className="ml-auto flex gap-2">
          {!v.is_final ? (
            <button className="text-[11px] text-primary hover:underline" onClick={() => onFinal(v)}>
              Mark as submitted
            </button>
          ) : null}
          <button
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onRestore(v)}
          >
            <RotateCcw className="h-3 w-3" /> Restore
          </button>
        </span>
      </div>
      {open ? (
        <div className="mt-1.5 rounded border border-border bg-surface-2 p-2">
          <p className="whitespace-pre-wrap text-[12px] text-foreground">{v.answer}</p>
          {v.sources?.length ? (
            <ul className="mt-2 border-t border-border pt-1">
              {v.sources.map((s) => (
                <SourceLine key={s.ref} source={s} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * One application question: the working answer, the AI drafting controls, the
 * provenance of the draft, and the saved version history that eventually
 * turns the submitted answer into reusable source material.
 */
export function AnswerDrafter({
  field,
  onRemove,
}: {
  field: DraftField;
  onRemove: (id: string) => void;
}) {
  const invalidate = useInvalidate();
  const runDraft = useServerFn(draftAnswer);
  const { data: versions = [] } = useAnswerVersions(field.id);

  const [text, setText] = useState(field.answer);
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<DraftResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [limits, setLimits] = useState({
    word: field.word_limit ? String(field.word_limit) : "",
    char: field.char_limit ? String(field.char_limit) : "",
  });

  const usedSources = useMemo(() => {
    if (!meta) return [];
    return meta.sources_used
      .map((u) => ({
        source: meta.sources.find((s) => s.ref === u.ref),
        note: u.how_used,
      }))
      .filter((x): x is { source: BriefSource; note: string } => Boolean(x.source));
  }, [meta]);

  async function saveLimits(next: { word: string; char: string }) {
    setLimits(next);
    await supabase
      .from("submission_fields")
      .update({
        word_limit: next.word ? Number(next.word) : null,
        char_limit: next.char ? Number(next.char) : null,
      })
      .eq("id", field.id);
    invalidate(["submission"]);
  }

  async function generate(angle?: string) {
    setBusy(true);
    try {
      const result = await runDraft({
        data: {
          fieldId: field.id,
          instruction: instruction || undefined,
          angle,
        },
      });
      setMeta(result);
      setText(result.draft);
      setDirty(true);
      toast.success("Draft ready — review the flagged facts before saving");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft an answer");
    } finally {
      setBusy(false);
    }
  }

  async function saveVersion(origin: "ai" | "human") {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // The database assigns the version number so simultaneous saves can't collide.
      const { data: saved, error } = await supabase
        .from("submission_answer_versions")
        .insert({
          field_id: field.id,
          submission_id: field.submission_id,
          answer: text,
          word_count: wordCount(text),
          char_count: text.length,
          origin,
          model: origin === "ai" ? (meta?.model ?? null) : null,
          sources: (meta?.sources_used.length
            ? usedSources.map((u) => u.source)
            : []) as unknown as never,
          verifications: (meta?.verifications ?? []) as unknown as never,
          alternate: (meta?.alternate ?? null) as unknown as never,
          created_by: auth.user?.id ?? null,
        })
        .select("version")
        .single();
      if (error) throw new Error(error.message);
      const { error: fieldErr } = await supabase
        .from("submission_fields")
        .update({ answer: text })
        .eq("id", field.id);
      if (fieldErr) throw new Error(fieldErr.message);
      setDirty(false);
      invalidate(["answer_versions", "submission", "submissions", "activity"]);
      toast.success(`Saved as v${saved?.version ?? ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this version");
    } finally {
      setSaving(false);
    }
  }

  async function markFinal(v: AnswerVersion) {
    await supabase
      .from("submission_answer_versions")
      .update({ is_final: false })
      .eq("field_id", field.id);
    const { error } = await supabase
      .from("submission_answer_versions")
      .update({ is_final: true, reusable: true })
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("submission_fields").update({ answer: v.answer }).eq("id", field.id);
    setText(v.answer);
    setDirty(false);
    invalidate(["answer_versions", "submission"]);
    toast.success("Marked as the submitted answer — now reusable source material");
  }

  const flags = meta?.verifications ?? [];

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{field.prompt}</h3>
        <button
          onClick={() => onRemove(field.id)}
          className="text-muted-foreground hover:text-critical"
          aria-label="Remove question"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Limits</span>
        <Input
          type="number"
          min={1}
          value={limits.word}
          onChange={(e) => setLimits((l) => ({ ...l, word: e.target.value }))}
          onBlur={() => saveLimits(limits)}
          placeholder="words"
          className="h-7 w-20 text-[12px]"
        />
        <Input
          type="number"
          min={1}
          value={limits.char}
          onChange={(e) => setLimits((l) => ({ ...l, char: e.target.value }))}
          onBlur={() => saveLimits(limits)}
          placeholder="chars"
          className="h-7 w-20 text-[12px]"
        />
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Optional steering — e.g. lead with the clinical outcome…"
          className="h-7 min-w-[220px] flex-1 text-[12px]"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          disabled={busy}
          onClick={() => generate()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Draft with library
        </Button>
      </div>

      <Textarea
        rows={9}
        className="mt-2 text-[13px]"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder="Draft the answer, or generate one from approved content…"
      />

      <QuestionRecommendations
        fieldId={field.id}
        onInsert={(t) => {
          setText((prev) => appendText(prev, t));
          setDirty(true);
        }}
        onReplace={(t) => {
          setText(t);
          setDirty(true);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Counts
          text={text}
          wordLimit={limits.word ? Number(limits.word) : null}
          charLimit={limits.char ? Number(limits.char) : null}
        />
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" /> {versions.length} version
            {versions.length === 1 ? "" : "s"}
          </button>
          <Button
            size="sm"
            className="h-7 text-[12px]"
            disabled={!dirty || saving || !text.trim()}
            onClick={() => saveVersion(meta && text === meta.draft ? "ai" : "human")}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save version
          </Button>
        </span>
      </div>

      {meta ? (
        <div className="mt-3 space-y-3 rounded border border-border bg-surface-2 p-3">
          <div>
            <h4 className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
              Sources used
            </h4>
            {usedSources.length ? (
              <ul className="mt-1">
                {usedSources.map((u) => (
                  <SourceLine key={u.source.ref} source={u.source} note={u.note} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                No approved source material matched this question — the draft is structure only, and
                every fact must come from the team.
              </p>
            )}
          </div>

          <div>
            <h4 className="flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase text-warning">
              <AlertTriangle className="h-3 w-3" /> Facts requiring verification
            </h4>
            {flags.length ? (
              <ul className="mt-1 space-y-1">
                {flags.map((f, i) => (
                  <li key={i} className="text-[12px]">
                    <span className="font-medium">{f.claim}</span>
                    <span className="block text-muted-foreground">
                      {f.why}
                      {f.refs.length ? ` · ${f.refs.join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                No figures or dated claims in this draft.
              </p>
            )}
          </div>

          {meta.gaps.length ? (
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                Missing inputs
              </h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]">
                {meta.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {meta.alternate ? (
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                Alternate angle
              </h4>
              <p className="mt-1 text-[12px] font-medium">{meta.alternate.angle}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">
                {meta.alternate.draft}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-[12px]"
                onClick={() => {
                  setText(meta.alternate!.draft);
                  setDirty(true);
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> Use this angle
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showHistory ? (
        <div className="mt-3 rounded border border-border p-3">
          <h4 className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
            Version history
          </h4>
          {versions.length ? (
            <ul className="mt-1">
              {versions.map((v) => (
                <VersionRow
                  key={v.id}
                  v={v}
                  onRestore={(x) => {
                    setText(x.answer);
                    setDirty(true);
                  }}
                  onFinal={markFinal}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              No versions saved yet. Saved answers stay here, and the one you mark as submitted
              becomes reusable source material for future applications.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
