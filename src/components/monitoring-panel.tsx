import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/chip";
import {
  useMonitoringChecks,
  useOpportunityChanges,
  useReviewChange,
  useInvalidate,
  type OpportunityChangeRow,
} from "@/lib/hooks";
import { checkOpportunityNow } from "@/lib/monitoring.functions";
import { APPLICATION_STATE_LABEL, APPLICATION_STATE_TONE, CONFIDENCE_TONE } from "@/lib/monitoring";
import { formatDateTime } from "@/lib/program";

export function CheckNowButton({
  opportunityId,
  size = "sm",
}: {
  opportunityId: string;
  size?: "sm" | "default";
}) {
  const run = useServerFn(checkOpportunityNow);
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const result = await run({ data: { id: opportunityId } });
      if (!result.ok) toast.error(result.error ?? "Check failed");
      else if (result.changes > 0)
        toast.warning(
          `${result.changes} change${result.changes === 1 ? "" : "s"} found — review required`,
        );
      else toast.success("Checked — no changes found");
      invalidate([
        "opportunity_changes",
        "monitoring_checks",
        "opportunity",
        "opportunities",
        "activity",
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size={size} onClick={check} disabled={busy} className="gap-1.5">
      <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {busy ? "Checking…" : "Check now"}
    </Button>
  );
}

export function ChangeRow({ change }: { change: OpportunityChangeRow }) {
  const review = useReviewChange();

  function decide(decision: "accepted" | "rejected") {
    review.mutate(
      { change, decision },
      {
        onSuccess: () =>
          toast.success(decision === "accepted" ? "Change applied" : "Change dismissed"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      },
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">{change.label}</span>
          <Chip tone={CONFIDENCE_TONE[change.confidence] ?? "neutral"}>{change.confidence}</Chip>
          <span className="text-[11px] text-muted-foreground">
            detected {formatDateTime(change.detected_at)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] tabnum">
          <span className="text-muted-foreground line-through">{change.old_value || "—"}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-semibold">{change.new_value || "—"}</span>
        </div>
        {change.evidence ? (
          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{change.evidence}</p>
        ) : null}
        {change.source_url ? (
          <a
            href={change.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> source
          </a>
        ) : null}
      </div>

      {change.review_status === "pending" ? (
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={review.isPending}
            onClick={() => decide("accepted")}
          >
            <Check className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            disabled={review.isPending}
            onClick={() => decide("rejected")}
          >
            <X className="h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      ) : (
        <Chip tone={change.review_status === "accepted" ? "success" : "neutral"}>
          {change.review_status}
        </Chip>
      )}
    </div>
  );
}

export function MonitoringActivity({ opportunityId }: { opportunityId: string }) {
  const { data: changes } = useOpportunityChanges({ opportunityId });
  const { data: checks } = useMonitoringChecks(opportunityId, 10);
  const pending = (changes ?? []).filter((c) => c.review_status === "pending");
  const resolved = (changes ?? []).filter((c) => c.review_status !== "pending").slice(0, 8);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">
            Detected changes
            {pending.length ? (
              <span className="ml-2 rounded bg-warning/18 px-1.5 py-0.5 text-[11px] text-warning-foreground">
                {pending.length} to review
              </span>
            ) : null}
          </h2>
          <CheckNowButton opportunityId={opportunityId} />
        </header>
        {pending.length === 0 && resolved.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            No changes detected yet.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {pending.map((c) => (
              <ChangeRow key={c.id} change={c} />
            ))}
            {resolved.map((c) => (
              <ChangeRow key={c.id} change={c} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-surface">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Check history</h2>
        </header>
        {(checks ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            This opportunity has not been checked yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {(checks ?? []).map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted-foreground tabnum">
                    {formatDateTime(c.checked_at)}
                  </span>
                  <Chip tone={c.ok ? "success" : "critical"}>{c.ok ? "success" : "failed"}</Chip>
                  {c.application_state ? (
                    <Chip tone={APPLICATION_STATE_TONE[c.application_state] ?? "neutral"}>
                      {APPLICATION_STATE_LABEL[c.application_state] ?? c.application_state}
                    </Chip>
                  ) : null}
                  <Chip tone={CONFIDENCE_TONE[c.confidence] ?? "neutral"}>{c.confidence}</Chip>
                  <span className="text-[11px] text-muted-foreground">
                    {c.triggered_by === "schedule" ? "weekly sweep" : "manual"} · {c.changes_found}{" "}
                    change{c.changes_found === 1 ? "" : "s"}
                  </span>
                </div>
                {c.summary || c.error ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">{c.error ?? c.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
