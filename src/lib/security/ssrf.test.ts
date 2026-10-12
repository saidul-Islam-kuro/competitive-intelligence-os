import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUrl, validateRedirectTarget, isDisallowedIp, type HostnameResolver } from "./ssrf";
import { InvalidUrlError, SSRFBlockedError } from "../errors";

/** Builds a resolver that always answers with the given addresses. */
function fakeResolver(addresses: Array<{ address: string; family: 4 | 6 }>): HostnameResolver {
  return async () => addresses;
}

const PUBLIC_IPV4 = { address: "93.184.216.34", family: 4 as const }; // example.com's real IP, used as a fixture value only — no network call is made
const PUBLIC_IPV6 = { address: "2001:4860:4860::8888", family: 6 as const }; // Google public DNS, fixture only

test("validateUrl: accepts a public https URL", async () => {
  const result = await validateUrl("https://example.com/page", {
    resolveHostname: fakeResolver([PUBLIC_IPV4]),
  });
  assert.equal(result.hostname, "example.com");
  assert.deepEqual(result.resolvedAddresses, ["93.184.216.34"]);
});

test("validateUrl: accepts a public http URL", async () => {
  const result = await validateUrl("http://example.com/page", {
    resolveHostname: fakeResolver([PUBLIC_IPV4]),
  });
  assert.equal(result.hostname, "example.com");
});

test("validateUrl: rejects a malformed URL", async () => {
  await assert.rejects(() => validateUrl("not a url at all"), InvalidUrlError);
  await assert.rejects(() => validateUrl(""), InvalidUrlError);
});

test("validateUrl: rejects non-http(s) protocols", async () => {
  await assert.rejects(() => validateUrl("ftp://example.com/file"), InvalidUrlError);
  await assert.rejects(() => validateUrl("file:///etc/passwd"), InvalidUrlError);
  await assert.rejects(() => validateUrl("gopher://internal/"), InvalidUrlError);
});

test("validateUrl: rejects localhost by name (no DNS needed)", async () => {
  await assert.rejects(() => validateUrl("http://localhost/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://localhost:8080/admin"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://sub.localhost/"), SSRFBlockedError);
});

test("validateUrl: rejects 127.0.0.1 and loopback range as a literal", async () => {
  await assert.rejects(() => validateUrl("http://127.0.0.1/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://127.255.255.255/"), SSRFBlockedError);
});

test("validateUrl: rejects private IPv4 ranges as literals", async () => {
  await assert.rejects(() => validateUrl("http://10.0.0.5/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://172.16.0.5/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://192.168.1.5/"), SSRFBlockedError);
});

test("validateUrl: rejects link-local IPv4 (including the cloud metadata address)", async () => {
  await assert.rejects(() => validateUrl("http://169.254.169.254/latest/meta-data/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://169.254.1.1/"), SSRFBlockedError);
});

test("validateUrl: rejects IPv6 loopback and unspecified address", async () => {
  await assert.rejects(() => validateUrl("http://[::1]/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://[::]/"), SSRFBlockedError);
});

test("validateUrl: rejects private IPv6 (unique local + link-local)", async () => {
  await assert.rejects(() => validateUrl("http://[fc00::1]/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://[fd12:3456:789a::1]/"), SSRFBlockedError);
  await assert.rejects(() => validateUrl("http://[fe80::1]/"), SSRFBlockedError);
});

test("validateUrl: rejects an IPv4-mapped IPv6 literal pointing at a private address", async () => {
  await assert.rejects(() => validateUrl("http://[::ffff:127.0.0.1]/"), SSRFBlockedError);
});

test("validateUrl: accepts a public IPv6 literal", async () => {
  const result = await validateUrl("http://[2001:4860:4860::8888]/");
  assert.equal(result.resolvedAddresses[0], "2001:4860:4860::8888");
});

test("validateUrl: rejects embedded credentials", async () => {
  await assert.rejects(
    () => validateUrl("http://user:pass@example.com/", { resolveHostname: fakeResolver([PUBLIC_IPV4]) }),
    InvalidUrlError,
  );
  await assert.rejects(
    () => validateUrl("http://admin@example.com/", { resolveHostname: fakeResolver([PUBLIC_IPV4]) }),
    InvalidUrlError,
  );
});

test("validateUrl: rejects a hostname that DNS-resolves to a private address", async () => {
  // Simulates a hostname an attacker controls that resolves internally
  // (DNS rebinding / SSRF-via-hostname) — no real DNS lookup happens here.
  await assert.rejects(
    () => validateUrl("http://attacker-controlled.example/", {
      resolveHostname: fakeResolver([{ address: "10.0.0.1", family: 4 }]),
    }),
    SSRFBlockedError,
  );
});

test("validateUrl: rejects when ANY of multiple DNS answers is private", async () => {
  await assert.rejects(
    () => validateUrl("http://multi-answer.example/", {
      resolveHostname: fakeResolver([PUBLIC_IPV4, { address: "192.168.1.1", family: 4 }]),
    }),
    SSRFBlockedError,
  );
});

test("validateUrl: rejects when DNS resolution fails", async () => {
  const resolver: HostnameResolver = async () => {
    throw new Error("ENOTFOUND");
  };
  await assert.rejects(() => validateUrl("http://does-not-resolve.example/", { resolveHostname: resolver }), InvalidUrlError);
});

test("validateRedirectTarget: allows a redirect to another public host", async () => {
  const base = new URL("https://example.com/start");
  const result = await validateRedirectTarget("https://cdn.example.net/next", base, {
    resolveHostname: fakeResolver([PUBLIC_IPV6]),
  });
  assert.equal(result.hostname, "cdn.example.net");
});

test("validateRedirectTarget: resolves a relative Location against the originating URL", async () => {
  const base = new URL("https://example.com/a/b");
  const result = await validateRedirectTarget("/a/c", base, {
    resolveHostname: fakeResolver([PUBLIC_IPV4]),
  });
  assert.equal(result.url.href, "https://example.com/a/c");
});

test("validateRedirectTarget: blocks a redirect to a private/internal address", async () => {
  const base = new URL("https://example.com/start");
  await assert.rejects(() => validateRedirectTarget("http://127.0.0.1/admin", base), SSRFBlockedError);
});

test("validateRedirectTarget: blocks a redirect to a hostname that resolves internally", async () => {
  const base = new URL("https://example.com/start");
  await assert.rejects(
    () => validateRedirectTarget("https://looks-fine.example/", base, {
      resolveHostname: fakeResolver([{ address: "169.254.169.254", family: 4 }]),
    }),
    SSRFBlockedError,
  );
});

test("isDisallowedIp: spot checks across both families", () => {
  assert.equal(isDisallowedIp("8.8.8.8"), false);
  assert.equal(isDisallowedIp("10.0.0.1"), true);
  assert.equal(isDisallowedIp("2001:4860:4860::8888"), false);
  assert.equal(isDisallowedIp("fe80::1"), true);
  assert.equal(isDisallowedIp("not-an-ip"), true); // unrecognized -> reject defensively
});
