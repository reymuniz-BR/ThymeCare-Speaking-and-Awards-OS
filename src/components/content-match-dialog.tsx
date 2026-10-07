import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/chip";
import { cn } from "@/lib/utils";
import { labelize } from "@/lib/program";
import {
  useProofPoints,
  useContentAssets,
  useSnippets,
  useSubmissionFieldLibrary,
} from "@/lib/hooks";
import { isCitable } from "@/lib/proof-points";
import { matchContent } from "@/lib/content-match";
import type { AttachedContent, MatchSubject } from "@/lib/content-match";
import { Check, ExternalLink, Library } from "lucide-react";

/**
 * Finds and attaches reusable Content Library material (prior submissions,
 * executive bios, boilerplate) to a discovery candidate before it is promoted.
 */
export function ContentMatchDialog({
  subject,
  open,
  attached,
  onOpenChange,
  onSave,
}: {
  subject: MatchSubject | null;
  open: boolean;
  attached: AttachedContent[];
  onOpenChange: (open: boolean) => void;
  onSave: (items: AttachedContent[]) => void | Promise<void>;
}) {
  const { data: proofPoints = [], isLoading: lp } = useProofPoints();
  const { data: assets = [], isLoading: la } = useContentAssets();
  const { data: snippets = [], isLoading: ls } = useSnippets();
  const { data: fields = [], isLoading: lf } = useSubmissionFieldLibrary();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, AttachedContent>>(
    Object.fromEntries(attached.map((a) => [`${a.kind}:${a.id}`, a])),
  );
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    if (!subject) return [];
    const all = matchContent(
      subject,
      {
        proofPoints: proofPoints.filter((p) => isCitable(p)),
        assets,
        snippets,
        submissionFields: fields,
      },
      24,
    );
    const term = q.trim().toLowerCase();
    return term
      ? all.filter((m) => `${m.title} ${m.preview} ${m.category}`.toLowerCase().includes(term))
      : all;
  }, [subject, proofPoints, assets, snippets, fields, q]);

  const loading = lp || la || ls || lf;
  const selected = Object.values(picked);

  function toggle(item: AttachedContent) {
    const key = `${item.kind}:${item.id}`;
    setPicked((cur) => {
      const next = { ...cur };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(selected);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Library className="h-4 w-4 text-primary" /> Matching content
          </DialogTitle>
          <DialogDescription>
            Reusable material ranked against “{subject?.name}”. Attach previous submission answers,
            executive bios and approved boilerplate so the draft starts from proven language.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter matches…"
          className="h-9 text-[13px]"
        />

        <ul className="max-h-[46vh] divide-y divide-border/60 overflow-y-auto rounded border border-border">
          {loading ? (
            <li className="px-4 py-10 text-center text-[12px] text-muted-foreground">
              Loading library…
            </li>
          ) : matches.length === 0 ? (
            <li className="px-4 py-10 text-center text-[12px] text-muted-foreground">
              No library material matches yet. Sync the Drive library or save snippets first.
            </li>
          ) : (
            matches.map((m) => {
              const key = `${m.kind}:${m.id}`;
              const on = Boolean(picked[key]);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() =>
                      toggle({
                        kind: m.kind,
                        id: m.id,
                        title: m.title,
                        subtitle: m.subtitle ?? null,
                        url: m.url ?? null,
                      })
                    }
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted",
                      on && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-medium">{m.title}</span>
                        <Chip tone="neutral">{labelize(m.category)}</Chip>
                        <Chip
                          tone={
                            m.score >= 0.5 ? "success" : m.score >= 0.25 ? "warning" : "neutral"
                          }
                        >
                          {Math.round(m.score * 100)}% match
                        </Chip>
                        {m.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </span>
                      {m.subtitle ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {m.subtitle}
                        </span>
                      ) : null}
                      <span className="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                        {m.preview}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {m.reasons.join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[12px] text-muted-foreground">
            {selected.length} item{selected.length === 1 ? "" : "s"} attached
          </span>
          <span className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Attach to candidate
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
