import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useActivity } from "@/lib/hooks";
import { formatDateTime, labelize } from "@/lib/program";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity & Changes — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Audit trail of every deadline change, status move and submission update across the speaking and awards program.",
      },
      { property: "og:title", content: "Activity Log — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Full change history so the team can see what moved and when.",
      },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { data: activity = [], isLoading } = useActivity(300);
  const [q, setQ] = useState("");

  const rows = activity.filter((a) => {
    if (!q) return true;
    const hay = [a.action, a.field, a.summary, a.opportunities?.name, a.entity_type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <AppShell title="Activity & Changes" subtitle={`${rows.length} recorded events`}>
      <div className="mb-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by opportunity, field or action…"
          className="h-9 w-80 text-[13px]"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-2 py-2 text-left font-medium">Entity</th>
              <th className="px-2 py-2 text-left font-medium">Action</th>
              <th className="px-2 py-2 text-left font-medium">Field</th>
              <th className="px-4 py-2 text-left font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Loading activity…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 tabnum whitespace-nowrap text-muted-foreground">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="px-2 py-2">
                    {a.opportunity_id ? (
                      <Link
                        to="/opportunities/$id"
                        params={{ id: a.opportunity_id }}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {a.opportunities?.name ?? labelize(a.entity_type)}
                      </Link>
                    ) : (
                      <span>{a.summary ?? labelize(a.entity_type)}</span>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {labelize(a.entity_type)}
                    </div>
                  </td>
                  <td className="px-2 py-2">{labelize(a.action)}</td>
                  <td className="px-2 py-2 text-muted-foreground">{labelize(a.field)}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">
                    {a.old_value || a.new_value ? (
                      <>
                        <span className="text-critical">{a.old_value ?? "—"}</span>
                        {" → "}
                        <span className="text-success">{a.new_value ?? "—"}</span>
                      </>
                    ) : (
                      (a.summary ?? "—")
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
