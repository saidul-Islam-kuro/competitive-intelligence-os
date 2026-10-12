/**
 * URL validation + SSRF protection. Used both for the initial source URL
 * and, by the fetcher, for every redirect hop — never just the original
 * URL (see httpFetcher.ts).
 *
 * Design notes:
 * - Relies on the WHATWG `URL` parser (Node's built-in `new URL()`) for
 *   parsing rather than hand-rolled string splitting. This matters for
 *   security, not just convenience: `new URL()` already canonicalizes
 *   classic IPv4-obfuscation bypass tricks (decimal/hex/octal/shorthand
 *   forms like "http://2130706433/" or "http://0x7f000001/") into plain
 *   dotted-quad form, and already rejects null-byte and zone-ID tricks by
 *   throwing on parse. Verified empirically against this repo's target
 *   Node version rather than assumed — see ipRange.test.ts's mapped-address
 *   test comment for the equivalent note on IPv6 canonical forms.
 * - Validates every DNS answer for a hostname, not just the first one —
 *   defends against a hostname that resolves to multiple addresses where
 *   only some are internal.
 * - `resolveHostname` is injectable (defaults to `dns.lookup`) so tests can
 *   simulate DNS-rebinding-style scenarios (a hostname that "resolves" to
 *   an internal address) without any real network access.
 *
 * Known limitation (documented, not silently ignored): this validates the
 * DNS answer at the time of the check, but does not pin the subsequent
 * TCP connection to that exact validated IP. A narrow TOCTOU window exists
 * if an attacker's DNS record changes between validation and connect for
 * the *same* hop (classic DNS-rebinding). Closing that fully needs a
 * custom low-level connection dispatcher; that's flagged as a follow-up
 * rather than attempted here half-verified with no network access to test
 * against. Re-validating every redirect hop (this module's other job) is
 * still real protection against the far more common case: a first request
 * to a legitimate public host that then redirects to an internal address.
 */
import { promises as dns } from "node:dns";
import { InvalidUrlError, SSRFBlockedError } from "../errors";
import { isIPv4, isIPv6, ipv4InCidr, ipv6InCidr, unwrapIPv4MappedIPv6, stripIPv6Brackets } from "./ipRange";
import { BLOCKED_IPV4_CIDRS, BLOCKED_IPV6_CIDRS, BLOCKED_HOSTNAMES, isBlockedHostnameSuffix } from "./blockedRanges";

export const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostnameResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface ValidatedUrl {
  url: URL;
  hostname: string;
  resolvedAddresses: string[];
}

export interface SsrfPolicyOptions {
  resolveHostname?: HostnameResolver;
}

/** Real resolver used in production: Node's dns.lookup, all answers. */
export const defaultResolver: HostnameResolver = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
};

/** Pure: is this already-obtained IP literal inside a blocked range? */
export function isDisallowedIp(address: string): boolean {
  if (isIPv4(address)) {
    return BLOCKED_IPV4_CIDRS.some((cidr) => ipv4InCidr(address, cidr));
  }
  if (isIPv6(address)) {
    const mapped = unwrapIPv4MappedIPv6(address);
    if (mapped) return isDisallowedIp(mapped);
    return BLOCKED_IPV6_CIDRS.some((cidr) => ipv6InCidr(address, cidr));
  }
  // Not a recognizable IP literal — reject defensively rather than assume safe.
  return true;
}

/**
 * Validates a URL end-to-end: parse, protocol, credentials, hostname
 * blocklist, then every DNS-resolved address. Throws InvalidUrlError for
 * malformed/unsupported input, SSRFBlockedError for policy violations.
 */
export async function validateUrl(
  rawUrl: string,
  options: SsrfPolicyOptions = {},
): Promise<ValidatedUrl> {
  const resolveHostname = options.resolveHostname ?? defaultResolver;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidUrlError("The URL could not be parsed.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new InvalidUrlError(`Only http/https URLs are allowed (got "${url.protocol}").`);
  }

  if (url.username || url.password) {
    throw new InvalidUrlError("URLs with embedded credentials are not allowed.");
  }

  const hostname = stripIPv6Brackets(url.hostname.toLowerCase());
  if (!hostname) {
    throw new InvalidUrlError("The URL has no hostname.");
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || isBlockedHostnameSuffix(hostname)) {
    throw new SSRFBlockedError(`"${hostname}" is a local/internal hostname.`);
  }

  // A literal IP in the URL resolves to itself — validate directly, no DNS.
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isDisallowedIp(hostname)) {
      throw new SSRFBlockedError("The URL points directly at a private/internal IP address.");
    }
    return { url, hostname, resolvedAddresses: [hostname] };
  }

  let resolved: ResolvedAddress[];
  try {
    resolved = await resolveHostname(hostname);
  } catch {
    throw new InvalidUrlError(`Could not resolve hostname "${hostname}".`);
  }

  if (resolved.length === 0) {
    throw new InvalidUrlError(`Hostname "${hostname}" did not resolve to any address.`);
  }

  // Every answer must be allowed, not just the first — a multi-answer
  // response where any one address is internal is still blocked.
  for (const { address } of resolved) {
    if (isDisallowedIp(address)) {
      throw new SSRFBlockedError(
        `Hostname "${hostname}" resolves to a private/internal network address.`,
      );
    }
  }

  return { url, hostname, resolvedAddresses: resolved.map((r) => r.address) };
}

/**
 * Resolves a redirect's Location header against the URL that produced it,
 * then runs the exact same validation on the absolute result. The fetcher
 * calls this for every hop — redirects are never followed unvalidated.
 */
export async function validateRedirectTarget(
  location: string,
  fromUrl: URL,
  options: SsrfPolicyOptions = {},
): Promise<ValidatedUrl> {
  let absolute: URL;
  try {
    absolute = new URL(location, fromUrl);
  } catch {
    throw new InvalidUrlError("The redirect Location header could not be parsed.");
  }
  return validateUrl(absolute.toString(), options);
}
