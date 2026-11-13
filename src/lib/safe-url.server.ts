/**
 * SSRF guard for outbound fetches of user/AI-supplied URLs.
 *
 * Only http(s) is allowed, and hostnames that resolve to (or literally are)
 * loopback, link-local, or private-network addresses are refused. Redirects
 * are followed manually so every hop is re-validated.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
]);

/** Suffixes that only ever name internal hosts. */
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(h)) return true; // unique local
  // IPv4-mapped (::ffff:10.0.0.1)
  const mapped = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (mapped?.[1] && isPrivateIPv4(mapped[1])) return true;
  return true; // any other literal IPv6 target is not something we monitor
}

/** Throws when the URL is not a safe, public http(s) target. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https addresses can be checked.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error("That URL has no host.");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("That address points at an internal host and cannot be checked.");
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error("That address points at a private network and cannot be checked.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials cannot be checked.");
  }

  return url;
}

/** True when a resolved address is loopback, link-local, private or reserved. */
export function isPrivateAddress(address: string): boolean {
  if (!address.includes(":")) return isPrivateIPv4(address);
  const h = address.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  // Only global unicast (2000::/3) is public; documentation range excluded.
  if (!/^[23][0-9a-f]{0,3}:/.test(h)) return true;
  return h.startsWith("2001:db8:");
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Decompress a response body. The cap applies to the decompressed size too,
 * so a small compressed body cannot expand into a huge one.
 */
export function decodeBody(
  body: Buffer,
  encoding: string | string[] | undefined,
  zlib: typeof import("node:zlib"),
): Buffer {
  const enc = String(encoding ?? "").toLowerCase();
  const cap = { maxOutputLength: MAX_BODY_BYTES };
  try {
    if (enc === "gzip") return zlib.gunzipSync(body, cap);
    if (enc === "deflate") return zlib.inflateSync(body, cap);
    if (enc === "br") return zlib.brotliDecompressSync(body, cap);
    return body;
  } catch (e) {
    throw new Error(
      e instanceof RangeError
        ? "That page is too large to read."
        : "That page could not be decoded.",
    );
  }
}

/**
 * One GET with the connection pinned to a vetted address. The DNS lookup runs
 * inside the socket connect and refuses private results, so a public hostname
 * that resolves (or rebinds) to an internal address never gets a connection.
 */
async function pinnedRequest(url: URL, init: RequestInit): Promise<Response> {
  const [{ request: httpRequest }, { request: httpsRequest }, dns, zlib] = await Promise.all([
    import("node:http"),
    import("node:https"),
    import("node:dns"),
    import("node:zlib"),
  ]);

  const lookup = (
    hostname: string,
    options: object,
    callback: (err: Error | null, address: string | object[], family?: number) => void,
  ) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const blocked = addresses.find((a) => isPrivateAddress(a.address));
      if (blocked || addresses.length === 0) {
        return callback(
          new Error("That address points at a private network and cannot be checked."),
          "",
        );
      }
      if ((options as { all?: boolean }).all) return callback(null, addresses);
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };

  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  headers["accept-encoding"] = "gzip, deflate, br";

  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<Response>((resolve, reject) => {
    const req = send(
      url,
      { method: "GET", headers, lookup: lookup as never, signal: init.signal ?? undefined },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy(new Error("That page is too large to read."));
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          let body: Buffer;
          try {
            body = decodeBody(Buffer.concat(chunks), res.headers["content-encoding"], zlib);
          } catch (e) {
            return reject(e);
          }
          const out = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined || k === "content-encoding" || k === "content-length") continue;
            out.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
          const status = res.statusCode ?? 502;
          const noBody = status === 204 || status === 304 || (status >= 300 && status < 400);
          resolve(new Response(noBody ? null : new Uint8Array(body), { status, headers: out }));
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * GET that only reaches public hosts. Every hop is checked twice: the URL text
 * (assertPublicHttpUrl) and the resolved address at connect time
 * (pinnedRequest). Redirects are followed manually so each hop is re-checked.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 5, ...rest } = init;
  let current = assertPublicHttpUrl(raw);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await pinnedRequest(current, rest);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new Error("That page redirected too many times.");
}
