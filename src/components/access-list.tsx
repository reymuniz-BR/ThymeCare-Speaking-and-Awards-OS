import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate } from "@/lib/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui-kit";

type AllowedEmail = {
  id: string;
  email: string;
  note: string | null;
  created_at: string;
};

function useAllowedEmails() {
  return useQuery({
    queryKey: ["allowed_emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allowed_emails")
        .select("id,email,note,created_at")
        .order("email");
      if (error) throw error;
      return (data ?? []) as AllowedEmail[];
    },
  });
}

/**
 * The roles the app actually distinguishes. `contributor` and `viewer` are
 * both stored values, but neither grants anything beyond plain membership
 * today, so the picker offers one "Member" tier and writes `contributor`.
 */
type Tier = "admin" | "manager" | "member";
const TIERS: { value: Tier; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
];
const tierOf = (role: string | undefined): Tier =>
  role === "admin" ? "admin" : role === "manager" ? "manager" : "member";
const roleFor = (tier: Tier) => (tier === "member" ? "contributor" : tier);

type Person = { uid: string; role: string | undefined };

/** Signed-in people by lowercase email, with their role, plus the caller's uid. */
function usePeople() {
  return useQuery({
    queryKey: ["team-people"],
    queryFn: async () => {
      const [{ data: auth }, profiles, roles] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("profiles").select("id,email"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      const roleByUid = new Map((roles.data ?? []).map((r) => [r.user_id, r.role as string]));
      const byEmail = new Map<string, Person>();
      for (const p of profiles.data ?? []) {
        if (p.email) byEmail.set(p.email.toLowerCase(), { uid: p.id, role: roleByUid.get(p.id) });
      }
      const me = auth.user?.id ?? null;
      return { byEmail, me, myRole: me ? roleByUid.get(me) : undefined };
    },
  });
}

export function AccessList() {
  const { data: rows = [], isLoading } = useAllowedEmails();
  const { data: people } = usePeople();
  const isAdmin = people?.myRole === "admin";
  const invalidate = useInvalidate();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    // The document ID is the lowercase email (see firestore.rules); the data
    // layer derives it from `email`, so a duplicate is a clean 23505.
    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email: value, note: note.trim() || null });
    if (error) {
      toast.error(
        error.message.includes("row-level security")
          ? "Only admins can manage access."
          : error.code === "23505"
            ? "That email is already approved."
            : error.message,
      );
      return;
    }
    setEmail("");
    setNote("");
    invalidate(["allowed_emails"]);
    toast.success("Email approved");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("allowed_emails").delete().eq("id", id);
    if (error) {
      toast.error(
        error.message.includes("row-level security")
          ? "Only admins can manage access."
          : error.message,
      );
      return;
    }
    invalidate(["allowed_emails"]);
  }

  async function setTier(email: string, uid: string, tier: Tier) {
    const { error } = await supabase
      .from("user_roles")
      .upsert({ user_id: uid, role: roleFor(tier) }, { onConflict: "user_id" });
    if (error) {
      toast.error(
        error.message.includes("row-level security")
          ? "Only admins can change roles."
          : error.message,
      );
      return;
    }
    invalidate(["team-people"]);
    toast.success(`${email} is now ${TIERS.find((t) => t.value === tier)!.label.toLowerCase()}`);
  }

  return (
    <Panel
      title="Team access & approvals"
      hint="Only these emails can sign in. Members read and edit program data; managers can also delete records, edit taxonomy and run the Drive connection; admins also manage this list and roles. A role can be set once the person has signed in."
    >
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-b border-border p-3">
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
            Work email
          </div>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-64"
            placeholder="name@company.com"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">Note</div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 w-56"
            placeholder="Optional — role or team"
          />
        </div>
        <Button type="submit" size="sm" className="h-9" disabled={!email.trim()}>
          <Plus className="h-3.5 w-3.5" /> Approve email
        </Button>
      </form>

      {isLoading ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">Loading access list…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          No approved emails yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const person = people?.byEmail.get(r.email.toLowerCase());
            const isMe = !!person && person.uid === people?.me;
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <span className="font-medium">{r.email}</span>
                {r.note ? <span className="text-muted-foreground">{r.note}</span> : null}
                <div className="ml-auto flex items-center gap-3">
                  {!person ? (
                    <span className="text-[12px] text-muted-foreground">Not signed in yet</span>
                  ) : (
                    <Select
                      value={tierOf(person.role)}
                      onValueChange={(v) => setTier(r.email, person.uid, v as Tier)}
                      disabled={!isAdmin || isMe}
                    >
                      <SelectTrigger
                        className="h-8 w-28 text-[12px]"
                        aria-label={`Role for ${r.email}`}
                        title={isMe ? "You can't change your own role" : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIERS.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-[12px]">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {isMe ? (
                    <span className="w-3.5" />
                  ) : (
                    <button
                      onClick={() => remove(r.id)}
                      className="text-muted-foreground hover:text-critical"
                      aria-label={`Revoke ${r.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
