/**
 * Ranges below are the authoritative control. The hostname blocklist in
 * this file is defense-in-depth / a fast-path only — every one of those
 * names resolves to an address the IP ranges already reject, so removing
 * the hostname list would not open a hole, only lose the early exit (and
 * the slightly clearer error message) before a DNS lookup happens.
 */

// IANA special-purpose IPv4 address registry — anything not globally
// routable and reachable only from inside a private network or the host
// itself.
export const BLOCKED_IPV4_CIDRS: readonly string[] = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8", // private
  "100.64.0.0/10", // carrier-grade NAT (shared address space)
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (includes cloud metadata endpoints)
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // documentation (TEST-NET-1)
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmark testing
  "198.51.100.0/24", // documentation (TEST-NET-2)
  "203.0.113.0/24", // documentation (TEST-NET-3)
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (includes 255.255.255.255 broadcast)
];

export const BLOCKED_IPV6_CIDRS: readonly string[] = [
  "::1/128", // loopback
  "::/128", // unspecified
  "64:ff9b::/96", // NAT64 well-known prefix (maps to IPv4; not unwrapped — see known limitation in ssrf.ts)
  "fc00::/7", // unique local (private)
  "fe80::/10", // link-local
  "ff00::/8", // multicast
];

// Exact-match hostnames known to always be local/internal, checked before
// any DNS lookup as a fast path.
export const BLOCKED_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // GCP metadata server hostname (IP also blocked)
]);

export function isBlockedHostnameSuffix(hostname: string): boolean {
  return hostname.endsWith(".localhost");
}
