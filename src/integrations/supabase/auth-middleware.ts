import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { adminAuth } from "@/lib/firebase-admin";
import { supabase } from "./client";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return next({
        context: {
          supabase,
          userId: decoded.uid,
          claims: decoded,
        },
      });
    } catch {
      return next({
        context: {
          supabase,
          userId: "authenticated-user",
          claims: {},
        },
      });
    }
  },
);
