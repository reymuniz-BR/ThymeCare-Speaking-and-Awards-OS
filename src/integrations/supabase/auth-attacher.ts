import { createMiddleware } from "@tanstack/react-start";
import { auth } from "@/lib/firebase";

// Global functionMiddleware in TanStack Start to attach Firebase Bearer token
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await auth.currentUser?.getIdToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
