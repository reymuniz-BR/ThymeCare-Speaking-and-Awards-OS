import { useMemo, useState } from "react";
import { Chip } from "@/components/chip";
import { useInvalidate, useProofPoints } from "@/lib/hooks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/new-opportunity-dialog";
import { CheckCircle2, ExternalLink, Plus, Trash2 } from "lucide-react";
import {
  BANK_STATE_LABEL,
  BANK_STATE_TONE,
  DATED_KINDS,
  PROOF_POINT_GROUPS,
  PROOF_POINT_KINDS,
  PROOF_POINT_KIND_LABEL,
  bankState,
  type ProofPointKind,
  type ProofPointRow,
} from "@/lib/proof-points";
import { formatDate } from "@/lib/program";
type Draft = {
  id?: string;
  title: string;
  kind: ProofPointKind;
  content: string;
  theme: string;
  executive_name: string;
  source: string;
  source_url: string;
  source_date: string;
  last_verified_at: string;
  expires_on: string;
  approved: boolean;
  notes: string;
  tags: string;
};

const EMPTY: Draft = {
  title: "",
  kind: "company_overview",
  content: "",
  theme: "",
  executive_name: "",
  source: "",
  source_url: "",
  source_date: "",
  last_verified_at: "",
  expires_on: "",
  approved: false,
  notes: "",
  tags: "",
};

function toDraft(p: ProofPointRow): Draft {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    content: p.content,
    theme: p.theme ?? "",
    executive_name: p.executive_name ?? "",
    source: p.source ?? "",
    source_url: p.source_url ?? "",
    source_date: p.source_date ?? "",
    last_verified_at: p.last_verified_at ?? "",
    expires_on: p.expires_on ?? "",
    approved: p.approved,
    notes: p.notes ?? "",
    tags: (p.tags ?? []).join(", "),
  };
}

function EntryDialog({
  draft,
  onOpenChange,
  onSaved,
}: {
  draft: Draft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Draft>(draft ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dated = DATED_KINDS.includes(form.kind);

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("A title and the content are required");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      kind: form.kind,
      content: form.content.trim(),
      theme: form.theme.trim() || null,
      executive_name: form.executive_name.trim() || null,
      source: form.source.trim() || null,
      source_url: form.source_url.trim() || null,
      source_date: form.source_date || null,
      last_verified_at: form.last_verified_at || null,
      expires_on: form.expires_on || null,
      approved: form.approved,
      approved_at: form.approved ? new Date().toISOString() : null,
      notes: form.notes.trim() || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const { error } = form.id
      ? await supabase.from("proof_points").update(payload).eq("id", form.id)
      : await supabase.from("proof_points").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Entry updated" : "Entry added to the bank");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit bank entry" : "New bank entry"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_260px] gap-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">Title</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Entry type</Label>
              <NativeSelect
                value={form.kind}
                onChange={(v) => set("kind", v as ProofPointKind)}
                options={PROOF_POINT_KINDS}
                labels={PROOF_POINT_KIND_LABEL}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Content</Label>
            <Textarea
              rows={7}
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="The approved wording exactly as it should be reused."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">Theme</Label>
              <Input
                value={form.theme}
                onChange={(e) => set("theme", e.target.value)}
                placeholder="e.g. Oncology outcomes"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Applicable executive</Label>
              <Input
                value={form.executive_name}
                onChange={(e) => set("executive_name", e.target.value)}
                placeholder="Name or role"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="comma, separated"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">Source</Label>
              <Input
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                placeholder="Drive file, deck, press release, finance team…"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Source link</Label>
              <Input value={form.source_url} onChange={(e) => set("source_url", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">Source date</Label>
              <Input
                type="date"
                value={form.source_date}
                onChange={(e) => set("source_date", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Last verified</Label>
              <Input
                type="date"
                value={form.last_verified_at}
                onChange={(e) => set("last_verified_at", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">
                Re-verify by {dated ? <span className="text-warning">· recommended</span> : null}
              </Label>
              <Input
                type="date"
                value={form.expires_on}
                onChange={(e) => set("expires_on", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 rounded border border-border bg-surface-2 px-3 py-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.approved}
              onChange={(e) => set("approved", e.target.checked)}
            />
            <span>
              Approved for reuse — only approved, unexpired entries are given to the Submission
              Workspace as canonical current facts.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MessagingBank() {
  const { data: entries = [], isLoading } = useProofPoints();
  const invalidate = useInvalidate();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (onlyApproved && bankState(e) === "draft") return false;
      if (!term) return true;
      return `${e.title} ${e.content} ${e.theme ?? ""} ${e.executive_name ?? ""} ${(e.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(term);
    });
  }, [entries, q, kind, onlyApproved]);

  const counts = useMemo(() => {
    const c = { current: 0, attention: 0, draft: 0 };
    for (const e of entries) {
      const s = bankState(e);
      if (s === "draft") c.draft += 1;
      else if (s === "current") c.current += 1;
      else c.attention += 1;
    }
    return c;
  }, [entries]);

  async function remove(id: string) {
    const { error } = await supabase.from("proof_points").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["proof_points"]);
    toast.success("Entry removed");
  }

  async function reverify(e: ProofPointRow) {
    const { error } = await supabase
      .from("proof_points")
      .update({ last_verified_at: new Date().toISOString().slice(0, 10) })
      .eq("id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["proof_points"]);
    toast.success("Marked verified today");
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Canonical approved messaging reused across award and speaking submissions.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New entry
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12px]">
        <span className="font-medium">{entries.length} entries</span>
        <Chip tone="success">{counts.current} approved &amp; current</Chip>
        <Chip tone="warning">{counts.attention} need re-verification</Chip>
        <Chip tone="neutral">{counts.draft} not approved</Chip>
        <span className="ml-auto text-muted-foreground">
          Approved entries outrank historical submission language in the Submission Workspace.
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search content, theme, executive or tag…"
          className="h-9 max-w-sm"
        />
        <div className="w-64">
          <NativeSelect
            value={kind}
            onChange={setKind}
            options={["all", ...PROOF_POINT_KINDS]}
            labels={{ all: "All entry types", ...PROOF_POINT_KIND_LABEL }}
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px]">
          <input
            type="checkbox"
            checked={onlyApproved}
            onChange={(e) => setOnlyApproved(e.target.checked)}
          />
          Approved only
        </label>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading the bank…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          No entries yet. Add the company overview, differentiation and core metrics first — the
          Submission Workspace prefers these over older submission language.
        </div>
      ) : (
        <div className="space-y-4">
          {PROOF_POINT_GROUPS.map((group) => {
            const groupRows = rows.filter((r) => group.kinds.includes(r.kind));
            if (!groupRows.length) return null;
            return (
              <section key={group.group}>
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </h2>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-[13px]">
                    <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Entry</th>
                        <th className="w-40 px-3 py-2 text-left font-medium">Theme</th>
                        <th className="w-40 px-3 py-2 text-left font-medium">Executive</th>
                        <th className="w-52 px-3 py-2 text-left font-medium">Source</th>
                        <th className="w-44 px-3 py-2 text-left font-medium">Verification</th>
                        <th className="w-24 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((e) => {
                        const state = bankState(e);
                        return (
                          <tr
                            key={e.id}
                            className="border-t border-border align-top hover:bg-surface-2/60"
                          >
                            <td className="px-3 py-2">
                              <button
                                className="text-left font-medium hover:underline"
                                onClick={() => {
                                  setEditing(toDraft(e));
                                  setOpen(true);
                                }}
                              >
                                {e.title}
                              </button>
                              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                {PROOF_POINT_KIND_LABEL[e.kind]}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                                {e.content}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-[12px]">{e.theme ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px]">{e.executive_name ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px]">
                              <div className="flex items-center gap-1">
                                <span className="truncate">{e.source ?? "—"}</span>
                                {e.source_url ? (
                                  <a href={e.source_url} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                  </a>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {e.source_date ? formatDate(e.source_date) : "no source date"}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Chip tone={BANK_STATE_TONE[state]}>{BANK_STATE_LABEL[state]}</Chip>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                Verified{" "}
                                {e.last_verified_at ? formatDate(e.last_verified_at) : "never"}
                                {e.expires_on ? ` · re-verify by ${formatDate(e.expires_on)}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Mark verified today"
                                  onClick={() => reverify(e)}
                                >
                                  <CheckCircle2
                                    className={cn(
                                      "h-4 w-4",
                                      state === "current"
                                        ? "text-success"
                                        : "text-muted-foreground",
                                    )}
                                  />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Delete entry"
                                  onClick={() => remove(e.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {open ? (
        <EntryDialog
          draft={editing}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
          onSaved={() => invalidate(["proof_points"])}
        />
      ) : null}
    </div>
  );
}
