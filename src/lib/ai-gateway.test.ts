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

it("describeAIError names depleted prepaid credits", () => {
  const err = new Error(
    '{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}',
  );
  assert.match(describeAIError(err, "m"), /credits for this app are used up/);
});

describe("vertex route", () => {
  it("is chosen on Cloud Run with no key, and can be disabled", () => {
    const saved = { ...process.env };
    for (const k of [
      "GEMINI_SERVER_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_DISABLE_VERTEX",
    ])
      delete process.env[k];
    try {
      process.env["K_SERVICE"] = "podiumpipelineos";
      assert.equal(aiRoute(), "vertex");
      process.env["GEMINI_DISABLE_VERTEX"] = "1";
      assert.equal(aiRoute(), "ai-studio-proxy");
      process.env["GEMINI_SERVER_API_KEY"] = "k";
      assert.equal(aiRoute(), "direct");
    } finally {
      process.env = saved;
    }
  });

  it("explains a disabled Vertex API", () => {
    const err = new Error(
      '{"error":{"code":403,"message":"Vertex AI API has not been used in project","status":"PERMISSION_DENIED"}}',
    );
    assert.match(describeAIError(err, "m"), /Vertex AI is not enabled/);
  });
});
