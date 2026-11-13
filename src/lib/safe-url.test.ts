/** SSRF guard. Run with `npm run test:db`. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { assertPublicHttpUrl, decodeBody, isPrivateAddress, safeFetch } from "./safe-url.server.ts";

describe("safe-url", () => {
  it("classifies resolved addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "192.168.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "2001:db8::1",
    ]) {
      assert.equal(isPrivateAddress(a), true, a);
    }
    for (const a of ["8.8.8.8", "172.66.147.243", "2606:4700:10::ac42:93f3"])
      assert.equal(isPrivateAddress(a), false, a);
  });

  it("refuses internal hosts by name", () => {
    assert.throws(() => assertPublicHttpUrl("http://metadata.google.internal/"));
    assert.throws(() => assertPublicHttpUrl("http://169.254.169.254/"));
    assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"));
  });

  it("caps the decompressed size, not just the wire size", async () => {
    const zlib = await import("node:zlib");
    const bomb = zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024)); // tiny on the wire
    assert.ok(bomb.length < 100_000);
    assert.throws(() => decodeBody(bomb, "gzip", zlib), /too large/);
    const ok = zlib.gzipSync(Buffer.from("hello"));
    assert.equal(decodeBody(ok, "gzip", zlib).toString(), "hello");
  });

  it("refuses a hostname that resolves to loopback, even with a live server there", async () => {
    // `localhost` is name-blocked, so use a server bound to loopback and reach it
    // through an /etc/hosts-free path: the pinned lookup itself must refuse it.
    const server = createServer((_req, res) => res.end("internal secret"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      // A hostname with no blocked suffix that the OS resolves to 127.0.0.1.
      await assert.rejects(
        () => safeFetch(`http://localhost.:${port}/`),
        /internal host|private network/,
      );
    } finally {
      server.close();
    }
  });
});
