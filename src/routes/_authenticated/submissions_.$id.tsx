import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { syncOpportunityStatus } from "@/lib/submission-pipeline";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { Panel } from "@/components/ui-kit";
import { NativeSelect } from "@/components/new-opportunity-dialog";
import { StrategyBriefPanel } from "@/components/strategy-brief";
import { AnswerDrafter } from "@/components/answer-drafter";
import { SubmissionSpeakers } from "@/components/submission-speakers";
import { MasterMessagingPanel } from "@/components/master-messaging";
import { WinChecklistDialog } from "@/components/win-checklist-dialog";
import {
  QuestionImportDialog,
  SubmissionProgress,
  ExportButtons,
} from "@/components/submission-tools";

import { supabase } from "@/integrations/supabase/client";
import { useInvalidate, useSnippets, useSubmission } from "@/lib/hooks";
import { SUBMISSION_STAGES, STAGE_TONE, labelize } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, ExternalLink, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/submissions_/$id")({
  head: () => ({
    meta: [
      { title: "Draft submission — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Draft answers against application questions and repurpose approved content from previous submissions.",
      },
      { property: "og:title", content: "Draft submission — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Answer application questions with reusable, approved language.",
      },
    ],
  }),
  component: SubmissionDetail,
});

function SubmissionDetail() {
  const { id } = Route.useParams();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const { data, isLoading } = useSubmission(id);
  const { data: snippets = [] } = useSnippets();
  const [newField, setNewField] = useState({ prompt: "", wordLimit: "", charLimit: "" });
  const [winOpen, setWinOpen] = useState(false);

  if (isLoading) {
    return (
      <AppShell title="Submission">
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell title="Submission">
        <p className="text-[13px] text-muted-foreground">
          This submission no longer exists.{" "}
          <Link to="/submissions" className="text-primary hover:underline">
            Back to submissions
          </Link>
        </p>
      </AppShell>
    );
  }

  const fields = data.submission_fields ?? [];
  const applicationUrl = data.opportunities?.application_url ?? data.opportunities?.url ?? null;

  async function refresh() {
    invalidate(["submission", "submissions", "activity"]);
  }

  async function setStage(stage: string) {
    const { error } = await supabase
      .from("submissions")
      .update({
        stage: stage as never,
        submitted_at: stage === "submitted" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await syncOpportunityStatus(data!.opportunity_id, stage);
    invalidate(["opportunities"]);
    refresh();
    toast.success(`Moved to ${labelize(stage)}`);
    if (stage === "won") setWinOpen(true);
  }

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!newField.prompt.trim()) return;
    const { error } = await supabase.from("submission_fields").insert({
      submission_id: id,
      prompt: newField.prompt,
      answer: "",
      position: fields.length,
      word_limit: newField.wordLimit ? Number(newField.wordLimit) : null,
      char_limit: newField.charLimit ? Number(newField.charLimit) : null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewField({ prompt: "", wordLimit: "", charLimit: "" });
    refresh();
  }

  async function deleteSubmission() {
    setDeleting(true);
    const { error } = await supabase.from("submissions").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error(
        error.message.includes("policy") || error.message.includes("permission")
          ? "Only admins and managers can delete a submission."
          : error.message,
      );
      return;
    }
    invalidate(["submissions", "submission", "activity", "opportunities"]);
    toast.success("Submission deleted");
    navigate({ to: "/submissions" });
  }

  async function removeField(fieldId: string) {
    await supabase.from("submission_fields").delete().eq("id", fieldId);
    refresh();
  }

  return (
    <AppShell
      title={data.title}
      eyebrow={
        <>
          <Link to="/submissions" className="hover:text-foreground hover:underline">
            Submissions
          </Link>
          <span className="text-border">/</span>
          <span className="tracking-[0.12em] uppercase">Drafting workspace</span>
        </>
      }
      subtitle={data.opportunities?.name ?? "Unlinked submission"}
      actions={
        <>
          <Chip tone={STAGE_TONE[data.stage]}>{labelize(data.stage)}</Chip>
          {applicationUrl ? (
            <a
              href={applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              Open application page <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <a
            href={`https://docs.google.com/document/create?title=${encodeURIComponent(data.title)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] hover:bg-muted"
            title="Opens a new Google Doc titled after this submission"
          >
            Draft in Google Docs <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {data.opportunities ? (
            <Link
              to="/opportunities/$id"
              params={{ id: data.opportunities.id }}
              className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-[12.5px] hover:bg-muted"
            >
              View opportunity
            </Link>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12.5px] text-muted-foreground hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{data.title}” and all of its questions, drafted answers, version history and
                  attached speakers will be permanently removed. The opportunity itself stays in the
                  database. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={(e) => {
                    e.preventDefault();
                    deleteSubmission();
                  }}
                >
                  {deleting ? "Deleting…" : "Delete submission"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    >
      <WinChecklistDialog
        open={winOpen}
        onOpenChange={setWinOpen}
        submissionId={id}
        opportunityId={data.opportunity_id}
        opportunityName={data.opportunities?.name ?? null}
        opportunityUrl={applicationUrl}
        onSaved={() => {
          invalidate(["opportunities", "proof_points"]);
          refresh();
        }}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="space-y-3">
          <StrategyBriefPanel
            submissionId={id}
            opportunityName={data.opportunities?.name ?? null}
          />

          {fields.map((f) => (
            <AnswerDrafter
              key={f.id}
              field={{
                id: f.id,
                submission_id: id,
                prompt: f.prompt,
                answer: f.answer,
                word_limit: f.word_limit,
                char_limit: f.char_limit,
              }}
              onRemove={removeField}
            />
          ))}

          <form
            onSubmit={addField}
            className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3"
          >
            <div className="flex-1">
              <Label className="mb-1.5 block text-[12px]">Add application question</Label>
              <Input
                value={newField.prompt}
                onChange={(e) => setNewField((s) => ({ ...s, prompt: e.target.value }))}
                placeholder="Describe the innovation and its measurable impact…"
                className="h-9"
              />
            </div>
            <div className="w-24">
              <Label className="mb-1.5 block text-[12px]">Word limit</Label>
              <Input
                type="number"
                min={1}
                value={newField.wordLimit}
                onChange={(e) => setNewField((s) => ({ ...s, wordLimit: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="w-24">
              <Label className="mb-1.5 block text-[12px]">Char limit</Label>
              <Input
                type="number"
                min={1}
                value={newField.charLimit}
                onChange={(e) => setNewField((s) => ({ ...s, charLimit: e.target.value }))}
                className="h-9"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="h-9">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <QuestionImportDialog
              submissionId={id}
              startPosition={fields.length}
              defaultUrl={applicationUrl}
              onImported={refresh}
            />
          </form>
        </div>

        <aside className="space-y-4">
          <Panel title="Progress" bodyClassName="p-4">
            <SubmissionProgress fields={fields} />
            <div className="mt-3">
              <ExportButtons
                title={data.title}
                opportunity={data.opportunities?.name ?? null}
                fields={fields}
              />
            </div>
          </Panel>

          <Panel title="Pipeline stage" bodyClassName="p-4">
            <NativeSelect value={data.stage} onChange={setStage} options={SUBMISSION_STAGES} />
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Moving a stage keeps the opportunity record in sync automatically.
            </p>
          </Panel>

          {data.stage === "won" ? (
            <Panel title="Post-win follow-through" bodyClassName="p-4">
              <p className="text-[11.5px] text-muted-foreground">
                Capture the announcement date, press plan and badge usage, and bank the win as a
                proof point.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-8"
                onClick={() => setWinOpen(true)}
              >
                Open win checklist
              </Button>
            </Panel>
          ) : null}

          <SubmissionSpeakers submissionId={id} />

          <MasterMessagingPanel />

          <Panel
            title="Source material"
            hint="Approved language available to this draft"
            bodyClassName="p-3"
          >
            <ul className="max-h-[28rem] space-y-2 overflow-auto pr-0.5">
              {snippets.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-border bg-surface-2/40 p-2.5 transition-colors hover:border-primary/35"
                >
                  <span className="block text-[12.5px] font-medium">{s.title}</span>
                  <span className="mt-0.5 line-clamp-3 block text-[11.5px] leading-relaxed text-muted-foreground">
                    {s.body}
                  </span>
                </li>
              ))}
              {snippets.length === 0 ? (
                <li className="py-6 text-center text-[12px] text-muted-foreground">
                  No approved language yet —{" "}
                  <Link to="/library" className="text-primary hover:underline">
                    add some in the library
                  </Link>
                  .
                </li>
              ) : null}
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
