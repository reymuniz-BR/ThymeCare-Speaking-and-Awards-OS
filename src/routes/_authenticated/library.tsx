import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Panel, EmptyState } from "@/components/ui-kit";
import { useContentAssets, useInvalidate, useSnippets } from "@/lib/hooks";
import { ASSET_CATEGORIES, formatDateTime, labelize } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/new-opportunity-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExternalLink, Plus, RefreshCw, Search } from "lucide-react";
import { syncDriveLibrary, type DriveSyncPage } from "@/lib/drive.functions";
import { MessagingBank } from "@/components/messaging-bank";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — Thyme Care Speaking & Awards" },
      {
        name: "description",
        content:
          "Search previous submissions, messaging, executive bios and proof points the team can reuse in new applications.",
      },
      { property: "og:title", content: "Library — Thyme Care Speaking & Awards" },
      {
        property: "og:description",
        content: "Reusable answers, bios, messaging and past applications in one searchable place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

/** What a comms person is usually looking for, mapped to indexed categories. */
const SHELVES: { key: string; label: string; categories: string[] | null }[] = [
  { key: "all", label: "Everything", categories: null },
  {
    key: "submissions",
    label: "Previous submissions",
    categories: ["prior_application", "case_study"],
  },
  { key: "messaging", label: "Messaging & boilerplate", categories: ["boilerplate", "press"] },
  { key: "bios", label: "Executive bios", categories: ["bio"] },
  { key: "proof", label: "Proof points & metrics", categories: ["metrics"] },
];

type ShelfKey = string;

function LibraryPage() {
  const { data: assets = [], isLoading } = useContentAssets();
  const { data: snippets = [] } = useSnippets();
  const invalidate = useInvalidate();
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState<ShelfKey>("all");
  const [showApproved, setShowApproved] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lastSynced = assets.reduce<string | null>(
    (acc, a) => (a.last_synced_at && (!acc || a.last_synced_at > acc) ? a.last_synced_at : acc),
    null,
  );

  const items = useMemo(() => {
    const shelfDef = SHELVES.find((s) => s.key === shelf)!;
    const allowed = shelfDef.categories;
    const needle = q.trim().toLowerCase();

    const fromAssets = assets.map((a) => ({
      id: `a-${a.id}`,
      title: a.name,
      body: a.summary ?? a.extracted_text ?? "",
      category: a.category as string,
      tags: a.tags ?? [],
      footer: `From Drive · ${formatDateTime(a.last_synced_at)}`,
      link: a.web_view_link,
    }));
    const fromSnippets = snippets.map((s) => ({
      id: `s-${s.id}`,
      title: s.title,
      body: s.body,
      category: s.category as string,
      tags: s.tags ?? [],
      footer: `Saved answer · used ${s.usage_count}×`,
      link: null as string | null,
    }));

    return [...fromSnippets, ...fromAssets].filter((item) => {
      if (allowed && !allowed.includes(item.category)) return false;
      if (!needle) return true;
      return [item.title, item.body, ...item.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [assets, snippets, shelf, q]);

  async function runSync() {
    setSyncing(true);
    let token: string | null = null;
    let page = 0;
    let indexed = 0;
    const errors: string[] = [];
    try {
      do {
        const result: DriveSyncPage = await syncDriveLibrary({ data: { pageToken: token } });
        page += 1;
        indexed += result.indexed;
        errors.push(...result.errors);
        token = result.nextPageToken;
      } while (token && page < 200);
      invalidate(["content_assets"]);
      if (errors.length) toast.warning(`Refresh finished with ${errors.length} issue(s)`);
      else toast.success(`Library refreshed — ${indexed} files available`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach the team Drive.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell
      title="Content library"
      eyebrow={
        <>
          <span className="tracking-[0.12em] uppercase">Institutional knowledge</span>
          <span className="text-border">/</span>
          <span>
            {assets.length} indexed Drive files · {snippets.length} saved answers
          </span>
        </>
      }
      subtitle="Approved material the team can reuse when drafting a submission."
      actions={
        <>
          <Button size="sm" variant="outline" className="h-8" onClick={runSync} disabled={syncing}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Refreshing…" : "Refresh Drive"}
          </Button>
          <NewSnippetDialog onSaved={() => invalidate(["content_snippets"])} />
        </>
      }
    >
      <Panel bodyClassName="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bios, messaging, proof points and past answers…"
            className="h-11 pl-9 text-[14px]"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
          {SHELVES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setShelf(s.key);
                setShowApproved(false);
              }}
              className={cn(
                "rounded-full border px-3 py-1 transition-colors",
                shelf === s.key && !showApproved
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-surface-2",
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setShowApproved(true)}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors",
              showApproved
                ? "border-primary/40 bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-surface-2",
            )}
          >
            Approved language
          </button>
          <span className="ml-auto text-[11.5px] text-muted-foreground">
            Drive synced {lastSynced ? formatDateTime(lastSynced) : "never"}
          </span>
        </div>
      </Panel>

      <div className="mt-4">
        {showApproved ? (
          <MessagingBank />
        ) : isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title={q ? "Nothing matches that search" : "Nothing indexed yet"}>
            {q
              ? "Try a shorter phrase or a different shelf."
              : "Refresh from Drive, or save a reusable answer."}
          </EmptyState>
        ) : (
          <>
            <div className="mb-2 tabnum text-[12px] text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-[0_2px_10px_-4px_color-mix(in_oklab,var(--foreground)_25%,transparent)]"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded bg-neutralchip px-1.5 py-0.5 text-[10px] tracking-wide text-neutralchip-foreground uppercase">
                      {labelize(item.category)}
                    </span>
                  </div>
                  <h3 className="text-[13.5px] leading-snug font-medium">{item.title}</h3>
                  <p className="mt-2 line-clamp-5 flex-1 text-[12px] leading-relaxed text-muted-foreground">
                    {item.body || "No preview available."}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{item.footer}</span>
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function NewSnippetDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "boilerplate", tags: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("content_snippets").insert({
      title: form.title,
      body: form.body,
      category: form.category as never,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      created_by: userData.user?.id ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setForm({ title: "", body: "", category: "boilerplate", tags: "" });
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5" /> Save language
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save reusable language</DialogTitle>
          <DialogDescription>
            Keep approved wording the team can drop into future submissions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-[12px]">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Type</Label>
            <NativeSelect
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={ASSET_CATEGORIES}
              labels={Object.fromEntries(ASSET_CATEGORIES.map((c) => [c, labelize(c)]))}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Text</Label>
            <Textarea
              rows={7}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Tags (comma separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="oncology, CEO, outcomes"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
