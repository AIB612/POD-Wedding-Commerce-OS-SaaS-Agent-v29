import { test } from "node:test";
import assert from "node:assert/strict";
import { measurementId, listingMeasurementId, adminSnippet, isValidId } from "../ga.js";

test("measurementId validates G- IDs and ignores junk", () => {
  assert.equal(measurementId({ PODAI_GA_ID: "G-ABC123XY" }), "G-ABC123XY");
  assert.equal(measurementId({ PODAI_GA_ID: " g-abc123xy " }), "G-ABC123XY");
  assert.equal(measurementId({ PODAI_GA_ID: "UA-123" }), "");
  assert.equal(measurementId({ PODAI_GA_ID: "" }), "");
  assert.equal(measurementId({}), "");
});

test("listingMeasurementId is separate env", () => {
  assert.equal(listingMeasurementId({ PODAI_LISTING_GA_ID: "G-LISTING1" }), "G-LISTING1");
  assert.equal(listingMeasurementId({ PODAI_GA_ID: "G-APPONLY1" }), "");
});

test("adminSnippet empty when unset; contains id when set", () => {
  assert.equal(adminSnippet(""), "");
  const html = adminSnippet("G-TEST9999");
  assert.match(html, /gtag\/js\?id=G-TEST9999/);
  assert.match(html, /__PODAI_GA="G-TEST9999"/);
  assert.match(html, /anonymize_ip:true/);
  assert.doesNotMatch(html, /send_page_view:!0|send_page_view:true/);
});

test("isValidId", () => {
  assert.equal(isValidId("G-ABCDEF"), true);
  assert.equal(isValidId("not-an-id"), false);
});

test("admin.html contains GA placeholder for injection", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(html, /<!--__PODAI_GA__-->/);
  assert.match(html, /function gaTrack/);
  assert.match(html, /settings_saved/);
  assert.match(html, /dashboard_view/);
  assert.match(html, /onboarding_step/);
});

test("privacy mentions Google Analytics 4", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  assert.match(html, /Google Analytics 4/);
  assert.match(html, /PODAI_GA_ID/);
});

test("storefront chat source fires anonymous GA event helpers", async () => {
  const fs = await import("node:fs");
  const js = fs.readFileSync(new URL("../../../apps/shopify-agent/src/chat.js", import.meta.url), "utf8");
  for (const name of ["chat_opened", "message_sent", "product_clicked", "add_to_cart", "handoff_shown", "order_lookup"]) {
    assert.match(js, new RegExp(name));
  }
  assert.match(js, /analyticsProcessingAllowed/);
  assert.doesNotMatch(js, /gtag\("event"[^)]*message/);
});
