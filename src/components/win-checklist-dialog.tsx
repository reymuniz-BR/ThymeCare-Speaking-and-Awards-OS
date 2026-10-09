import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trophy } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityUrl?: string | null;
  onSaved?: () => void;
};

/**
 * Post-win checklist.
 *
 * Fires the moment a submission is marked won so the announcement date, the
 * press/social plan and badge usage are captured while the news is fresh, and
 * the win can be banked as a pending-approval proof point in one step.
 */
export function WinChecklistDialog({
  open,
  onOpenChange,
  submissionId,
  opportunityId,
  opportunityName,
  opportunityUrl,
  onSaved,
}: Props) {
  const year = new Date().getFullYear();
  const defaultTitle = useMemo(
    () => `Named ${opportunityName ?? "award"} ${year} winner`,
    [opportunityName, year],
  );

  const [announcementDate, setAnnouncementDate] = useState("");
  const [pressPlan, setPressPlan] = useState("");
  const [badgeUsage, setBadgeUsage] = useState("");
  const [createProofPoint, setCreateProofPoint] = useState(true);
  const [proofTitle, setProofTitle] = useState(defaultTitle);
  const [proofContent, setProofContent] = useState(
    `Thyme Care was named a ${year} winner of ${opportunityName ?? "this award"}.`,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const notes = [
        announcementDate ? `Announcement date: ${announcementDate}` : null,
        pressPlan.trim() ? `Press / social plan: ${pressPlan.trim()}` : null,
        badgeUsage.trim() ? `Badge usage: ${badgeUsage.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      if (notes) {
        const { error } = await supabase
          .from("submissions")
          .update({ outcome: "won", outcome_notes: notes })
          .eq("id", submissionId);
        if (error) throw error;
      }

      if (announcementDate && opportunityId) {
        const { error } = await supabase
          .from("opportunities")
          .update({ announcement_date: announcementDate })
          .eq("id", opportunityId);
        if (error) throw error;
      }

      if (createProofPoint && proofTitle.trim() && proofContent.trim()) {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("proof_points").insert({
          title: proofTitle.trim(),
          kind: "award_recognition",
          content: proofContent.trim(),
          source: opportunityName ?? null,
          source_url: opportunityUrl ?? null,
          source_date: announcementDate || null,
          approved: false,
          notes: "Auto-created from a submission win — pending approval.",
          tags: ["award", "win", String(year)],
          created_by: auth.user?.id ?? null,
        });
        if (error) throw error;
      }

      toast.success(
        createProofPoint ? "Win captured — proof point added pending approval" : "Win captured",
      );
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the win details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Post-win checklist
          </DialogTitle>
          <DialogDescription>
            {opportunityName ? `${opportunityName} — ` : ""}capture the follow-through now so
            nothing slips after the announcement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-[12px]">Announcement date</Label>
            <Input
              type="date"
              value={announcementDate}
              onChange={(e) => setAnnouncementDate(e.target.value)}
              className="h-9"
            />
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Also updates the opportunity record.
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px]">Press or social plan</Label>
            <Textarea
              rows={3}
              value={pressPlan}
              onChange={(e) => setPressPlan(e.target.value)}
              placeholder="Press release, LinkedIn post from CEO, client comms…"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px]">Badge / logo usage</Label>
            <Textarea
              rows={2}
              value={badgeUsage}
              onChange={(e) => setBadgeUsage(e.target.value)}
              placeholder="Where the winner badge goes (site footer, email signature, deck), and usage rules."
            />
          </div>

          <div className="rounded-md border border-border bg-surface-2/40 p-3">
            <label className="flex items-start gap-2">
              <Checkbox
                checked={createProofPoint}
                onCheckedChange={(v) => setCreateProofPoint(v === true)}
                className="mt-0.5"
              />
              <span className="text-[12.5px] font-medium">
                Add this win to the proof point bank (pending approval)
              </span>
            </label>
            {createProofPoint ? (
              <div className="mt-3 space-y-2">
                <Input
                  value={proofTitle}
                  onChange={(e) => setProofTitle(e.target.value)}
                  className="h-9"
                  placeholder="Named [award] 2026 winner"
                />
                <Textarea
                  rows={3}
                  value={proofContent}
                  onChange={(e) => setProofContent(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Skip for now
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save win details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
