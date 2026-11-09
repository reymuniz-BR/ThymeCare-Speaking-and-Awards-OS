/**
 * The team's single Google Drive connection.
 *
 * Signing in to the app only proves who someone is. The Drive syncs also run on
 * a schedule with nobody signed in, so a manager connects Drive once and the
 * resulting refresh token is kept server-side (integration_tokens/google_drive,
 * denied to every client by firestore.rules). All Drive reads go through
 * `driveClient().fetch`.
 *
 * Erasable TypeScript with explicit `.ts` specifiers so Node can test it directly.
 */
import type { AppDb } from "../integrations/supabase/firestore/builder.ts";
import { signingKey, toB64Url } from "./drive-cursor.server.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const CALLBACK_PATH = "/api/public/drive-oauth/callback";

const STATE_SECRET = "drive-oauth-state";
const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh a little early so a token can't expire mid-request. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export const NOT_CONNECTED_MESSAGE =
  "Google Drive is not connected yet. A manager can connect it in Settings.";
export const NEEDS_RECONNECT_MESSAGE =
  "The Google Drive connection stopped working. A manager needs to reconnect it in Settings.";

export type DriveConnection = {
  refresh_token: string;
  connected_email: string | null;
  connected_by: string;
  connected_at: string;
  status: "connected" | "needs_reconnect";
  last_error: string | null;
};

export interface ConnectionStore {
  get(): Promise<DriveConnection | null>;
  set(connection: DriveConnection): Promise<void>;
  markNeedsReconnect(reason: string): Promise<void>;
  clear(): Promise<void>;
}

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Null until the three deployment settings exist; the redirect is never taken from a request. */
export function oauthConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): OAuthConfig | null {
  const clientId = env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = env["GOOGLE_OAUTH_CLIENT_SECRET"];
  const baseUrl = env["APP_BASE_URL"];
  if (!clientId || !clientSecret || !baseUrl) return null;
  return { clientId, clientSecret, redirectUri: `${baseUrl.replace(/\/+$/, "")}${CALLBACK_PATH}` };
}

/** Why a connect attempt failed; the Settings page turns these into plain messages. */
export type ConnectOutcome =
  "connected" | "invalid" | "forbidden" | "scope" | "no_refresh" | "failed";

function requireConfig(config: OAuthConfig | null): OAuthConfig {
  if (!config) {
    throw new Error(
      "Google Drive sign-in isn't set up on this deployment: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and APP_BASE_URL are required.",
    );
  }
  return config;
}

const encode = (s: string) => new TextEncoder().encode(s);

async function hmac(db: AppDb, body: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(db, STATE_SECRET), encode(body));
  return toB64Url(new Uint8Array(sig));
}

/** Ties the Google round trip to the manager who started it, for ten minutes. */
export async function createState(db: AppDb, uid: string, now = Date.now()): Promise<string> {
  const nonce = toB64Url(crypto.getRandomValues(new Uint8Array(16)));
  const body = toB64Url(encode(JSON.stringify({ uid, nonce, exp: now + STATE_TTL_MS })));
  return `${body}.${await hmac(db, body)}`;
}

/** The uid that started the flow, or null for anything forged, malformed or expired. */
export async function verifyState(
  db: AppDb,
  token: string | null,
  now = Date.now(),
): Promise<string | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(db, body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as {
      uid?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number") return null;
    return parsed.exp > now ? parsed.uid : null;
  } catch {
    return null;
  }
}

/** The Google consent URL. Drive is requested here and only here, never at app sign-in. */
export function buildAuthUrl(config: OAuthConfig, state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    // offline + consent is what makes Google return a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

/** Google handed this straight to us over TLS, so the claims need no signature check. */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = idToken.split(".")[1] ?? "";
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      email?: unknown;
    };
    return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
};

export type DriveAccessResult = { label: string; ok: boolean; name?: string; status?: number };

export function createDriveClient(deps: {
  store: ConnectionStore;
  config: () => OAuthConfig | null;
  fetchImpl?: typeof fetch;
}) {
  const http: typeof fetch = (...args) => (deps.fetchImpl ?? fetch)(...args);
  let cached: { token: string; expiresAt: number } | null = null;

  async function requestTokens(params: Record<string, string>): Promise<{
    ok: boolean;
    body: TokenResponse;
  }> {
    const res = await http(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    let body: TokenResponse = {};
    try {
      body = (await res.json()) as TokenResponse;
    } catch {
      // A non-JSON failure is handled below as an unsuccessful response.
    }
    return { ok: res.ok, body };
  }

  async function refresh(): Promise<string> {
    const connection = await deps.store.get();
    if (!connection) throw new Error(NOT_CONNECTED_MESSAGE);
    if (connection.status === "needs_reconnect") throw new Error(NEEDS_RECONNECT_MESSAGE);

    const config = requireConfig(deps.config());
    const { ok, body } = await requestTokens({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    });
    if (!ok || !body.access_token) {
      // invalid_grant means the login was revoked or expired for good. Anything
      // else (a Google outage) must not throw away a working connection.
      if (body.error === "invalid_grant") {
        await deps.store.markNeedsReconnect("Google rejected the saved login (invalid_grant).");
        throw new Error(NEEDS_RECONNECT_MESSAGE);
      }
      throw new Error("Could not reach Google to refresh the Drive connection. Try again shortly.");
    }
    cached = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
    };
    return body.access_token;
  }

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    return refresh();
  }

  /** An authenticated GET against the Drive v3 API. `path` starts with a slash. */
  async function driveFetch(
    path: string,
    params: URLSearchParams | Record<string, string> = {},
  ): Promise<Response> {
    const query = new URLSearchParams(params);
    query.set("supportsAllDrives", "true");
    const url = `${DRIVE_API}${path}?${query.toString()}`;
    const res = await http(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    if (res.status !== 401) return res;
    // A cached token can be revoked before it expires; retry once with a fresh one.
    cached = null;
    return http(url, { headers: { Authorization: `Bearer ${await refresh()}` } });
  }

  return {
    fetch: driveFetch,

    /** Whether Drive can be used right now, without calling Google. */
    async isConnected(): Promise<boolean> {
      return (await deps.store.get())?.status === "connected";
    },

    /** Finishes the Google redirect. Never surfaces Google's response to the browser. */
    async completeAuthorization(input: {
      db: AppDb;
      state: string | null;
      code: string | null;
      isManager: (uid: string) => Promise<boolean>;
    }): Promise<ConnectOutcome> {
      const uid = await verifyState(input.db, input.state);
      if (!uid || !input.code) return "invalid";
      if (!(await input.isManager(uid))) return "forbidden";

      const config = requireConfig(deps.config());
      const { ok, body } = await requestTokens({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: input.code,
        grant_type: "authorization_code",
      });
      if (!ok) return "failed";
      // Google's consent screen lets people untick Drive and still continue.
      if (!(body.scope ?? "").split(" ").includes(DRIVE_SCOPE)) return "scope";
      if (!body.refresh_token) return "no_refresh";

      await deps.store.set({
        refresh_token: body.refresh_token,
        connected_email: emailFromIdToken(body.id_token),
        connected_by: uid,
        connected_at: new Date().toISOString(),
        status: "connected",
        last_error: null,
      });
      cached = null;
      return "connected";
    },

    /** Which of the files the app depends on the connected account can actually open. */
    async checkAccess(
      targets: Array<{ label: string; fileId: string }>,
    ): Promise<DriveAccessResult[]> {
      return Promise.all(
        targets.map(async ({ label, fileId }): Promise<DriveAccessResult> => {
          const res = await driveFetch(`/files/${encodeURIComponent(fileId)}`, {
            fields: "id,name",
          });
          if (!res.ok) return { label, ok: false, status: res.status };
          const file = (await res.json()) as { name?: string };
          return { label, ok: true, ...(file.name ? { name: file.name } : {}) };
        }),
      );
    },

    /** Forgets the login here and, best effort, at Google too. */
    async disconnect(): Promise<void> {
      const connection = await deps.store.get();
      cached = null;
      await deps.store.clear();
      if (!connection) return;
      try {
        await http(REVOKE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: connection.refresh_token }).toString(),
        });
      } catch {
        // Already forgotten locally; a failed revoke leaves nothing usable here.
      }
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;

/** integration_tokens/google_drive, through the admin SDK (clients are denied by the rules). */
function firestoreStore(): ConnectionStore {
  const ref = async () => {
    const { adminDb } = await import("./firebase-admin.ts");
    return adminDb.collection("integration_tokens").doc("google_drive");
  };
  return {
    async get() {
      const doc = await (await ref()).get();
      return doc.exists ? (doc.data() as DriveConnection) : null;
    },
    async set(connection) {
      await (await ref()).set(connection);
    },
    async markNeedsReconnect(reason) {
      await (await ref()).update({ status: "needs_reconnect", last_error: reason });
    },
    async clear() {
      await (await ref()).delete();
    },
  };
}

let singleton: DriveClient | null = null;

/** The app-wide client, so every sync on an instance shares one cached access token. */
export function driveClient(): DriveClient {
  singleton ??= createDriveClient({
    store: firestoreStore(),
    config: () => oauthConfigFromEnv(),
  });
  return singleton;
}

/** Start of the connect flow: a signed, ten-minute Google consent URL. */
export async function startAuthorization(
  db: AppDb,
  uid: string,
  loginHint?: string,
): Promise<string> {
  const config = requireConfig(oauthConfigFromEnv());
  return buildAuthUrl(config, await createState(db, uid), loginHint);
}

/** Status for the Settings card. Deliberately omits the token. */
export async function connectionStatus() {
  const connection = await firestoreStore().get();
  return {
    configured: oauthConfigFromEnv() !== null,
    status: connection?.status ?? ("not_connected" as const),
    connectedEmail: connection?.connected_email ?? null,
    connectedAt: connection?.connected_at ?? null,
    lastError: connection?.last_error ?? null,
  };
}
