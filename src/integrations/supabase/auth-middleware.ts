import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { AppDb } from "./firestore/builder";

function reject(status: 401 | 403, message: string): never {
  throw new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** uid -> expiry, so a burst of server calls costs one allowlist read. */
const memberCache = new Map<string, number>();
const MEMBER_TTL_MS = 60_000;

/**
 * Gate for every server function: a valid Firebase ID token from a verified,
 * allowlisted team member (the same predicate firestore.rules uses for the
 * browser). Anything else is rejected before the handler runs. The handler
 * then gets the admin-backed data client, which bypasses rules, so this check
 * IS the authorization boundary for server functions.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reject(401, "Unauthorized: a Bearer token is required");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) reject(401, "Unauthorized: no token provided");

    const { adminAuth, adminDb } = await import("@/lib/firebase-admin");
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      reject(401, "Unauthorized: invalid or expired token");
    }

    const email = decoded.email?.toLowerCase();
    if (!email || decoded.email_verified !== true) {
      reject(403, "Forbidden: a verified email is required");
    }

    const cachedUntil = memberCache.get(decoded.uid) ?? 0;
    if (cachedUntil < Date.now()) {
      const member = await adminDb.collection("allowed_emails").doc(email).get();
      if (!member.exists) {
        memberCache.delete(decoded.uid);
        reject(403, "Forbidden: this email is not approved for access");
      }
      memberCache.set(decoded.uid, Date.now() + MEMBER_TTL_MS);
    }

    const { supabaseAdmin } = await import("./client.server");
    const supabase: AppDb = supabaseAdmin;
    return next({ context: { supabase, userId: decoded.uid, email, claims: decoded } });
  },
);
