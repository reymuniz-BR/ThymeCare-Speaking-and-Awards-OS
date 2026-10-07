import { useState } from "react";
import { Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Copy, RefreshCw } from "lucide-react";
import { useInvalidate, useMasterMessaging } from "@/lib/hooks";
import { syncMasterMessaging } from "@/lib/messaging.functions";
import { MASTER_MESSAGING_DOC_URL } from "@/lib/messaging";
import { formatDate } from "@/lib/program";

/**
 * Pinned view of the client's master messaging document. Its sections are also
 * always fed to the strategy brief and answer drafting as approved language.
 */
export function MasterMessagingPanel() {
  const { data: sections = [], isLoading } = useMasterMessaging();
  const invalidate = useInvalidate();
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    try {
      const result = await syncMasterMessaging();
      invalidate(["master_messaging", "content_snippets"]);
      toast.success(`Pulled ${result.sections} messaging sections`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not pull the messaging document");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Panel
      title="Master messaging"
      hint="Always fed to briefs and drafts"
      action={
        <a
          href={MASTER_MESSAGING_DOC_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
        >
          Open doc <ExternalLink className="h-3 w-3" />
        </a>
      }
      bodyClassName="p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-muted-foreground">
          {isLoading
            ? "Loading…"
            : sections.length
              ? `${sections.length} sections · updated ${formatDate(sections[0]?.updated_at ?? null)}`
              : "Not pulled yet"}
        </span>
        <Button variant="outline" size="sm" className="h-7 text-[12px]" disabled={syncing} onClick={sync}>
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Pulling…" : "Pull latest"}
        </Button>
      </div>

      <ul className="max-h-[24rem] space-y-2 overflow-auto pr-0.5">
        {sections.map((s) => (
          <li
            key={s.id}
            className="rounded-md border border-border bg-surface-2/40 p-2.5 transition-colors hover:border-primary/35"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="text-left text-[12.5px] font-medium hover:underline"
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                {s.title}
              </button>
              <button
                type="button"
                title="Copy section"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(s.body);
                  toast.success("Messaging copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p
              className={`mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted-foreground ${
                openId === s.id ? "" : "line-clamp-3"
              }`}
            >
              {s.body}
            </p>
          </li>
        ))}
        {!isLoading && sections.length === 0 ? (
          <li className="py-6 text-center text-[12px] text-muted-foreground">
            Pull the master messaging document to make its pillars available here and to every AI
            draft.
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}
