import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIPv4,
  isIPv6,
  ipv4ToInt,
  ipv4InCidr,
  ipv6ToBytes,
  ipv6InCidr,
  unwrapIPv4MappedIPv6,
  stripIPv6Brackets,
} from "./ipRange";

test("isIPv4 / isIPv6: classify correctly", () => {
  assert.equal(isIPv4("127.0.0.1"), true);
  assert.equal(isIPv4("::1"), false);
  assert.equal(isIPv6("::1"), true);
  assert.equal(isIPv6("127.0.0.1"), false);
});

test("stripIPv6Brackets: removes brackets only when present", () => {
  assert.equal(stripIPv6Brackets("[::1]"), "::1");
  assert.equal(stripIPv6Brackets("::1"), "::1");
});

test("ipv4ToInt: converts dotted-quad to a 32-bit integer", () => {
  assert.equal(ipv4ToInt("0.0.0.0"), 0);
  assert.equal(ipv4ToInt("255.255.255.255"), 0xffffffff);
  assert.equal(ipv4ToInt("127.0.0.1"), (127 << 24) | 1);
});

test("ipv4ToInt: rejects malformed addresses", () => {
  assert.throws(() => ipv4ToInt("1.2.3"));
  assert.throws(() => ipv4ToInt("1.2.3.256"));
  assert.throws(() => ipv4ToInt("not.an.ip.address"));
});

test("ipv4InCidr: matches addresses inside the block", () => {
  assert.equal(ipv4InCidr("127.0.0.1", "127.0.0.0/8"), true);
  assert.equal(ipv4InCidr("127.255.255.255", "127.0.0.0/8"), true);
  assert.equal(ipv4InCidr("10.1.2.3", "10.0.0.0/8"), true);
  assert.equal(ipv4InCidr("192.168.1.1", "192.168.0.0/16"), true);
  assert.equal(ipv4InCidr("169.254.169.254", "169.254.0.0/16"), true);
});

test("ipv4InCidr: rejects addresses outside the block", () => {
  assert.equal(ipv4InCidr("8.8.8.8", "127.0.0.0/8"), false);
  assert.equal(ipv4InCidr("11.0.0.1", "10.0.0.0/8"), false);
  assert.equal(ipv4InCidr("192.169.1.1", "192.168.0.0/16"), false);
});

test("ipv4InCidr: /0 matches everything, /32 matches only the exact address", () => {
  assert.equal(ipv4InCidr("8.8.8.8", "0.0.0.0/0"), true);
  assert.equal(ipv4InCidr("8.8.8.8", "8.8.8.8/32"), true);
  assert.equal(ipv4InCidr("8.8.8.9", "8.8.8.8/32"), false);
});

test("ipv6ToBytes: parses compressed and full forms identically", () => {
  const compressed = ipv6ToBytes("::1");
  const full = ipv6ToBytes("0:0:0:0:0:0:0:1");
  assert.deepEqual([...compressed], [...full]);
  assert.equal(compressed[15], 1);
});

test("ipv6ToBytes: parses the unspecified address", () => {
  const bytes = ipv6ToBytes("::");
  assert.deepEqual([...bytes], new Array(16).fill(0));
});

test("ipv6ToBytes: handles brackets", () => {
  const withBrackets = ipv6ToBytes("[::1]");
  const without = ipv6ToBytes("::1");
  assert.deepEqual([...withBrackets], [...without]);
});

test("ipv6InCidr: loopback and link-local ranges", () => {
  assert.equal(ipv6InCidr("::1", "::1/128"), true);
  assert.equal(ipv6InCidr("fe80::1", "fe80::/10"), true);
  assert.equal(ipv6InCidr("fec0::1", "fe80::/10"), false);
  assert.equal(ipv6InCidr("fc00::1", "fc00::/7"), true);
  assert.equal(ipv6InCidr("fd12:3456::1", "fc00::/7"), true);
  assert.equal(ipv6InCidr("2001:4860:4860::8888", "fc00::/7"), false); // public (Google DNS)
});

test("unwrapIPv4MappedIPv6: extracts the embedded IPv4 address", () => {
  // This is the compressed hex form real DNS/URL parsing actually produces
  // for ::ffff:127.0.0.1 (verified empirically against this Node version).
  assert.equal(unwrapIPv4MappedIPv6("::ffff:7f00:1"), "127.0.0.1");
  assert.equal(unwrapIPv4MappedIPv6("::ffff:808:808"), "8.8.8.8");
});

test("unwrapIPv4MappedIPv6: returns null for non-mapped addresses", () => {
  assert.equal(unwrapIPv4MappedIPv6("::1"), null);
  assert.equal(unwrapIPv4MappedIPv6("fe80::1"), null);
  assert.equal(unwrapIPv4MappedIPv6("127.0.0.1"), null); // not even IPv6
});
