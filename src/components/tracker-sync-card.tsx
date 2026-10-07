/**
 * "Sync from tracker" — reconciles the client's master Drive spreadsheet with
 * the opportunity database. The grid is the source of truth, blank and TBD
 * cells never overwrite stored values, and every applied field change lands in
 * the activity log.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/chip";
import { syncTracker } from "@/lib/tracker-sync.functions";
import { useInvalidate } from "@/lib/hooks";
import { Loader2, RefreshCw, TableProperties } from "lucide-react";

type Result = Awaited<ReturnType<typeof syncTracker>>;

export function TrackerSyncCard() {
  const run = useServerFn(syncTracker);
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function go(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "apply");
    try {
      const res = (await run({ data: { dryRun } })) as Result;
      setResult(res);
      if (!dryRun) {
        invalidate(["opportunities"]);
        toast.success(`${res.created} added, ${res.updated} updated from the tracker`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tracker sync failed");
    } finally {
      setBusy(null);
    }
  }

  const applied = result && !result.dryRun;

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <TableProperties className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Sync from the master tracker</h2>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => go(true)} disabled={!!busy}>
            {busy === "preview" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Preview changes
          </Button>
          <Button size="sm" className="h-8" onClick={() => go(false)} disabled={!!busy}>
            {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Apply
          </Button>
        </div>
      </header>

      <div className="px-4 py-3 text-[12.5px] text-muted-foreground">
        Reads the Speaking and Awards tabs of the client spreadsheet in Drive and reconciles them
        against this database. The sheet wins on any filled cell; blank, TBD and “n/a” cells are
        left alone, and nothing is ever deleted. Runs automatically every Monday.
      </div>

      {result ? (
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Chip tone="neutral">{result.rowsRead} rows read</Chip>
            <Chip tone="success">{result.created} added</Chip>
            <Chip tone="info">{result.updated} updated</Chip>
            <Chip tone="neutral">{result.unchanged} unchanged</Chip>
            <span className="text-muted-foreground">
              {applied ? "Applied and logged" : "Preview only — nothing saved"} · sheet modified{" "}
              {new Date(result.modifiedTime).toLocaleDateString()}
            </span>
          </div>

          {result.unmappedStatuses.length ? (
            <p className="mt-2 text-[11.5px] text-warning">
              Status wording not recognised (left unchanged):{" "}
              {result.unmappedStatuses.map((u) => `${u.name} — “${u.status}”`).join("; ")}
            </p>
          ) : null}

          {result.unmatchedInApp.length ? (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              In this database but not in the sheet: {result.unmatchedInApp.join(", ")}
            </p>
          ) : null}

          <ul className="mt-3 max-h-80 space-y-1.5 overflow-auto pr-1">
            {result.changes
              .filter((c) => c.action !== "unchanged")
              .map((c, i) => (
                <li key={i} className="rounded-md border border-border/70 px-2.5 py-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <Chip tone={c.action === "created" ? "success" : "info"}>{c.action}</Chip>
                    <span className="font-medium">{c.name}</span>
                  </div>
                  {c.fields.length ? (
                    <ul className="mt-1 space-y-0.5 text-[11.5px] text-muted-foreground">
                      {c.fields.map((f, j) => (
                        <li key={j}>
                          <span className="text-foreground">{f.field}</span>: {f.from ?? "—"} →{" "}
                          {f.to ?? "—"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
