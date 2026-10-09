import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { AppDb } from "./firestore/builder";

function reject(status: 401 | 403, message: string): never {
  throw new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export type AppRole = "admin" | "manager" | "contributor" | "viewer";

type Membership = { role: AppRole | null; until: number };

/**
 * Short-lived cache of allowlist + role lookups, keyed on uid AND email so a
 * changed address never inherits an old answer. Tokens are also checked for
 * revocation on every call, so this only saves the two Firestore reads.
 */
const MEMBERSHIP_TTL_MS = 30_000;
const membershipCache = new Map<string, Membership>();

/**
 * Gate for every server function: a valid, non-revoked Firebase ID token from a
 * verified, allowlisted team member (the same predicate firestore.rules uses
 * for the browser). Anything else is rejected before the handler runs.
 *
 * The handler gets an admin-backed data client that bypasses rules, so this
 * middleware IS the authorization boundary for server functions. The client is
 * built per request and carries the verified uid as the audit actor, and the
 * caller's role (from user_roles/{uid}) is in context for role-gated functions
 * (see requireManagerAuth / requireAdminAuth).
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
      // checkRevoked: a disabled or signed-out-everywhere user stops working at once.
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      reject(401, "Unauthorized: invalid, expired or revoked token");
    }

    const email = decoded.email?.toLowerCase();
    if (!email || decoded.email_verified !== true) {
      reject(403, "Forbidden: a verified email is required");
    }

    const cacheKey = `${decoded.uid}:${email}`;
    let membership = membershipCache.get(cacheKey);
    if (!membership || membership.until < Date.now()) {
      const [member, roleDoc] = await Promise.all([
        adminDb.collection("allowed_emails").doc(email).get(),
        adminDb.collection("user_roles").doc(decoded.uid).get(),
      ]);
      if (!member.exists) {
        membershipCache.delete(cacheKey);
        reject(403, "Forbidden: this email is not approved for access");
      }
      const role = roleDoc.exists ? (roleDoc.data()?.["role"] as AppRole | undefined) : undefined;
      membership = { role: role ?? null, until: Date.now() + MEMBERSHIP_TTL_MS };
      membershipCache.set(cacheKey, membership);
    }

    const { adminClientFor } = await import("./client.server");
    const supabase: AppDb = adminClientFor(decoded.uid);
    return next({
      context: { supabase, userId: decoded.uid, email, role: membership.role, claims: decoded },
    });
  },
);

function requireRoles(roles: readonly AppRole[]) {
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      if (!context.role || !roles.includes(context.role)) {
        reject(403, `Forbidden: requires the ${roles.join(" or ")} role`);
      }
      return next();
    });
}

/** Original RLS `can_manage()`: admin or manager. Use for deletes and purges. */
export const requireManagerAuth = requireRoles(["admin", "manager"]);

/** Original `has_role(uid, 'admin')`: allowlist and role administration. */
export const requireAdminAuth = requireRoles(["admin"]);
