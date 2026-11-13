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
  it("keeps the current client's values (no visible change in phase 1)", () => {
    const ws = workspaceConfig();
    assert.equal(ws.drive.rootFolderId, "1NYiV7rYlEB2-ccPaFJf8XvPkjP2h-cYc");
    assert.equal(ws.drive.messagingDocId, "1oCDR8IvkKXs4bFU3y0U9eh10VBkXndIabZkaw8pVQ3Q");
    assert.equal(ws.drive.trackerFileId, "1lr4-FbpgLjQOkjtQJz2w1A_qIb-DRdrI");
    assert.equal(ws.calendarUidDomain, "thymecare-awards-os");
    assert.equal(productName(), "Thyme Care Speaking & Awards OS");
    assert.equal(pageTitle("Speakers"), "Speakers — Thyme Care Speaking & Awards OS");
    assert.equal(aCompany(), "a healthcare technology company");
    assert.ok(ws.discovery.beats.length >= 6 && ws.discovery.focusAreas.length >= 10);
  });

  it("has no client name hard-coded outside the workspace config", () => {
    const offenders = files("src").filter(
      (p) =>
        !p.endsWith("workspace.ts") &&
        !p.endsWith(".test.ts") &&
        /Thyme Care|thymecare|healthcare technology company/.test(readFileSync(p, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });
});
