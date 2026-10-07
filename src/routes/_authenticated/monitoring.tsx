import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Play } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/taxonomy";
import { ChangeRow, CheckNowButton } from "@/components/monitoring-panel";
import { useInvalidate, useOpportunities, useOpportunityChanges } from "@/lib/hooks";
import { runMonitoringSweep } from "@/lib/monitoring.functions";
import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
  FLAG_FILTERS,
  attentionFlags,
  attentionScore,
  nextDeadlineDate,
  isActive,
  type FlagKey,
} from "@/lib/monitoring";
import { formatDate, formatDateTime, TYPE_LABEL, countdownLabel } from "@/lib/program";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/monitoring")({
  component: MonitoringPage,
  head: () => ({
    meta: [
      { title: "Needs Attention · Deadline Monitoring" },
      {
        name: "description",
        content:
          "Monitored awards and speaking opportunities that need attention: approaching deadlines, detected changes and stale verifications.",
      },
      { property: "og:title", content: "Needs Attention · Deadline Monitoring" },
      {
        property: "og:description",
        content: "Approaching deadlines, detected changes and unverified opportunity records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MonitoringPage() {
  const { data: opportunities, isLoading } = useOpportunities();
  const { data: changes } = useOpportunityChanges({ pendingOnly: true });
  const sweep = useServerFn(runMonitoringSweep);
  const invalidate = useInvalidate();
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<FlagKey | "all">("all");

  const pendingByOpp = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of changes ?? []) map.set(c.opportunity_id, (map.get(c.opportunity_id) ?? 0) + 1);
    return map;
  }, [changes]);

  const rows = useMemo(() => {
    return (opportunities ?? [])
      .filter(isActive)
      .map((o) => {
        const flags = attentionFlags({ ...o, pending_changes: pendingByOpp.get(o.id) ?? 0 });
        return { opportunity: o, flags, score: attentionScore(flags) };
      })
      .filter((r) => r.flags.length > 0)
      .sort((a, b) => b.score - a.score);
  }, [opportunities, pendingByOpp]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const f of r.flags) c[f.key] = (c[f.key] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible =
    filter === "all" ? rows : rows.filter((r) => r.flags.some((f) => f.key === filter));

  async function runSweep() {
    setRunning(true);
    try {
      const result = await sweep({ data: { limit: 40 } });
      toast.success(
        `Swept ${result.checked} of ${result.total} monitored records · ${result.changes} change(s), ${result.failed} failed`,
      );
      invalidate(["opportunities", "opportunity_changes", "monitoring_checks", "activity"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell
      title="Needs Attention"
      subtitle="Deadline monitoring across all active opportunities"
      actions={
        <Button size="sm" onClick={runSweep} disabled={running} className="gap-1.5">
          <Play className={cn("h-3.5 w-3.5", running && "animate-pulse")} />
          {running ? "Running sweep…" : "Run monitoring sweep"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <FilterPill
            active={filter === "all"}
            label="All"
            count={rows.length}
            onClick={() => setFilter("all")}
          />
          {FLAG_FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              active={filter === f.key}
              label={f.label}
              count={counts[f.key] ?? 0}
              onClick={() => setFilter(f.key)}
            />
          ))}
        </div>

        <section className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Opportunity</th>
                <th className="px-3 py-2 font-medium">Application state</th>
                <th className="px-3 py-2 font-medium">Next deadline</th>
                <th className="px-3 py-2 font-medium">Last verified</th>
                <th className="px-3 py-2 font-medium">Indicators</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nothing needs attention right now.
                  </td>
                </tr>
              ) : (
                visible.map(({ opportunity: o, flags }) => {
                  const deadline = nextDeadlineDate(o);
                  return (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <Link
                          to="/opportunities/$id"
                          params={{ id: o.id }}
                          className="font-medium hover:underline"
                        >
                          {o.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{TYPE_LABEL[o.type] ?? o.type}</span>
                          <StatusBadge status={o.status} type={o.type} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {o.application_state ? (
                          <Chip tone={APPLICATION_STATE_TONE[o.application_state] ?? "neutral"}>
                            {APPLICATION_STATE_LABEL[o.application_state] ?? o.application_state}
                          </Chip>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabnum">
                        {deadline ? (
                          <>
                            <div>{formatDate(deadline)}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {countdownLabel(deadline)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground tabnum">
                        {formatDateTime(o.last_verified_at ?? o.last_checked_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <Chip key={f.key} tone={f.tone}>
                              {f.label}
                            </Chip>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CheckNowButton opportunityId={o.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            <h2 className="text-[13px] font-semibold">
              Changes awaiting review ({(changes ?? []).length})
            </h2>
          </header>
          {(changes ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No pending changes. Every detected difference has been reviewed.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {(changes ?? []).map((c) => (
                <div key={c.id}>
                  <div className="px-4 pt-2.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                    <Link
                      to="/opportunities/$id"
                      params={{ id: c.opportunity_id }}
                      className="hover:underline"
                    >
                      {c.opportunities?.name ?? "Opportunity"}
                    </Link>
                  </div>
                  <ChangeRow change={c} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded border px-2.5 py-1 text-[12px] transition-colors",
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <span className="ml-1.5 tabnum opacity-70">{count}</span>
    </button>
  );
}
