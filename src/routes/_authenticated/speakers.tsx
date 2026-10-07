import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Panel, EmptyState } from "@/components/ui-kit";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate } from "@/lib/hooks";
import { parseTopics, useSpeakerUsage, useSpeakers, type SpeakerRow } from "@/lib/speakers";

export const Route = createFileRoute("/_authenticated/speakers")({
  head: () => ({
    meta: [
      { title: "Speakers — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Directory of Thyme Care executives, subject matter experts and external co-presenters with bios, topics and availability.",
      },
      { property: "og:title", content: "Speakers — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Manage exec and SME bios, topics and availability for speaking submissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpeakersPage,
});

type Draft = {
  full_name: string;
  title: string;
  organization: string;
  email: string;
  availability: string;
  topics: string;
  bio: string;
  is_external: boolean;
};

const EMPTY: Draft = {
  full_name: "",
  title: "",
  organization: "",
  email: "",
  availability: "",
  topics: "",
  bio: "",
  is_external: false,
};

function toDraft(s: SpeakerRow): Draft {
  return {
    full_name: s.full_name,
    title: s.title ?? "",
    organization: s.organization ?? "",
    email: s.email ?? "",
    availability: s.availability ?? "",
    topics: (s.topics ?? []).join(", "),
    bio: s.bio ?? "",
    is_external: s.is_external,
  };
}

function SpeakersPage() {
  const { data: speakers = [], isLoading } = useSpeakers();
  const { data: usage = {} } = useSpeakerUsage();
  const invalidate = useInvalidate();

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return speakers;
    return speakers.filter((s) =>
      [s.full_name, s.title, s.organization, (s.topics ?? []).join(" "), s.bio]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [speakers, query]);

  function startNew() {
    setEditingId(null);
    setDraft(EMPTY);
    setShowForm(true);
  }

  function startEdit(s: SpeakerRow) {
    setEditingId(s.id);
    setDraft(toDraft(s));
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.full_name.trim()) {
      toast.error("A name is required");
      return;
    }
    const payload = {
      full_name: draft.full_name.trim(),
      title: draft.title.trim() || null,
      organization: draft.organization.trim() || null,
      email: draft.email.trim() || null,
      availability: draft.availability.trim() || null,
      topics: parseTopics(draft.topics),
      bio: draft.bio.trim() || null,
      is_external: draft.is_external,
    };
    const { error } = editingId
      ? await supabase
          .from("speakers")
          .update(payload as never)
          .eq("id", editingId)
      : await supabase.from("speakers").insert(payload as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["speakers"]);
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY);
    toast.success(editingId ? "Speaker updated" : "Speaker added");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("speakers").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["speakers", "speaker_usage", "submission_speakers"]);
    toast.success("Speaker removed");
  }

  return (
    <AppShell
      title="Speakers"
      subtitle="Executives, subject matter experts and external co-presenters available to the program"
      actions={
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, topic or org…"
            className="h-8 w-56 text-[12.5px]"
          />
          <Button size="sm" className="h-8" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" /> New speaker
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <EmptyState title="No speakers yet">
              Add the execs and SMEs you put forward for speaking slots and awards, plus any
              external co-presenters.
            </EmptyState>
          ) : (
            filtered.map((s) => (
              <Panel key={s.id} bodyClassName="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold">{s.full_name}</h3>
                      {s.is_external ? (
                        <Chip tone="warning">External</Chip>
                      ) : (
                        <Chip tone="info">Thyme Care</Chip>
                      )}
                      {usage[s.id] ? (
                        <Chip tone="neutral">
                          {usage[s.id]} submission{usage[s.id] === 1 ? "" : "s"}
                        </Chip>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {[s.title, s.organization].filter(Boolean).join(" · ") || "—"}
                      {s.email ? ` · ${s.email}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${s.full_name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${s.full_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {s.topics?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.topics.map((t) => (
                      <Chip key={t} tone="neutral">
                        {t}
                      </Chip>
                    ))}
                  </div>
                ) : null}

                {s.bio ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed whitespace-pre-line text-muted-foreground">
                    {s.bio}
                  </p>
                ) : null}

                {s.availability ? (
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    <span className="font-medium text-foreground">Availability:</span>{" "}
                    {s.availability}
                  </p>
                ) : null}
              </Panel>
            ))
          )}
        </div>

        <aside>
          {showForm ? (
            <Panel
              title={editingId ? "Edit speaker" : "New speaker"}
              bodyClassName="p-4"
              action={
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close form"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              }
            >
              <form onSubmit={save} className="space-y-3">
                <div>
                  <Label className="mb-1.5 block text-[12px]">Full name</Label>
                  <Input
                    value={draft.full_name}
                    onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Title / role</Label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="h-9"
                    placeholder="Chief Medical Officer"
                  />
                </div>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={draft.is_external}
                    onChange={(e) => setDraft((d) => ({ ...d, is_external: e.target.checked }))}
                  />
                  External co-presenter (not Thyme Care)
                </label>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Organization</Label>
                  <Input
                    value={draft.organization}
                    onChange={(e) => setDraft((d) => ({ ...d, organization: e.target.value }))}
                    className="h-9"
                    placeholder={draft.is_external ? "Partner health plan" : "Thyme Care"}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Email</Label>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Topics (comma separated)</Label>
                  <Input
                    value={draft.topics}
                    onChange={(e) => setDraft((d) => ({ ...d, topics: e.target.value }))}
                    className="h-9"
                    placeholder="oncology navigation, value-based care"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Bio</Label>
                  <Textarea
                    value={draft.bio}
                    onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                    rows={6}
                    className="text-[12.5px]"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">Availability notes</Label>
                  <Input
                    value={draft.availability}
                    onChange={(e) => setDraft((d) => ({ ...d, availability: e.target.value }))}
                    className="h-9"
                    placeholder="No travel in Q4"
                  />
                </div>
                <Button type="submit" size="sm" className="h-9 w-full">
                  {editingId ? "Save changes" : "Add speaker"}
                </Button>
              </form>
            </Panel>
          ) : (
            <Panel title="Speaker directory" bodyClassName="p-4">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Keep bios and topics current here, then attach speakers to any submission from its
                drafting workspace. External co-presenters live in the same directory, flagged so
                they are easy to spot.
              </p>
              <Button size="sm" variant="outline" className="mt-3 h-8 w-full" onClick={startNew}>
                <Plus className="h-3.5 w-3.5" /> New speaker
              </Button>
            </Panel>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
