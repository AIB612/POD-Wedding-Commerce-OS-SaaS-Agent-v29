// Pod.AI recommendation: needs → 2–4 real shop products (budget, colour variant, recipient), one clarifying question,
// refinements (cheaper / more like this / colour / quantity), "goes well with" from the same collection, 5 languages.
import assert from "node:assert/strict";
import test from "node:test";
import { podaiRecommend, podaiNeeds, isFollowUp } from "../engine/reco.js";
import { classifyRules } from "../engine/nlu.js";
import { PRODUCTS, fakeSearch } from "./fixtures-reco.js";
const search = fakeSearch();
const ids = new Set(PRODUCTS.map(p => p.id));
function session(lang = "en") { const conv = { messages: [], slots: {}, tools: {} }; return async text => {
  conv.messages.push({ role: "user", text }); const ctx = { lang, conv, ui: [] }; const follow = isFollowUp(text, conv.slots.reco, conv);
  const answer = await podaiRecommend(ctx, classifyRules(text, { hint: lang }), text, { search, follow }); conv.messages.push({ role: "assistant", text: answer });
  return { answer, cards: ctx.ui.find(u => u.type === "products")?.items || [], chips: ctx.ui.find(u => u.type === "chips")?.items || [] }; }; }

test("needs parsing", () => {
  const n = podaiNeeds("a gift for my wife under 30 in pink", classifyRules("a gift for my wife under 30 in pink"));
  assert.deepEqual([n.who, n.budget, n.color], ["her", 30, "pink"]);
  assert.equal(podaiNeeds("Geschenk für meinen Mann, Budget insgesamt 200 für 4 Leute").budget_total, 200);
});
test("clarify once, then 2–4 real picks within budget, cheaper, more, colour", async () => {
  const say = session("en");
  let r = await say("Can you recommend something?"); assert.equal(r.cards.length, 0); assert.match(r.answer, /Who is it for/); assert.ok(r.chips.includes("Gift ideas"));
  r = await say("a gift for him under 70"); assert.ok(r.cards.length >= 2 && r.cards.length <= 3, r.answer); assert.match(r.answer, /for him/);
  for (const c of r.cards) { assert.ok(ids.has(c.id) && c.unit_price <= 70 && /^https:\/\/alpine\.example\/products\//.test(c.link)); }
  assert.match(r.answer, /CHF \d+\.\d\d/); assert.ok(!/Sold-out/.test(r.answer), "sold-out products are never recommended");
  const min = Math.min(...r.cards.map(c => c.unit_price)), shown = r.cards.map(c => c.id);
  r = await say("cheaper"); assert.ok(r.cards.length && r.cards.every(c => c.unit_price < min), r.answer);
  r = await say("more like this"); assert.ok(r.cards.every(c => !shown.includes(c.id)));
  r = await say("in blue"); assert.ok(r.cards.length && r.cards.every(c => ["101", "201", "502", "801"].includes(String(c.variant_id))), JSON.stringify(r.cards.map(c => c.variant_id))); assert.match(r.answer, /blue/);
  r = await say("cheaper"); assert.match(r.answer, /already our most affordable/, "honest when nothing cheaper exists");
});
test("product words + colour variant price + goes well with (DE / FR / IT / ZH)", async () => {
  let r = await session("de")("Empfehlung: T-Shirt in Blau"); assert.ok(r.cards[0].name.includes("Tee") && r.cards.every(c => /Tee/.test(c.name)), r.answer); assert.match(r.answer, /Blau/);
  r = await session("fr")("Une idée cadeau pour lui ?"); assert.ok(r.cards.length >= 2); assert.match(r.answer, /pour lui/);
  r = await session("it")("Idee regalo per bambini"); assert.equal(r.cards[0].name, "Kids Goat Tee"); assert.match(r.answer, /bambini/);
  r = await session("zh")("推荐一个礼物，100以内"); assert.ok(r.cards.length >= 2 && r.cards.every(c => c.unit_price <= 100)); assert.match(r.answer, /首推/);
  r = await session("en")("gift ideas for a wedding"); assert.equal(r.cards[0].name, "Wedding Guest Tote"); assert.match(r.answer, /Goes well with/);
});
test("nothing under the budget → honest + cheapest real options; impossible colour → says so", async () => {
  let r = await session("en")("gift ideas under 5"); assert.match(r.answer, /Nothing is under CHF 5/); assert.equal(r.cards[0].name, "Wedding Guest Tote");
  r = await session("en")("a gift in orange"); assert.match(r.answer, /don't see orange/);
});
