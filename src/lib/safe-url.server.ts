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

/**
 * fetch() that validates the target and every redirect hop against
 * assertPublicHttpUrl. Returns the final response.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 5, ...rest } = init;
  let current = assertPublicHttpUrl(raw).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(current, { ...rest, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      // Re-validate the hop before following it.
      current = assertPublicHttpUrl(new URL(location, current).toString()).toString();
      continue;
    }
    return res;
  }
  throw new Error("That page redirected too many times.");
}
