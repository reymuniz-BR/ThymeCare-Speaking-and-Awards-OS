import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AccessList } from "@/components/access-list";
import { TrackerSyncCard } from "@/components/tracker-sync-card";


import { Chip } from "@/components/chip";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate } from "@/lib/hooks";
import { useTaxonomy, optionsFor } from "@/lib/taxonomy";
import { TAXONOMY_KINDS, TYPE_LABEL, asTone, labelize } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Taxonomy settings — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Configure statuses, priorities, deadline types, recommendations and outcomes used across the opportunity database.",
      },
      { property: "og:title", content: "Taxonomy settings — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Program taxonomies are configurable, not hardcoded.",
      },
    ],
  }),
  component: SettingsPage,
});

const TONES = ["neutral", "info", "success", "warning", "critical", "primary"];

function SettingsPage() {
  const { data: rows = [], isLoading } = useTaxonomy();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState({
    kind: "status",
    applies_to: "speaking",
    label: "",
    tone: "neutral",
  });

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!value) return;
    const kindRows = optionsFor(rows, draft.kind, draft.applies_to || undefined);
    const { error } = await supabase.from("taxonomy_options").insert({
      kind: draft.kind,
      applies_to: draft.kind === "status" ? draft.applies_to : null,
      value,
      label: draft.label.trim(),
      tone: draft.tone,
      sort_order: (kindRows[kindRows.length - 1]?.sort_order ?? 0) + 10,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft((d) => ({ ...d, label: "" }));
    invalidate(["taxonomy_options"]);
    toast.success("Option added");
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    const { error } = await supabase
      .from("taxonomy_options")
      .update(payload as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["taxonomy_options"]);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("taxonomy_options").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["taxonomy_options"]);
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Access control and program taxonomies — admins and managers can edit them"
    >
      <div className="mb-4 space-y-4">
        <AccessList />
        <TrackerSyncCard />
      </div>


      <form
        onSubmit={addOption}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-3"
      >
        <Small label="List">
          <select
            value={draft.kind}
            onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
          >
            {TAXONOMY_KINDS.map((k) => (
              <option key={k} value={k}>
                {labelize(k)}
              </option>
            ))}
          </select>
        </Small>
        {draft.kind === "status" ? (
          <Small label="Applies to">
            <select
              value={draft.applies_to}
              onChange={(e) => setDraft((d) => ({ ...d, applies_to: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
            >
              <option value="speaking">Speaking</option>
              <option value="award">Award</option>
            </select>
          </Small>
        ) : null}
        <Small label="Label">
          <Input
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="h-9 w-56"
            placeholder="e.g. Awaiting Sponsor"
          />
        </Small>
        <Small label="Tone">
          <select
            value={draft.tone}
            onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {labelize(t)}
              </option>
            ))}
          </select>
        </Small>
        <Button type="submit" size="sm" className="h-9" disabled={!draft.label.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add option
        </Button>
      </form>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading taxonomies…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {TAXONOMY_KINDS.map((kind) =>
            kind === "status" ? (
              ["speaking", "award"].map((t) => (
                <TaxonomyPanel
                  key={`${kind}-${t}`}
                  title={`${TYPE_LABEL[t]} statuses`}
                  rows={rows.filter((r) => r.kind === "status" && r.applies_to === t)}
                  onPatch={patch}
                  onRemove={remove}
                />
              ))
            ) : (
              <TaxonomyPanel
                key={kind}
                title={`${labelize(kind)} options`}
                rows={rows.filter((r) => r.kind === kind)}
                onPatch={patch}
                onRemove={remove}
              />
            ),
          )}
        </div>
      )}
    </AppShell>
  );
}

function TaxonomyPanel({
  title,
  rows,
  onPatch,
  onRemove,
}: {
  title: string;
  rows: { id: string; label: string; value: string; tone: string; is_active: boolean }[];
  onPatch: (id: string, payload: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </header>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
            <Chip tone={asTone(r.tone)}>{r.label}</Chip>
            <code className="text-[11px] text-muted-foreground">{r.value}</code>
            <button
              onClick={() => onPatch(r.id, { is_active: !r.is_active })}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
            >
              {r.is_active ? "Active" : "Hidden"}
            </button>
            <button
              onClick={() => onRemove(r.id)}
              className="text-muted-foreground hover:text-critical"
              aria-label="Remove option"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">No options.</li>
        ) : null}
      </ul>
    </section>
  );
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}
