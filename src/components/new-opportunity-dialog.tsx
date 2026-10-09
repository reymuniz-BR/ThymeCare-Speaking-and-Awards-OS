import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { OPPORTUNITY_TYPES, TYPE_LABEL } from "@/lib/program";
import type { OpportunityType } from "@/lib/program";
import { TIMEZONE_LABELS, TIMEZONE_VALUES } from "@/lib/calendar";
import { TaxonomySelect } from "@/components/taxonomy";
import { useInvalidate } from "@/lib/hooks";
import { autofillOpportunity } from "@/lib/autofill.functions";
import { toast } from "sonner";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { CLIENT_APPROVALS } from "@/lib/budget";

export function NewOpportunityDialog({
  defaults,
  trigger,
  onCreated,
}: {
  defaults?: Partial<{
    name: string;
    organizer: string;
    url: string;
    type: OpportunityType;
    description: string;
    discoveryId: string;
    deadline: string;
    application_url: string;
    event_date: string;
    category: string;
    region: string;
    fit_score: string;
    /** Provenance carried over from Discover, e.g. "Discovered via AI search". */
    source: string;
    notes: string;
  }>;
  trigger?: React.ReactNode;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const [form, setForm] = useState({
    name: defaults?.name ?? "",
    organizer: defaults?.organizer ?? "",
    url: defaults?.url ?? "",
    application_url: defaults?.application_url ?? "",
    type: (defaults?.type === "speaking" ? "speaking" : "award") as OpportunityType,
    status: "monitoring",
    priority: "medium",
    recommendation: "needs_review",
    deadline_type: "estimated",
    tier: 2,
    region: defaults?.region ?? "",
    location: "",
    category: defaults?.category ?? "",
    audience: "",
    description: defaults?.description ?? "",
    final_deadline: defaults?.deadline ?? "",
    deadline_time: "",
    deadline_timezone: "America/Los_Angeles",
    early_deadline: "",
    open_date: "",
    event_date: defaults?.event_date ?? "",
    announcement_date: "",
    fit_score: defaults?.fit_score ?? "",
    client_approval: "needs_approval",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const [linkUrl, setLinkUrl] = useState(defaults?.url ?? "");
  const [autofilling, setAutofilling] = useState(false);
  const [autofilled, setAutofilled] = useState<string[]>([]);

  async function autofill() {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Paste a full link starting with http:// or https://");
      return;
    }
    setAutofilling(true);
    try {
      const r = await autofillOpportunity({ data: { url } });
      const filled: string[] = [];
      setForm((f) => {
        const next = { ...f, url };
        const put = <K extends keyof typeof form>(key: K, value: string) => {
          // Never clobber something the user already typed.
          if (
            !value ||
            (next[key] !== "" &&
              next[key] !== undefined &&
              next[key] !== null &&
              String(next[key]).length)
          )
            return;
          (next[key] as unknown as string) = value;
          filled.push(key as string);
        };
        put("name", r.name);
        put("organizer", r.organizer);
        put("category", r.category);
        put("description", r.description);
        put("region", r.region);
        put("location", r.location);
        put("audience", r.audience);
        put("application_url", r.application_url);
        put("open_date", r.open_date);
        put("early_deadline", r.early_deadline);
        put("final_deadline", r.final_deadline);
        put("event_date", r.event_date);
        put("announcement_date", r.announcement_date);
        next.type = r.type;
        next.deadline_type = r.deadline_type === "unknown" ? "estimated" : r.deadline_type;
        return next;
      });
      setAutofilled(filled);
      if (filled.length)
        toast.success(
          `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from the link — review before saving`,
        );
      else toast.info("Nothing new to fill from that link");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that link");
    } finally {
      setAutofilling(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          name: form.name,
          organizer: form.organizer || null,
          url: form.url || null,
          application_url: form.application_url || null,
          type: form.type,
          status: form.status,
          priority: form.priority,
          recommendation: form.recommendation,
          deadline_type: form.deadline_type,
          tier: form.tier,
          region: form.region || null,
          location: form.location || null,
          category: form.category || null,
          audience: form.audience || null,
          description: form.description || null,
          fit_score: form.fit_score ? Number(form.fit_score) : null,
          client_approval: form.client_approval,
          open_date: form.open_date || null,
          early_deadline: form.early_deadline || null,
          final_deadline: form.final_deadline || null,
          deadline_time: form.deadline_time || null,
          deadline_timezone: form.deadline_time ? form.deadline_timezone : null,
          event_date: form.event_date || null,
          announcement_date: form.announcement_date || null,
          created_by: userData.user?.id ?? null,
          owner_id: userData.user?.id ?? null,
          created_from_discovery_id: defaults?.discoveryId ?? null,
          source: defaults?.source ?? null,
          notes: defaults?.notes ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;

      invalidate(["opportunities", "activity"]);
      toast.success("Opportunity added");
      setOpen(false);
      onCreated?.(data.id);
      if (!onCreated) navigate({ to: "/opportunities/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save opportunity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5" />
            New opportunity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New opportunity</DialogTitle>
          <DialogDescription>
            Add a speaking opportunity or award program to the database.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <Label className="mb-1.5 block text-[12px]">Autofill from a link</Label>
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://awards.example.com/2026-call-for-entries"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void autofill();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={autofill} disabled={autofilling}>
              {autofilling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {autofilling ? "Reading…" : "Autofill"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            {autofilled.length
              ? `Filled from the page: ${autofilled.join(", ")}. Review before saving — dates are only filled when stated on the page.`
              : "Paste the program page and we'll read it to fill in the details below. Anything you've already typed is kept."}
          </p>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Opportunity name" className="sm:col-span-3">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Opportunity type">
            <NativeSelect
              value={form.type}
              onChange={(v) => {
                set("type", v as OpportunityType);
                set("status", "monitoring");
              }}
              options={OPPORTUNITY_TYPES}
              labels={TYPE_LABEL}
            />
          </Field>
          <Field label="Organization / publisher">
            <Input value={form.organizer} onChange={(e) => set("organizer", e.target.value)} />
          </Field>
          <Field label="Category / award category">
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} />
          </Field>
          <Field label="Client approval">
            <NativeSelect
              value={form.client_approval}
              onChange={(v) => set("client_approval", v)}
              options={CLIENT_APPROVALS.map((a) => a.value)}
              labels={Object.fromEntries(CLIENT_APPROVALS.map((a) => [a.value, a.label]))}
            />
          </Field>
          <Field label="Website URL">
            <Input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="Application URL">
            <Input
              value={form.application_url}
              onChange={(e) => set("application_url", e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Status">
            <TaxonomySelect
              kind="status"
              appliesTo={form.type}
              value={form.status}
              onChange={(v) => set("status", v)}
            />
          </Field>
          <Field label="Priority">
            <TaxonomySelect
              kind="priority"
              value={form.priority}
              onChange={(v) => set("priority", v)}
            />
          </Field>
          <Field label="Recommendation">
            <TaxonomySelect
              kind="recommendation"
              value={form.recommendation}
              onChange={(v) => set("recommendation", v)}
            />
          </Field>
          <Field label="Application opens">
            <Input
              type="date"
              value={form.open_date}
              onChange={(e) => set("open_date", e.target.value)}
            />
          </Field>
          <Field label="Early deadline">
            <Input
              type="date"
              value={form.early_deadline}
              onChange={(e) => set("early_deadline", e.target.value)}
            />
          </Field>
          <Field label="Final deadline">
            <Input
              type="date"
              value={form.final_deadline}
              onChange={(e) => set("final_deadline", e.target.value)}
            />
          </Field>
          <Field label="Deadline cut-off time (optional)">
            <Input
              type="time"
              value={form.deadline_time}
              onChange={(e) => set("deadline_time", e.target.value)}
            />
          </Field>
          <Field label="Deadline time zone">
            <NativeSelect
              value={form.deadline_timezone}
              onChange={(v) => set("deadline_timezone", v)}
              options={TIMEZONE_VALUES}
              labels={TIMEZONE_LABELS}
            />
          </Field>
          <Field label="Deadline type">
            <TaxonomySelect
              kind="deadline_type"
              value={form.deadline_type}
              onChange={(v) => set("deadline_type", v)}
            />
          </Field>
          <Field label="Event date">
            <Input
              type="date"
              value={form.event_date}
              onChange={(e) => set("event_date", e.target.value)}
            />
          </Field>
          <Field label="Announcement date">
            <Input
              type="date"
              value={form.announcement_date}
              onChange={(e) => set("announcement_date", e.target.value)}
            />
          </Field>
          <Field label="Tier">
            <NativeSelect
              value={String(form.tier)}
              onChange={(v) => set("tier", Number(v))}
              options={["1", "2", "3"]}
              labels={{
                "1": "Tier 1 — Priority",
                "2": "Tier 2 — Standard",
                "3": "Tier 3 — Optional",
              }}
            />
          </Field>
          <Field label="Strategic fit (0–100)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.fit_score}
              onChange={(e) => set("fit_score", e.target.value)}
            />
          </Field>
          <Field label="Region">
            <Input value={form.region} onChange={(e) => set("region", e.target.value)} />
          </Field>
          <Field label="Audience" className="sm:col-span-3">
            <Input
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="Health system CIOs, payer executives…"
            />
          </Field>
          <Field label="Description" className="sm:col-span-3">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <DialogFooter className="sm:col-span-3">
            <Button type="submit" disabled={busy || !form.name}>
              Save opportunity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-[12px]">{label}</Label>
      {children}
    </div>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string> | undefined;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels?.[opt] ?? (opt === "" ? "—" : opt.replace(/_/g, " "))}
        </option>
      ))}
    </select>
  );
}
