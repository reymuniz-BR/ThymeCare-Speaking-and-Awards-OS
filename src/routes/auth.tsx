import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Sign in to the speaking, conference and awards program workspace for the communications team.",
      },
      { property: "og:title", content: "Sign in — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Internal workspace for tracking speaking opportunities, awards and submissions.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed, or this email is not approved for access.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            T
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">
            Thyme Care <span className="text-sidebar-foreground/55">Speaking &amp; Awards OS</span>
          </span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold text-sidebar-foreground">
            One operating system for speaking, conferences and awards.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/65">
            Track every deadline, discover new opportunities, and repurpose submission content the
            team has already written.
          </p>
        </div>
        <p className="font-mono text-[11px] tracking-wide text-sidebar-foreground/40 uppercase">
          Internal tool — authorized team members only
        </p>
      </div>

      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Access is limited to approved team accounts.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            Need access? Ask a program administrator to add your work email to the approved list.
          </p>
        </div>
      </div>
    </div>
  );
}
