/** AI helper: failures must throw, never stub. Run with `npm run test:db`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIError, activeModel, callAI, describeAIError } from "./ai-gateway.server.ts";

describe("ai-gateway", () => {
  it("throws not_configured when no key is set, instead of returning a stub", async () => {
    const saved = { g: process.env["GEMINI_API_KEY"], o: process.env["GOOGLE_API_KEY"] };
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GOOGLE_API_KEY"];
    try {
      await assert.rejects(
        () => callAI([{ role: "user", content: "hi" }], { type: "object" }),
        (e: unknown) => e instanceof AIError && e.kind === "not_configured",
      );
    } finally {
      if (saved.g !== undefined) process.env["GEMINI_API_KEY"] = saved.g;
      if (saved.o !== undefined) process.env["GOOGLE_API_KEY"] = saved.o;
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
