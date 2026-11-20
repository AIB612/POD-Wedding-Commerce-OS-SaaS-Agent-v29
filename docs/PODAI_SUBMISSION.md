# Pod.AI — store submission pack (Shopify App Store + WordPress.org)

> **Status 2026-11-20:** everything that can be prepared in code is done. The steps marked **👤 Sherry** need your accounts and can only be done by you.
> Requirements source: Shopify "App Store requirements" (shopify.dev, fetched 2026-11-20) and WordPress.org Plugin Check 2.2.0.

---

## Part A — WordPress.org: "Pod.AI Chat for WooCommerce" 1.2.0

### A1. What was checked (done)

| Check | Result |
|---|---|
| Official **Plugin Check 2.2.0** (`wp plugin check pod-ai-chat` incl. experimental + low-severity checks) | ✅ No errors, no warnings |
| Real install: **WordPress 7.1.5 + WooCommerce 11.3.1** | ✅ storefront e2e 22/22 · real-browser widget test 11/11 · Assistant page end-to-end |
| Real install: WordPress 6.8.3 + WooCommerce 10.3.4 | ✅ Assistant page end-to-end |
| `php -l` on every file, JS syntax | ✅ |
| Header: Requires at least 6.3 · Tested up to 7.1 · Requires PHP 7.4 · WC tested up to 11.3 · GPLv2+ · text domain | ✅ |
| readme: short description 148/150 chars · 5 tags · External service section (what is sent, when, terms + privacy links) · changelog · upgrade notice | ✅ |
| Translations de / fr / it / zh_CN complete (`.po` + `.mo`) | ✅ 142/142 strings each |
| Assets: banner 772×250 + 1544×500, icon 128 + 256, screenshots 1–9 | ✅ `apps/woocommerce-plugin/wordpress-org-assets/` |
| Only outbound calls: the documented Pod.AI service (signed client) — no other remote calls, no tracking, nothing before the merchant clicks Connect | ✅ |
| Name "… for WooCommerce" (trademark rule allows "for WooCommerce" at the end) | ✅ |

### A2. 👤 Sherry — steps to submit

1. Create (or use) a **WordPress.org account**. Its username must replace `Contributors: podai` in `apps/woocommerce-plugin/pod-ai-chat/readme.txt` if it isn't `podai` — tell me the username and I'll update + rebuild the zip.
2. Upload `apps/woocommerce-plugin/dist/pod-ai-chat.zip` at **wordpress.org/plugins/developers/add/**. Requested slug: `pod-ai-chat`.
3. Wait for the review e-mail (usually days to a few weeks). Reply to reviewer questions from the same e-mail thread — send me anything they ask for.
4. After approval: commit the plugin to the SVN `trunk/` and tag `1.2.0`, and upload `wordpress-org-assets/*` into SVN `assets/` (I can prepare the exact SVN commands once the slug is confirmed).

---

## Part B — Shopify App Store: "Pod.AI — AI Customer Chat"

### B1. Self-review against Shopify's App Store requirements

✅ passing (evidence in code) · ⚠️ needs your check on a dev store / a decision · ❌ missing (to do)

| Req. | What Shopify asks | Status | Evidence / action |
|---|---|---|---|
| 1.1.1 | Session tokens; works without third-party cookies / local storage (incl. Chrome incognito) | ✅ **fixed today** | Admin used `localStorage` unguarded → a blank page with storage blocked. Now optional + defaults to the merchant's Shopify admin language; tested with storage blocked. |
| 1.1.2 | Use Shopify checkout | ✅ | Chat only adds to cart / links to `/cart`; never takes payment. |
| 1.1.4 | Only factual information | ✅ | No fake reviews / purchase pop-ups; empty dashboards show an "Example data" banner. |
| 1.2.1–1.2.3 | Shopify App Pricing / Billing API; plan changes without support | ✅ / ⚠️ | Managed Pricing (Free / Growth / Pro), limits enforced, "Upgrade / change plan" opens Shopify's plan page. **👤 Configure the 3 plans in the Partner Dashboard and test upgrade + downgrade + reinstall on a dev store.** |
| 2.1.1–2.1.2 | No errors that block review | ⚠️ | All 44 test files pass; **👤 run the "fresh dev store" test in B4.** |
| 2.1.3 | UI merchants can use | ✅ | Embedded admin: Overview, Assistant, Tickets, Knowledge, Settings, Try it. |
| 2.2.1 / 2.2.4 | Use Shopify APIs, GraphQL Admin API only | ✅ | Only `/admin/api/<version>/graphql.json`; no REST calls. |
| 2.2.3 | Latest App Bridge, first script | ✅ | `https://cdn.shopify.com/shopifycloud/app-bridge.js` is the first `<script>` in `admin.html`. |
| 2.3.1–2.3.4 | Install from Shopify, OAuth right away, redirect to app, reinstall | ✅ / ⚠️ | Shopify-managed install + token exchange on first load (`use_legacy_install_flow = false`). **👤 Verify uninstall → reinstall on a dev store.** |
| 3.1.1 | Valid TLS | ✅ | podai.swisspro.site / pod.swisspro.site over HTTPS (HSTS on). |
| 3.1.2 | Expiring offline tokens | ✅ | `expiring=1` token exchange, refresh before expiry (`core.js`). |
| 3.2 | Only necessary scopes | ✅ | `read_products, read_orders, read_shipping, read_discounts, read_legal_policies, write_app_proxy`. `read_orders` = order status in chat; no `read_all_orders`. |
| — | Protected customer data (e-mail for order lookup) | ❌ | **👤 Partner Dashboard → API access → Protected customer data**: request Level 1 (e-mail), purpose *Customer service*. Suggested answers: `docs/Pod.AI-App-Store-Listing.md` §4. Without it, order lookups answer "not available". |
| 4.1.1 / 4.1.2 | Consistent, unique name | ✅ / ⚠️ | Dashboard "Pod.AI" + listing "Pod.AI — AI Customer Chat" share the name. **👤 Search the App Store for "Pod AI" before submitting** (other "…pod ai" chat products exist on other platforms). |
| 4.2.1–4.2.3 | Prices only in the pricing section, none in images | ✅ | New screenshots show plan name/usage only, no prices. Listing text has no prices outside Pricing. |
| 4.3.1 | Declare "Merchant must have online store" | ❌ | **👤 Tick it in the submission form** (the chat is an Online Store app embed). |
| 4.3.2 | Claim only fully supported languages | ✅ | Admin fully in **English, German, French, Italian** → list these four. (Chat also answers in Chinese; don't list Chinese as an admin language.) |
| 4.3.3 / 4.3.4 | No stats / guarantees in text or images | ✅ / ⚠️ | Listing text has none. `1-dashboard.png` shows KPI numbers of a fictional sample shop (real UI). If you want zero risk, upload screenshots 2–6 only. |
| 4.3.5 | Accurate tags | ✅ | Customer support → Chat; secondary Order tracking. |
| 4.3.8 | Geographic / API requirements | ✅ | None geographic; protected-data approval covers order lookup. |
| 4.4.1–4.4.5 | Clear subtitle, real UI images, no Shopify logos, unique images | ✅ | 6 distinct 1600×900 admin screenshots, no browser frame, no Shopify marks: `apps/shopify-agent/listing/`. |
| 4.5.3 | Demo screencast (English) | ❌ | **👤 Record on the dev store** — shot list in B3. |
| 4.5.4 / 4.5.5 | Test credentials / instructions | ✅ | No external account needed — paste the text in B2. |
| 4.5.6 | Emergency developer contact | ❌ | **👤 Partner Dashboard → Settings → emergency contact.** |
| 5.1.1 | Theme app extension only | ✅ | App embed `podai-chat`; no theme code edits. |
| 5.1.2 | Extension shows without errors (Theme Editor + storefront) | ⚠️ | **👤 Check in the Theme Editor on the dev store (B4).** |
| 5.1.3 | Onboarding instructions with deep link | ✅ | Overview → "Get set up" checklist; "Turn on the chat in your theme" deep-links to the Theme Editor on the Pod.AI embed. |
| 5.1.5 | Collected data visible to the merchant | ✅ | Conversations, tickets (transcripts), access log in the admin. |

### B2. Testing instructions for Shopify reviewers (paste into the submission form)

```
Pod.AI needs no separate account or login — everything runs inside Shopify.

1. Install the app. It opens on "Overview" with the "Get set up" checklist.
2. At "Turn on the chat in your theme", click "Set up" (opens the Theme Editor on App embeds → Pod.AI Chat), switch it on, Save.
3. On the storefront, open the chat (bottom right) and try:
   - "Show me your products" → product cards with "Add to cart"
   - "What is your return policy?" → answer from Settings → Policies
   - "Where is my order #1001?" + the order's e-mail → order status and tracking (needs Protected customer data)
   - "I want to talk to a person" + an e-mail → a ticket appears in the app under Tickets
4. In the app:
   - Knowledge → Add answer → ask the same question in the storefront chat
   - Assistant → "What needs my attention today?"; then type:
     answer "Do you gift wrap?" with "Yes, gift wrapping is free."  → click Confirm → the chat now uses it
   - Overview → "Upgrade / change plan" opens Shopify's plan page (Free / Growth / Pro)
The app never changes products, orders or customers; it reads them to answer shoppers.
```

### B3. Demo screencast — shot list (English, ~3 minutes, record on the dev store)

1. **0:00** Install from the listing/Dev Dashboard → permissions → the app opens on Overview (setup checklist visible).
2. **0:20** Click the checklist's deep link → Theme Editor → enable *Pod.AI Chat* → Save.
3. **0:40** Storefront: "Show me gifts under 30" → product cards → Add to cart.
4. **1:05** "Where is my order #1001?" → e-mail → order + tracking card.
5. **1:25** "I want to talk to a person" → leaves e-mail → ticket number shown.
6. **1:40** App → Tickets: the new ticket with transcript, set to Pending, add a note.
7. **2:00** App → Assistant: "What needs my attention today?" → teach an answer → **Confirm** → ask it on the storefront.
8. **2:35** App → Settings (colour, greeting, ticket e-mail) → Overview plan card → "Upgrade / change plan".
9. **2:55** End on Overview.

### B4. 👤 Fresh dev store test (before pressing Submit)

- Install on a **new** development store (not dropkingdev) → app opens, no error page.
- Chrome **incognito** → open the app → it loads (session tokens only).
- Theme Editor → enable the embed → storefront chat appears; no console errors.
- Uninstall → reinstall → app opens again (OAuth first).
- Change plan Free → Growth → Free via the plan page.

### B5. 👤 Partner Dashboard checklist

- [ ] App icon 1200×1200 uploaded (official icon: `server/shopify-agent/podai-icon.png` source; listing doc §5).
- [ ] Listing text from `docs/Pod.AI-App-Store-Listing.md` (EN + DE/FR/IT), features incl. the two Assistant lines.
- [ ] Screenshots from `apps/shopify-agent/listing/` (+ optional storefront shots from the dev store).
- [ ] Pricing: Free / Growth / Pro configured in Managed Pricing; 14-day trial on paid plans.
- [ ] Privacy policy `https://podai.swisspro.site/privacy`, support `https://podai.swisspro.site/support`, support e-mail `support@swisspro.site` (mailbox must exist).
- [ ] Protected customer data request submitted.
- [ ] Emergency developer contact set.
- [ ] "Merchant must have online store" ticked.
- [ ] Demo screencast uploaded; testing instructions pasted (B2).
