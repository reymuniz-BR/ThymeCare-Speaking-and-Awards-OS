import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useContentAssets, useOpportunities, useSubmissions } from "@/lib/hooks";
import { labelize } from "@/lib/program";
import { Search } from "lucide-react";

type Hit = {
  id: string;
  label: string;
  detail: string;
  group: "Opportunities" | "Submissions" | "Content Library";
  go: () => void;
  href?: string;
};

/**
 * Lightweight command-style search over data already loaded in the app:
 * opportunities, submissions and indexed Drive assets. Cmd/Ctrl+K opens it.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data: opportunities = [] } = useOpportunities();
  const { data: submissions = [] } = useSubmissions();
  const { data: assets = [] } = useContentAssets();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const match = (...parts: (string | null | undefined)[]) =>
      parts.filter(Boolean).join(" ").toLowerCase().includes(needle);

    const out: Hit[] = [];
    for (const o of opportunities) {
      if (out.length > 60) break;
      if (!match(o.name, o.organizer, o.category, o.owner_name)) continue;
      out.push({
        id: `o-${o.id}`,
        label: o.name,
        detail: [labelize(o.type), o.organizer, o.owner_name].filter(Boolean).join(" · "),
        group: "Opportunities",
        go: () => navigate({ to: "/opportunities/$id", params: { id: o.id } }),
      });
    }
    for (const s of submissions) {
      if (!match(s.title, s.opportunities?.name)) continue;
      out.push({
        id: `s-${s.id}`,
        label: s.title,
        detail: [s.opportunities?.name, labelize(s.stage)].filter(Boolean).join(" · "),
        group: "Submissions",
        go: () => navigate({ to: "/submissions/$id", params: { id: s.id } }),
      });
    }
    for (const a of assets) {
      if (!match(a.name, a.summary)) continue;
      out.push({
        id: `a-${a.id}`,
        label: a.name,
        detail: labelize(a.category),
        group: "Content Library",
        go: () => navigate({ to: "/library" }),
        ...(a.web_view_link ? { href: a.web_view_link } : {}),
      });
    }
    return out.slice(0, 40);
  }, [q, opportunities, submissions, assets, navigate]);

  const groups: Hit["group"][] = ["Opportunities", "Submissions", "Content Library"];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-muted"
        aria-label="Search opportunities, submissions and library"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded bg-surface-2 px-1 text-[10px] md:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-[13px]">Search the program</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-3">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Opportunity, submission or library file…"
              className="h-9 text-[13px]"
            />
          </div>
          <div className="max-h-80 overflow-y-auto border-t border-border">
            {!q.trim() ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                Type to search across opportunities, submissions and the content library.
              </p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No matches.</p>
            ) : (
              groups.map((g) => {
                const items = hits.filter((h) => h.group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <div className="bg-surface-2 px-4 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                      {g}
                    </div>
                    <ul>
                      {items.map((h) => (
                        <li key={h.id}>
                          <button
                            className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-surface-2"
                            onClick={() => {
                              setOpen(false);
                              setQ("");
                              if (h.href) window.open(h.href, "_blank", "noreferrer");
                              else h.go();
                            }}
                          >
                            <span className="text-[13px] font-medium">{h.label}</span>
                            <span className="text-[11px] text-muted-foreground">{h.detail}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
