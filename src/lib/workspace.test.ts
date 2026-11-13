/** Phase 1 multi-client guard. Run with `npm run test:db`. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { aCompany, pageTitle, productName, workspaceConfig } from "./workspace.ts";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("workspace config", () => {
  it("keeps the workspace's Drive and discovery settings", () => {
    const ws = workspaceConfig();
    assert.equal(ws.drive.rootFolderId, "1NYiV7rYlEB2-ccPaFJf8XvPkjP2h-cYc");
    assert.equal(ws.drive.messagingDocId, "1oCDR8IvkKXs4bFU3y0U9eh10VBkXndIabZkaw8pVQ3Q");
    assert.equal(ws.drive.trackerFileId, "1lr4-FbpgLjQOkjtQJz2w1A_qIb-DRdrI");
    assert.equal(ws.calendarUidDomain, "podium-awards-os");
    assert.equal(productName(), "Podium");
    assert.equal(pageTitle("Speakers"), "Speakers — Podium");
    assert.equal(aCompany(), "a healthcare technology company");
    assert.ok(ws.discovery.beats.length >= 6 && ws.discovery.focusAreas.length >= 10);
  });

  it("has no client name anywhere in the app", () => {
    const offenders = [...files("src"), "scripts/postbuild.js", "metadata.json"].filter(
      (p) => !p.endsWith(".test.ts") && /thyme/i.test(readFileSync(p, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });
});
