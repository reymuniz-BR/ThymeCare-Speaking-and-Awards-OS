import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase, auth, isApprovedMember } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      await auth.authStateReady();
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Signed in is not enough: the account must be on the allowlist
    // (firestore.rules refuses everything else anyway).
    if (!(await isApprovedMember())) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { denied: true } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
