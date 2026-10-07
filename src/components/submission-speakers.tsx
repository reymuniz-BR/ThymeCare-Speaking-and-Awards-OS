import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Panel } from "@/components/ui-kit";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate } from "@/lib/hooks";
import { SPEAKER_ROLES, useSpeakers, useSubmissionSpeakers } from "@/lib/speakers";

export function SubmissionSpeakers({ submissionId }: { submissionId: string }) {
  const invalidate = useInvalidate();
  const { data: speakers = [] } = useSpeakers();
  const { data: attached = [], isLoading } = useSubmissionSpeakers(submissionId);
  const [speakerId, setSpeakerId] = useState("");
  const [role, setRole] = useState<string>(SPEAKER_ROLES[0]);

  const attachedIds = new Set(attached.map((a) => a.speaker_id));
  const available = speakers.filter((s) => !attachedIds.has(s.id));

  function refresh() {
    invalidate(["submission_speakers", "speaker_usage"]);
  }

  async function attach() {
    if (!speakerId) return;
    const { error } = await supabase
      .from("submission_speakers")
      .insert({ submission_id: submissionId, speaker_id: speakerId, role });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSpeakerId("");
    refresh();
    toast.success("Speaker attached");
  }

  async function updateRole(id: string, next: string) {
    const { error } = await supabase
      .from("submission_speakers")
      .update({ role: next })
      .eq("submission_id", submissionId)
      .eq("speaker_id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function detach(id: string) {
    const { error } = await supabase
      .from("submission_speakers")
      .delete()
      .eq("submission_id", submissionId)
      .eq("speaker_id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  return (
    <Panel
      title="Speakers"
      hint="Execs, SMEs and external co-presenters on this submission"
      bodyClassName="p-3"
      action={
        <Link to="/speakers" className="text-[11.5px] text-primary hover:underline">
          Manage
        </Link>
      }
    >
      {isLoading ? (
        <p className="px-1 py-2 text-[12px] text-muted-foreground">Loading…</p>
      ) : attached.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-muted-foreground">
          No speakers attached yet. Attach the execs or co-presenters this submission features.
        </p>
      ) : (
        <ul className="space-y-2">
          {attached.map((a) => (
            <li
              key={a.speaker_id}
              className="rounded-md border border-border bg-surface-2/40 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">
                    {a.speakers?.full_name ?? "Unknown speaker"}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {[a.speakers?.title, a.speakers?.organization].filter(Boolean).join(" · ") ||
                      "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {a.speakers?.is_external ? <Chip tone="warning">External</Chip> : null}
                  <button
                    type="button"
                    onClick={() => detach(a.speaker_id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove speaker"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <select
                value={a.role ?? ""}
                onChange={(e) => updateRole(a.speaker_id, e.target.value)}
                className="mt-2 h-7 w-full rounded-md border border-border bg-background px-1.5 text-[11.5px]"
              >
                <option value="">No role set</option>
                {SPEAKER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
        <select
          value={speakerId}
          onChange={(e) => setSpeakerId(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-[11.5px]"
        >
          <option value="">Add speaker…</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
              {s.is_external ? " (external)" : ""}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 w-28 rounded-md border border-border bg-background px-1.5 text-[11.5px]"
        >
          {SPEAKER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={attach}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {available.length === 0 && speakers.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Everyone in the directory is already attached.
        </p>
      ) : null}
    </Panel>
  );
}
