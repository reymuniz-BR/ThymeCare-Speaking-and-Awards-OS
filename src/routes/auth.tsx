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

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    import("@/lib/firebase").then(({ auth }) => {
      auth.authStateReady().then(() => {
        supabase.auth.getUser().then(({ data }) => {
          if (data.user) navigate({ to: "/dashboard", replace: true });
        });
      });
    });
  }, [navigate]);

  async function handleGoogle() {
    setBusy(true);
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import("firebase/auth");
      const { auth, db } = await import("@/lib/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      if (user) {
        try {
          const profileDoc = doc(db, "profiles", user.uid);
          await setDoc(
            profileDoc,
            {
              id: user.uid,
              email: user.email ?? "",
              full_name: user.displayName ?? user.email?.split("@")[0] ?? "Team Member",
              avatar_url: user.photoURL ?? "",
              updated_at: new Date().toISOString(),
            },
            { merge: true },
          );
          if (user.email) {
            const emailId = user.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
            const emailDoc = doc(db, "allowed_emails", emailId);
            await setDoc(
              emailDoc,
              {
                id: emailId,
                email: user.email.toLowerCase(),
                note: "Company Google Account",
                created_at: new Date().toISOString(),
              },
              { merge: true },
            );
          }
        } catch (e) {
          console.warn("Profile sync warning:", e);
        }
        toast.success(`Signed in as ${user.displayName || user.email}`);
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: unknown) {
      setBusy(false);
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        toast.info("Google sign-in was cancelled.");
        return;
      }
      if (code === "auth/popup-blocked") {
        toast.error("Popup was blocked by your browser. Please allow popups or use email sign in.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

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
          Internal tool — company Google accounts enabled
        </p>
      </div>

      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your company Google account to access the workspace.
          </p>

          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full gap-2 text-sm font-medium hover:bg-accent"
              onClick={handleGoogle}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Sign in with Google
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
              or sign in with password
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
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
                placeholder="••••••••"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in with email
            </Button>
          </form>

          <div className="mt-4 pt-3 border-t border-border/50 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { error } = await supabase.auth.signInWithPassword({
                    email: "team@thymecare.com",
                    password: "CompanyPassword123!",
                  });
                  if (error) throw error;
                  navigate({ to: "/dashboard", replace: true });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Quick access failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Instant Team Demo Access (team@thymecare.com)
            </Button>
          </div>

          <p className="mt-4 text-center text-[12px] text-muted-foreground">
            Any team member with a company Google account or work email receives immediate access.
          </p>
        </div>
      </div>
    </div>
  );
}
