import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidate } from "@/lib/hooks";
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

export function AccessList() {
  const { data: rows = [], isLoading } = useAllowedEmails();
  const invalidate = useInvalidate();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email: value, note: note.trim() || null });
    if (error) {
      toast.error(
        error.message.includes("row-level security")
          ? "Only admins and managers can manage access."
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
      toast.error(error.message);
      return;
    }
    invalidate(["allowed_emails"]);
  }

  return (
    <Panel
      title="Approved sign-in emails"
      hint="Only these emails (and existing accounts) can create access. Admins and managers can edit."
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
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <span className="font-medium">{r.email}</span>
              {r.note ? <span className="text-muted-foreground">{r.note}</span> : null}
              <button
                onClick={() => remove(r.id)}
                className="ml-auto text-muted-foreground hover:text-critical"
                aria-label={`Revoke ${r.email}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
