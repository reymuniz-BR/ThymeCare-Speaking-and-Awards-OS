import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DbClient } from "../integrations/supabase/firestore/builder.ts";
import { MemoryBackend } from "../integrations/supabase/firestore/memory-backend.testing.ts";
import {
  buildAuthUrl,
  createDriveClient,
  createState,
  DRIVE_SCOPE,
  NEEDS_RECONNECT_MESSAGE,
  NOT_CONNECTED_MESSAGE,
  oauthConfigFromEnv,
  verifyState,
  type ConnectionStore,
  type DriveConnection,
} from "./drive-connection.server.ts";

const db = () => new DbClient(new MemoryBackend());
const config = { clientId: "cid", clientSecret: "shh", redirectUri: "https://app.test/cb" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const saved: DriveConnection = {
  refresh_token: "refresh-1",
  connected_email: "hailey@example.com",
  connected_by: "uid-1",
  connected_at: "2026-11-09T00:00:00.000Z",
  status: "connected",
  last_error: null,
};

function memoryStore(initial: DriveConnection | null = null) {
  const box = { value: initial };
  const store: ConnectionStore = {
    get: async () => box.value,
    set: async (c) => {
      box.value = c;
    },
    markNeedsReconnect: async (reason) => {
      box.value = { ...box.value!, status: "needs_reconnect", last_error: reason };
    },
    clear: async () => {
      box.value = null;
    },
  };
  return { store, box };
}

/** Answers token requests from `token`, Drive requests from `drive`, and records every URL. */
function fakeGoogle(token: () => Response, drive: () => Response = () => json({ name: "F" })) {
  const urls: string[] = [];
  const auths: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("oauth2.googleapis.com")) return token();
    auths.push(new Headers(init?.headers).get("authorization") ?? "");
    return drive();
  }) as typeof fetch;
  return { fetchImpl, urls, auths };
}

const idToken = (claims: object) => `h.${btoa(JSON.stringify(claims))}.s`;
const tokenCalls = (urls: string[]) => urls.filter((u) => u.includes("/token")).length;

describe("oauth state", () => {
  it("returns the uid for a genuine state", async () => {
    const d = db();
    assert.equal(await verifyState(d, await createState(d, "uid-1")), "uid-1");
  });

  it("rejects forged, malformed and expired state", async () => {
    const d = db();
    const token = await createState(d, "uid-1");
    const sig = token.split(".")[1];
    const forged = btoa(JSON.stringify({ uid: "attacker", exp: Date.now() + 60_000 }));
    assert.equal(await verifyState(d, `${forged}.${sig}`), null);
    assert.equal(await verifyState(d, "garbage"), null);
    assert.equal(await verifyState(d, null), null);
    assert.equal(await verifyState(d, token, Date.now() + 11 * 60 * 1000), null);
  });
});

describe("oauth configuration", () => {
  it("needs all three settings and builds the redirect from APP_BASE_URL", () => {
    assert.equal(oauthConfigFromEnv({ GOOGLE_OAUTH_CLIENT_ID: "x" }), null);
    const c = oauthConfigFromEnv({
      GOOGLE_OAUTH_CLIENT_ID: "a",
      GOOGLE_OAUTH_CLIENT_SECRET: "b",
      APP_BASE_URL: "https://app.test/",
    });
    assert.equal(c?.redirectUri, "https://app.test/api/public/drive-oauth/callback");
  });

  it("asks for lasting read-only Drive access", () => {
    const url = new URL(buildAuthUrl(config, "st", "h@example.com"));
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.ok(url.searchParams.get("scope")?.split(" ").includes(DRIVE_SCOPE));
    assert.equal(url.searchParams.get("login_hint"), "h@example.com");
  });
});

describe("completing the connection", () => {
  const complete = async (
    token: () => Response,
    opts: { manager?: boolean; state?: string | null } = {},
  ) => {
    const d = db();
    const { store, box } = memoryStore();
    const google = fakeGoogle(token);
    const client = createDriveClient({ store, config: () => config, fetchImpl: google.fetchImpl });
    const state = opts.state === undefined ? await createState(d, "uid-1") : opts.state;
    const outcome = await client.completeAuthorization({
      db: d,
      state,
      code: "code",
      isManager: async () => opts.manager ?? true,
    });
    return { outcome, box, google };
  };

  it("stores the login and the account it belongs to", async () => {
    const { outcome, box } = await complete(() =>
      json({
        refresh_token: "r",
        scope: `openid ${DRIVE_SCOPE}`,
        id_token: idToken({ email: "Hailey@Example.com" }),
      }),
    );
    assert.equal(outcome, "connected");
    assert.equal(box.value?.refresh_token, "r");
    assert.equal(box.value?.connected_email, "hailey@example.com");
    assert.equal(box.value?.connected_by, "uid-1");
  });

  it("never calls Google for a bad state or a non-manager", async () => {
    const token = () => json({});
    const bad = await complete(token, { state: "garbage" });
    assert.equal(bad.outcome, "invalid");
    assert.equal(bad.google.urls.length, 0);
    const notManager = await complete(token, { manager: false });
    assert.equal(notManager.outcome, "forbidden");
    assert.equal(notManager.google.urls.length, 0);
  });

  it("refuses a consent where Drive was unticked", async () => {
    const { outcome, box } = await complete(() => json({ refresh_token: "r", scope: "openid" }));
    assert.equal(outcome, "scope");
    assert.equal(box.value, null);
  });

  it("refuses a response with no refresh token", async () => {
    const { outcome, box } = await complete(() => json({ scope: DRIVE_SCOPE }));
    assert.equal(outcome, "no_refresh");
    assert.equal(box.value, null);
  });
});

describe("reading Drive", () => {
  const client = (store: ConnectionStore, google: ReturnType<typeof fakeGoogle>) =>
    createDriveClient({ store, config: () => config, fetchImpl: google.fetchImpl });
  const okToken = () => json({ access_token: "a1", expires_in: 3600 });

  it("reuses an access token until it expires", async () => {
    const google = fakeGoogle(okToken);
    const c = client(memoryStore(saved).store, google);
    await c.fetch("/files/one");
    await c.fetch("/files/two");
    assert.equal(tokenCalls(google.urls), 1);
    assert.deepEqual(google.auths, ["Bearer a1", "Bearer a1"]);
    assert.ok(google.urls.at(-1)?.includes("supportsAllDrives=true"));
  });

  it("retries once with a fresh token after a 401", async () => {
    let driveCalls = 0;
    const google = fakeGoogle(okToken, () => (++driveCalls === 1 ? json({}, 401) : json({})));
    const res = await client(memoryStore(saved).store, google).fetch("/files/one");
    assert.equal(res.status, 200);
    assert.equal(tokenCalls(google.urls), 2);
  });

  it("says so when Drive was never connected", async () => {
    const google = fakeGoogle(okToken);
    const c = client(memoryStore().store, google);
    await assert.rejects(c.fetch("/files/one"), new RegExp(NOT_CONNECTED_MESSAGE));
    assert.equal(await c.isConnected(), false);
  });

  it("flags a revoked login and stops asking Google", async () => {
    const google = fakeGoogle(() => json({ error: "invalid_grant" }, 400));
    const { store, box } = memoryStore(saved);
    const c = client(store, google);
    await assert.rejects(c.fetch("/files/one"), new RegExp(NEEDS_RECONNECT_MESSAGE));
    assert.equal(box.value?.status, "needs_reconnect");
    assert.equal(await c.isConnected(), false);
    await assert.rejects(c.fetch("/files/one"), new RegExp(NEEDS_RECONNECT_MESSAGE));
    assert.equal(tokenCalls(google.urls), 1);
  });

  it("keeps the connection through a Google outage", async () => {
    const google = fakeGoogle(() => new Response("down", { status: 503 }));
    const { store, box } = memoryStore(saved);
    await assert.rejects(client(store, google).fetch("/files/one"), /Try again/);
    assert.equal(box.value?.status, "connected");
  });

  it("reports which files the account can open", async () => {
    let n = 0;
    const google = fakeGoogle(okToken, () => (++n === 1 ? json({ name: "Doc" }) : json({}, 404)));
    const result = await client(memoryStore(saved).store, google).checkAccess([
      { label: "A", fileId: "a" },
      { label: "B", fileId: "b" },
    ]);
    assert.deepEqual(result, [
      { label: "A", ok: true, name: "Doc" },
      { label: "B", ok: false, status: 404 },
    ]);
  });

  it("forgets the login and revokes it at Google", async () => {
    const google = fakeGoogle(() => json({}));
    const { store, box } = memoryStore(saved);
    await client(store, google).disconnect();
    assert.equal(box.value, null);
    assert.ok(google.urls.some((u) => u.endsWith("/revoke")));
  });
});
