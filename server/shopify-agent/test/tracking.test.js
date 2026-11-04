// Pod.AI parcel tracking: carrier API first (YunExpress / 4PX), then 51Tracking v4, then the tracking link; cache; read-only.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-tracking-"));
for (const k of ["TRACKING51_API_KEY", "FOURPX_APP_KEY", "FOURPX_APP_SECRET", "LOGISTICS_MOCK", "YUNEXPRESS_PROD_APP_ID"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", STORE_PERSIST_PATH: path.join(tmp, "state.json"), LOGISTICS_STATE_PATH: path.join(tmp, "logi.json"), YUNEXPRESS_APP_ID: "yid", YUNEXPRESS_APP_SECRET: "ysec" });
const { setFetch } = await import("../../logistics/http.js");
const T = await import("../tracking.js");

const calls = [];
let yunEvents = [{ process_time: "2026-11-02 08:00:00", process_location: "Shenzhen", process_content: "Departed facility" }, { process_time: "2026-11-03 09:30:00", process_location: "Zurich", process_content: "Arrived in destination country" }];
let s51 = {}; // number -> item
const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
setFetch(async (url, init = {}) => {
  const u = String(url); calls.push({ u, method: init.method || "GET", headers: init.headers || {}, body: init.body });
  if (/oauth2\/token/.test(u)) return res({ accessToken: "yt", expiresIn: 7200 });
  if (/track-service\/info\/get/.test(u)) return res({ success: true, code: "0", result: [{ package_status: yunEvents.length ? "T" : "N", track_Info: { track_events: yunEvents } }] });
  if (/api\.51tracking\.com\/v4\/trackings\/get/.test(u)) { assert.equal(init.headers["Tracking-Api-Key"], "k51"); const n = new URL(u).searchParams.get("tracking_numbers"); return res({ meta: { code: 200 }, data: { success: s51[n] ? [s51[n]] : [] } }); }
  if (/api\.51tracking\.com\/v4\/couriers\/detect/.test(u)) return res({ meta: { code: 200 }, data: [{ courier_code: "swiss-post" }] });
  if (/api\.51tracking\.com\/v4\/trackings\/create/.test(u)) { const b = JSON.parse(init.body); s51[b.tracking_number] = { tracking_number: b.tracking_number, courier_code: b.courier_code, delivery_status: "transit",
    origin_info: { trackinfo: [{ checkpoint_date: "2026-11-03 10:00", location: "Bern", tracking_detail: "Sorted" }, { checkpoint_date: "2026-11-01 10:00", location: "Basel", tracking_detail: "Accepted" }] } }; return res({ meta: { code: 200 }, data: {} }); }
  throw new Error("unexpected " + u);
});
const result = {};
try {
  // 1. Integrated carrier with keys → carrier API, no 51Tracking
  let r = await T.trackParcel({ number: "YT2400000000001", company: "YunExpress" });
  assert.equal(r.source, "yunexpress"); assert.equal(r.status, "in_transit"); assert.equal(r.last_event.text, "Arrived in destination country"); assert.equal(r.events.length, 2);
  assert.match(r.url, /yuntrack\.com/); assert.ok(!calls.some(c => /51tracking/.test(c.u)));
  result.carrier_api = "pass";
  // 2. Cache: same number again → no new request
  const n = calls.length; r = await T.trackParcel({ number: "YT2400000000001", company: "YunExpress" }); assert.equal(r.cached, true); assert.equal(calls.length, n);
  result.cache = "pass";
  // 3. Carrier knows nothing + no 51Tracking key → tracking link
  yunEvents = []; T.clearTrackingCache();
  r = await T.trackParcel({ number: "YT2400000000002", company: "YunExpress", url: "https://shop.example/t/2" });
  assert.equal(r.source, "link"); assert.equal(r.url, "https://shop.example/t/2"); assert.equal(r.last_event, null);
  // 4. same with the 51Tracking key → register + fetch
  process.env.TRACKING51_API_KEY = "k51"; T.clearTrackingCache();
  r = await T.trackParcel({ number: "YT2400000000002", company: "YunExpress" });
  assert.equal(r.source, "51tracking"); assert.equal(r.last_event.location, "Bern"); assert.ok(calls.some(c => /trackings\/create/.test(c.u) && JSON.parse(c.body).courier_code === "yunexpress"));
  result.carrier_empty_to_51 = "pass";
  // 5. Carrier we don't integrate (Swiss Post), already registered at 51Tracking → one GET, no create
  s51["99.00.1.2"] = { tracking_number: "99.00.1.2", courier_code: "swiss-post", delivery_status: "delivered", origin_info: { trackinfo: [{ checkpoint_date: "2026-11-04 11:00", location: "Zürich", tracking_detail: "Delivered" }] } };
  const before = calls.length; r = await T.trackParcel({ number: "99.00.1.2", company: "Swiss Post", lang: "de" });
  assert.equal(r.source, "51tracking"); assert.equal(r.status, "delivered"); assert.equal(r.status_text, "Zugestellt");
  assert.deepEqual(calls.slice(before).map(c => c.method), ["GET"]); assert.ok(!calls.slice(before).some(c => /yunexpress|4px/.test(c.u)));
  // unknown courier name → detect → create → get
  r = await T.trackParcel({ number: "LX123456789CH", company: "" }); assert.equal(r.source, "51tracking"); assert.ok(calls.some(c => /couriers\/detect/.test(c.u)));
  result.unintegrated_51 = "pass";
  // 6. 4PX without keys → skipped (no request), 51Tracking used
  const b4 = calls.length; r = await T.trackParcel({ number: "4PX3000000001CN", company: "4PX" });
  assert.equal(r.source, "51tracking"); assert.ok(!calls.slice(b4).some(c => /4px\.com/.test(c.u)));
  // 7. Read-only: no carrier order / label / cancel endpoints were ever called; keys never in results
  assert.ok(!calls.some(c => /order\/package\/create|label|cancel|ds\.xms/.test(c.u)));
  assert.ok(!JSON.stringify(r).includes("k51") && !JSON.stringify(r).includes("ysec"));
  // 8. Admin view lists sources by name only
  const src = await T.trackingSources();
  assert.equal(src.tracking51.configured, true); assert.equal(src.carriers.find(c => c.id === "yunexpress").configured, true); assert.equal(src.carriers.find(c => c.id === "fourpx").configured, false);
  assert.ok(!JSON.stringify(src).includes("k51"));
  result.read_only_and_sources = "pass";
  console.log(JSON.stringify({ ok: true, ...result }, null, 1));
} finally { setFetch(null); }
