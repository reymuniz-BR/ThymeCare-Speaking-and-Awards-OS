/**
 * Submission workspace tooling: bulk question capture, completeness tracking
 * and export.
 *
 * Typing an award's twelve questions in by hand was the slowest part of
 * starting a submission, so the import dialog reads them straight off the
 * call-for-entries page or pasted application text and lets the team confirm
 * before anything is written.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { extractQuestions } from "@/lib/questions.functions";
import type { ExtractedQuestion } from "@/lib/questions.server";
import { wordCount } from "@/lib/program";
import { limitState } from "@/lib/draft";
import { cn } from "@/lib/utils";
import { Copy, Download, Loader2, ListPlus, Wand2 } from "lucide-react";

type Row = ExtractedQuestion & { include: boolean };

export function QuestionImportDialog({
  submissionId,
  startPosition,
  defaultUrl,
  onImported,
}: {
  submissionId: string;
  startPosition: number;
  defaultUrl?: string | null;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const run = useServerFn(extractQuestions);

  async function extract() {
    setBusy(true);
    try {
      const res = await run({
        data: { ...(url.trim() ? { url: url.trim() } : {}), ...(text.trim() ? { text } : {}) },
      });
      if (!res.questions.length) {
        toast.error("No application questions were found in that source.");
        return;
      }
      setRows(res.questions.map((q) => ({ ...q, include: true })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that source");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const chosen = (rows ?? []).filter((r) => r.include);
    if (!chosen.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("submission_fields").insert(
        chosen.map((q, i) => ({
          submission_id: submissionId,
          prompt: q.prompt,
          answer: "",
          position: startPosition + i,
          word_limit: q.word_limit,
          char_limit: q.char_limit,
        })),
      );
      if (error) throw new Error(error.message);
      toast.success(`Added ${chosen.length} question${chosen.length === 1 ? "" : "s"}`);
      setRows(null);
      setText("");
      setOpen(false);
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add those questions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <ListPlus className="h-3.5 w-3.5" /> Import questions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import application questions</DialogTitle>
          <DialogDescription>
            Point at the call-for-entries page or paste the application text. Nothing is added until
            you confirm the list.
          </DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">Application or CFP URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/how-to-enter"
                className="h-9"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">Or paste the application text</Label>
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the questions, section headings and any word limits…"
                className="text-[12.5px]"
              />
            </div>
            <DialogFooter>
              <Button onClick={extract} disabled={busy || (!url.trim() && !text.trim())} size="sm">
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Read questions
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              {rows.length} question{rows.length === 1 ? "" : "s"} found. Uncheck anything that is
              not a written answer, and adjust limits if needed.
            </p>
            <ul className="max-h-[22rem] space-y-2 overflow-auto pr-1">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border border-border p-2.5",
                    !r.include && "opacity-50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) =>
                        setRows((prev) =>
                          (prev ?? []).map((x, j) =>
                            j === i ? { ...x, include: e.target.checked } : x,
                          ),
                        )
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <Textarea
                        rows={2}
                        value={r.prompt}
                        onChange={(e) =>
                          setRows((prev) =>
                            (prev ?? []).map((x, j) =>
                              j === i ? { ...x, prompt: e.target.value } : x,
                            ),
                          )
                        }
                        className="text-[12.5px]"
                      />
                      {r.note ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">{r.note}</p>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Words"
                          value={r.word_limit ?? ""}
                          onChange={(e) =>
                            setRows((prev) =>
                              (prev ?? []).map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      word_limit: e.target.value ? Number(e.target.value) : null,
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="h-8 w-24 text-[12px]"
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Chars"
                          value={r.char_limit ?? ""}
                          onChange={(e) =>
                            setRows((prev) =>
                              (prev ?? []).map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      char_limit: e.target.value ? Number(e.target.value) : null,
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="h-8 w-24 text-[12px]"
                        />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRows(null)}>
                Back
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Add {rows.filter((r) => r.include).length} to workspace
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Completeness ----------------------------- */

export type FieldLike = {
  prompt: string;
  answer: string;
  word_limit: number | null;
  char_limit: number | null;
};

export function submissionProgress(fields: FieldLike[]) {
  const answered = fields.filter((f) => f.answer.trim().length > 0).length;
  const over = fields.filter((f) => {
    const s = limitState(f.answer, wordCount(f.answer), f.word_limit, f.char_limit);
    return s.overWords || s.overChars;
  }).length;
  const pct = fields.length ? Math.round((answered / fields.length) * 100) : 0;
  return { total: fields.length, answered, over, pct };
}

export function SubmissionProgress({ fields }: { fields: FieldLike[] }) {
  const p = submissionProgress(fields);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="tabnum text-[13px] font-semibold">
          {p.answered}/{p.total} answered
        </span>
        <span className="tabnum text-[12px] text-muted-foreground">{p.pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", p.pct === 100 ? "bg-success" : "bg-primary")}
          style={{ width: `${p.pct}%` }}
        />
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        {p.total === 0
          ? "Add or import the application questions to start tracking completeness."
          : p.over > 0
            ? `${p.over} answer${p.over === 1 ? " is" : "s are"} over the stated limit.`
            : p.pct === 100
              ? "Every question has an answer. Review, then export for the client."
              : `${p.total - p.answered} question${p.total - p.answered === 1 ? "" : "s"} still to draft.`}
      </p>
    </div>
  );
}

/* ---------------------------------- Export -------------------------------- */

export function buildExport(input: {
  title: string;
  opportunity: string | null;
  fields: FieldLike[];
}): string {
  const lines = [`# ${input.title}`];
  if (input.opportunity) lines.push(`**Opportunity:** ${input.opportunity}`);
  lines.push(`**Exported:** ${new Date().toLocaleDateString()}`, "");
  input.fields.forEach((f, i) => {
    const counts = `${wordCount(f.answer)} words${f.word_limit ? ` / ${f.word_limit} limit` : ""}`;
    lines.push(
      `## ${i + 1}. ${f.prompt}`,
      `_${counts}_`,
      "",
      f.answer.trim() || "_Not drafted yet._",
      "",
    );
  });
  return lines.join("\n");
}

export function ExportButtons({
  title,
  opportunity,
  fields,
}: {
  title: string;
  opportunity: string | null;
  fields: FieldLike[];
}) {
  const text = () => buildExport({ title, opportunity, fields });
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-[12px]"
        onClick={async () => {
          await navigator.clipboard.writeText(text());
          toast.success("Submission copied to the clipboard");
        }}
      >
        <Copy className="h-3.5 w-3.5" /> Copy all
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-[12px]"
        onClick={() => {
          const blob = new Blob([text()], { type: "text/markdown;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${title.replace(/[^\w\s-]/g, "").slice(0, 60) || "submission"}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        <Download className="h-3.5 w-3.5" /> Download
      </Button>
    </div>
  );
}
