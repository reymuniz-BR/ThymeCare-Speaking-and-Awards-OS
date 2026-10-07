import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/program";
import { generateSubmissionBrief } from "@/lib/strategy.functions";
import { useInvalidate, useSubmissionBrief } from "@/lib/hooks";
import { SOURCE_KIND_LABEL, isStale, sourceOf } from "@/lib/strategy";
import type { BriefContent, BriefSource } from "@/lib/strategy";
import { ExternalLink, FileSearch, Loader2, RefreshCw, Sparkles } from "lucide-react";

/* --------------------------------- pieces --------------------------------- */

function Provenance({ mode }: { mode: "source" | "ai" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        mode === "source" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground",
      )}
      title={
        mode === "source"
          ? "Quoted or drawn directly from approved source material"
          : "AI recommendation — judgement, not source material"
      }
    >
      {mode === "source" ? "Source material" : "AI recommendation"}
    </span>
  );
}

function Citations({ refs, sources }: { refs?: string[]; sources: BriefSource[] }) {
  const cited = sourceOf(refs, sources);
  if (!cited.length) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {cited.map((s) => (
        <li key={s.ref} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <span className="tabnum rounded bg-surface-2 px-1 font-semibold text-muted-foreground">
            {s.ref}
          </span>
          <span className="text-muted-foreground">{SOURCE_KIND_LABEL[s.kind]}</span>
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {s.title} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-medium">{s.title}</span>
          )}
          <span
            className={cn(
              "tabnum",
              isStale(s.sourceDate) ? "text-warning" : "text-muted-foreground",
            )}
          >
            {s.sourceDate ? formatDate(s.sourceDate) : "date unknown"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Direct "open the actual document" links for a cited match. */
function DocLinks({ refs, sources }: { refs?: string[]; sources: BriefSource[] }) {
  const docs = sourceOf(refs, sources).filter((s) => s.url);
  if (!docs.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {docs.map((s) => (
        <a
          key={s.id}
          href={s.url!}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted"
        >
          Open “{s.title}” <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

/** Top-ranked Drive documents, so a prior application is always one click away. */
function DriveShortlist({ sources }: { sources: BriefSource[] }) {
  const docs = sources.filter((s) => s.kind === "asset" && s.url).slice(0, 5);
  if (!docs.length) return null;
  return (
    <div className="rounded border border-dashed border-border p-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Prior application documents in Drive
      </p>
      <ul className="mt-1.5 space-y-1">
        {docs.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[12px]">
            <a
              href={s.url!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {s.title} <ExternalLink className="h-3 w-3" />
            </a>
            <span className="tabnum text-[11px] text-muted-foreground">
              {Math.round(s.score * 100)}% fit
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[11px] font-semibold tracking-wide uppercase">{title}</h3>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground">{children}</p>;
}

/* ------------------------------- brief body -------------------------------- */

function BriefBody({ brief, sources }: { brief: BriefContent; sources: BriefSource[] }) {
  const b = brief;
  return (
    <>
      <Section title="Why pursue this" hint="AI recommendation">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={/pass/i.test(b.pursue?.verdict ?? "") ? "warning" : "success"}>
            {b.pursue?.verdict ?? "No verdict"}
          </Chip>
          <Provenance mode="ai" />
        </div>
        <p className="text-[13px] leading-relaxed">{b.pursue?.rationale}</p>
      </Section>

      <Section title="Recommended narrative">
        <p className="text-[13px] font-semibold">{b.narrative?.headline}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{b.narrative?.summary}</p>
        <Provenance mode="ai" />
      </Section>

      <Section
        title="Best matching past submissions"
        hint="ranked by criteria, topic, executive and narrative similarity"
      >
        {b.best_matches?.length ? (
          b.best_matches.map((m, i) => (
            <div key={i} className="rounded border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {typeof m.criteria_similarity === "number" ? (
                  <span className="tabnum text-[11px] font-semibold text-primary">
                    {Math.round(m.criteria_similarity)}% match
                  </span>
                ) : null}
                <Provenance mode="source" />
              </div>
              <p className="mt-1 text-[13px]">{m.why}</p>
              <DocLinks refs={m.refs} sources={sources} />
              <Citations refs={m.refs} sources={sources} />
            </div>
          ))
        ) : (
          <Empty>No comparable past submissions in the library yet.</Empty>
        )}
        <DriveShortlist sources={sources} />
      </Section>

      <Section
        title="What judges look for"
        hint="how this program is typically evaluated and what makes a submission stand out"
      >
        {b.judge_signals?.length ? (
          <ul className="space-y-1.5">
            {b.judge_signals.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium">{s.signal}</span>
                  <span className="text-muted-foreground"> — {s.stands_out}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Regenerate the brief to see judging criteria for this program.</Empty>
        )}
        <Provenance mode="ai" />
      </Section>
    </>
  );
}

/* -------------------------------- container -------------------------------- */

export function StrategyBriefPanel({
  submissionId,
  opportunityName,
}: {
  submissionId: string;
  opportunityName: string | null;
}) {
  const { data: brief, isLoading } = useSubmissionBrief(submissionId);
  const invalidate = useInvalidate();
  const generate = useServerFn(generateSubmissionBrief);
  const [running, setRunning] = useState(false);
  const autoRan = useRef(false);

  // Starting a submission should immediately analyse the opportunity against
  // the library — analysis only; no answer is ever drafted automatically.
  useEffect(() => {
    if (isLoading || brief || autoRan.current) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, brief]);

  async function run() {
    setRunning(true);
    try {
      await generate({ data: { submissionId } });
      invalidate(["submission_brief"]);
      toast.success("Strategy brief ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the brief");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3">
        <FileSearch className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold">Submission Strategy Brief</h2>
        {brief ? (
          <span className="text-[11px] text-muted-foreground">
            Generated {formatDateTime(brief.updated_at)}
          </span>
        ) : null}
        <Button
          size="sm"
          variant={brief ? "outline" : "default"}
          className="ml-auto h-7 text-[12px]"
          disabled={running}
          onClick={run}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : brief ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {running ? "Analysing library…" : brief ? "Regenerate" : "Analyse opportunity"}
        </Button>
      </header>

      {isLoading ? (
        <p className="border-t border-border px-4 py-4 text-[12px] text-muted-foreground">
          Loading…
        </p>
      ) : brief ? (
        <BriefBody brief={brief.brief} sources={brief.sources ?? []} />
      ) : (
        <p className="border-t border-border px-4 py-5 text-[12px] leading-relaxed text-muted-foreground">
          No brief yet for {opportunityName ?? "this opportunity"}. Run the analysis to compare the
          application requirements against the approved Content Library — best matching past
          submissions, what judges look for and content gaps. Nothing is drafted until you ask for
          it.
        </p>
      )}
    </section>
  );
}
