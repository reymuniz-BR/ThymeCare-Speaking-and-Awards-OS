/** AI helper: failures must throw, never stub. Run with `npm run test:db`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIError, activeModel, aiRoute, callAI, describeAIError } from "./ai-gateway.server.ts";

describe("ai-gateway", () => {
  it("routes through the AI Studio proxy when the app has no key", async () => {
    const keys = ["GEMINI_SERVER_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_PROXY_URL"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    // Nothing listens here, so the call must fail loudly, never stub.
    process.env["GEMINI_PROXY_URL"] = "http://127.0.0.1:9/api-proxy";
    try {
      assert.equal(aiRoute(), "ai-studio-proxy");
      await assert.rejects(
        () => callAI([{ role: "user", content: "hi" }], { type: "object" }),
        (e: unknown) => e instanceof AIError && e.kind === "request_failed",
      );
      process.env["GEMINI_SERVER_API_KEY"] = "k";
      assert.equal(aiRoute(), "direct");
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("uses GEMINI_MODEL when set, else the maintained flash alias", () => {
    const saved = process.env["GEMINI_MODEL"];
    delete process.env["GEMINI_MODEL"];
    assert.equal(activeModel(), "gemini-flash-latest");
    process.env["GEMINI_MODEL"] = " gemini-x ";
    assert.equal(activeModel(), "gemini-x");
    if (saved === undefined) delete process.env["GEMINI_MODEL"];
    else process.env["GEMINI_MODEL"] = saved;
  });

  it("turns SDK errors into short, user-safe reasons", () => {
    assert.match(
      describeAIError(new Error('{"error":{"code":404}}'), "m1"),
      /model "m1" was not found/,
    );
    assert.match(describeAIError(new Error("got status 429 Too Many")), /rate limit/);
    assert.match(describeAIError(new Error('{"code": 403}')), /key was rejected/);
    assert.match(describeAIError(new Error("HTTP 503")), /outage/);
  });
});
