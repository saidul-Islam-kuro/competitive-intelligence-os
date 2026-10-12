/**
 * Requires `npm install` (cheerio) to run — not runnable in the sandbox
 * this was written in. See VERIFY.md for what was and wasn't executed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHtml, looksLikeRenderRequired } from "./htmlParser";

const SAMPLE_HTML = `
<!doctype html>
<html>
<head>
  <title>  Example Product  </title>
  <meta name="description" content="  The best example product.  ">
  <link rel="canonical" href="/canonical-page">
  <script type="application/ld+json">
    { "@type": "Product", "name": "Widget", "offers": { "price": "19.99" } }
  </script>
  <script>var trackingId = "abc123";</script>
  <style>.hidden { display: none; }</style>
</head>
<body>
  <h1>Welcome to Example</h1>
  <h2>Pricing</h2>
  <p>Our product costs $19.99 per month.</p>
  <a href="/pricing">Pricing</a>
  <a href="https://external.example/docs">Docs</a>
  <a href="javascript:void(0)">Ignore me</a>
  <a href="#section">Also ignore me</a>
</body>
</html>
`;

test("parseHtml: extracts and trims the title", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.equal(result.title, "Example Product");
});

test("parseHtml: extracts the meta description", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.equal(result.metaDescription, "The best example product.");
});

test("parseHtml: resolves a relative canonical URL against the base URL", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/some/page");
  assert.equal(result.canonicalUrl, "https://example.com/canonical-page");
});

test("parseHtml: extracts headings with their levels", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.deepEqual(result.headings, [
    { level: 1, text: "Welcome to Example" },
    { level: 2, text: "Pricing" },
  ]);
});

test("parseHtml: extracts visible body text, excluding script/style content", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.match(result.visibleText, /Our product costs \$19\.99 per month\./);
  assert.ok(!result.visibleText.includes("abc123"));
  assert.ok(!result.visibleText.includes("display: none"));
});

test("parseHtml: extracts links, resolves relative hrefs, and skips javascript:/# links", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.deepEqual(result.links, [
    { href: "https://example.com/pricing", text: "Pricing" },
    { href: "https://external.example/docs", text: "Docs" },
  ]);
});

test("parseHtml: parses valid JSON-LD blocks", () => {
  const result = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.deepEqual(result.jsonLd, [{ "@type": "Product", name: "Widget", offers: { price: "19.99" } }]);
});

test("REGRESSION (Phase 2.1 fix): JSON-LD is actually extracted, not silently dropped by removing <script> first", () => {
  // Phase 2 had this backwards — script[type=ld+json] was removed from the
  // DOM before the JSON-LD extraction query ran, so jsonLd was always [].
  const html = `
    <html><head>
      <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Product", "name": "Test Product" }
      </script>
    </head><body><p>Body text</p></body></html>
  `;
  const result = parseHtml(html, "https://example.com/");
  assert.equal(result.jsonLd.length, 1);
  const product = result.jsonLd[0] as { "@type": string; name: string };
  assert.equal(product["@type"], "Product");
  assert.equal(product.name, "Test Product");
});

test("REGRESSION (Phase 2.1 fix): JSON-LD extraction still keeps script contents out of visible text", () => {
  const html = `
    <html><body>
      <script type="application/ld+json">{ "@type": "Product", "name": "Should Not Appear As Text" }</script>
      <p>Real visible text</p>
    </body></html>
  `;
  const result = parseHtml(html, "https://example.com/");
  assert.equal(result.jsonLd.length, 1);
  assert.match(result.visibleText, /Real visible text/);
  assert.ok(!result.visibleText.includes("Should Not Appear As Text"));
});

test("parseHtml: skips malformed JSON-LD instead of throwing", () => {
  const html = `<script type="application/ld+json">{ not valid json </script><body>text</body>`;
  const result = parseHtml(html, "https://example.com/");
  assert.deepEqual(result.jsonLd, []);
});

test("parseHtml: two parses of the same HTML produce identical extraction (deterministic)", () => {
  const a = parseHtml(SAMPLE_HTML, "https://example.com/");
  const b = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.deepEqual(a, b);
});

test("Phase 4/5 infra fix: block-level elements are separated by line breaks even with no whitespace in the source markup", () => {
  // Minified/compact HTML with zero whitespace between tags — without the
  // fix, cheerio's plain text-node concatenation would flatten this into
  // one run-on string ("PricingBasic $9/moPro $29/mo"), making it
  // impossible for pricing/feature extraction to anchor a price to the
  // heading that precedes it.
  const html = "<html><body><h2>Pricing</h2><p>Basic $9/mo</p><p>Pro $29/mo</p></body></html>";
  const result = parseHtml(html, "https://example.com/");
  const lines = result.visibleText.split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines, ["Pricing", "Basic $9/mo", "Pro $29/mo"]);
});

test("looksLikeRenderRequired: flags a thin SPA shell", () => {
  const html = `<html><body><div id="root"></div></body></html>` + " ".repeat(2000);
  const extracted = parseHtml(html, "https://example.com/");
  assert.equal(looksLikeRenderRequired(html, extracted), true);
});

test("looksLikeRenderRequired: does not flag a normal content page", () => {
  const extracted = parseHtml(SAMPLE_HTML, "https://example.com/");
  assert.equal(looksLikeRenderRequired(SAMPLE_HTML, extracted), false);
});
