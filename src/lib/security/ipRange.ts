/**
 * Pure IP-address utilities used by the SSRF policy (./ssrf.ts). No network
 * I/O, no external dependencies — operates only on already-obtained address
 * strings (from `net.isIP`-recognized literals or `dns.lookup` results).
 *
 * IPv4 addresses are compared as 32-bit unsigned integers. IPv6 addresses
 * are compared as 16-byte arrays. Both support CIDR containment checks via
 * a prefix length.
 */
import { isIPv4 as nodeIsIPv4, isIPv6 as nodeIsIPv6 } from "node:net";

export function isIPv4(address: string): boolean {
  return nodeIsIPv4(address);
}

export function isIPv6(address: string): boolean {
  return nodeIsIPv6(address);
}

/** Strips the [brackets] WHATWG URL puts around a literal IPv6 hostname. */
export function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

export function ipv4ToInt(address: string): number {
  const parts = address.split(".");
  if (parts.length !== 4) {
    throw new Error(`Not a valid IPv4 address: ${address}`);
  }
  let result = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new Error(`Not a valid IPv4 address: ${address}`);
    }
    result = (result << 8) | octet;
  }
  return result >>> 0; // unsigned
}

function parseIPv4Cidr(cidr: string): { base: number; prefixLen: number } {
  const [addr, lenStr] = cidr.split("/");
  const prefixLen = Number(lenStr);
  return { base: ipv4ToInt(addr), prefixLen };
}

export function ipv4InCidr(address: string, cidr: string): boolean {
  const { base, prefixLen } = parseIPv4Cidr(cidr);
  const addr = ipv4ToInt(address);
  if (prefixLen === 0) return true;
  const mask = prefixLen >= 32 ? 0xffffffff : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (addr & mask) === (base & mask);
}

/**
 * Parses any valid textual IPv6 representation (with "::" compression, or
 * fully written out) into 16 bytes. Does not handle zone IDs (%eth0) —
 * `new URL()` already rejects those (verified empirically; see ssrf.ts).
 */
export function ipv6ToBytes(address: string): Uint8Array {
  const clean = stripIPv6Brackets(address);
  const doubleColonIndex = clean.indexOf("::");

  let groups: string[];
  if (doubleColonIndex !== -1) {
    const left = clean.slice(0, doubleColonIndex);
    const right = clean.slice(doubleColonIndex + 2);
    const leftGroups = left ? left.split(":") : [];
    const rightGroups = right ? right.split(":") : [];
    const missing = 8 - (leftGroups.length + rightGroups.length);
    if (missing < 0) {
      throw new Error(`Not a valid IPv6 address: ${address}`);
    }
    groups = [...leftGroups, ...Array(missing).fill("0"), ...rightGroups];
  } else {
    groups = clean.split(":");
  }

  if (groups.length !== 8) {
    throw new Error(`Not a valid IPv6 address: ${address}`);
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const value = Number.parseInt(groups[i] || "0", 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`Not a valid IPv6 address: ${address}`);
    }
    bytes[i * 2] = (value >> 8) & 0xff;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

export function ipv6InCidr(address: string, cidr: string): boolean {
  const [prefixAddr, lenStr] = cidr.split("/");
  const prefixLen = Number(lenStr);
  const addrBytes = ipv6ToBytes(address);
  const prefixBytes = ipv6ToBytes(prefixAddr);

  const fullBytes = Math.floor(prefixLen / 8);
  const remainingBits = prefixLen % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (addrBytes[i] !== prefixBytes[i]) return false;
  }
  if (remainingBits > 0) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    if ((addrBytes[fullBytes] & mask) !== (prefixBytes[fullBytes] & mask)) return false;
  }
  return true;
}

/**
 * If `address` is an IPv4-mapped IPv6 address (::ffff:0:0/96 — the standard
 * form for representing an IPv4 address within IPv6), returns the embedded
 * IPv4 address as a dotted-quad string. Otherwise returns null.
 */
export function unwrapIPv4MappedIPv6(address: string): string | null {
  let bytes: Uint8Array;
  try {
    bytes = ipv6ToBytes(address);
  } catch {
    return null;
  }
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) return null;
  }
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;
  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}
