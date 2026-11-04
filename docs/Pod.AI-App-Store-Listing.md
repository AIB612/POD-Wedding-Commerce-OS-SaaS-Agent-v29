# Pod.AI — Shopify App Store listing kit (draft)

Status: draft, prepared on 4 Nov 2026 for review by Sherry. Nothing has been submitted to Shopify and no billing is configured.
Scope: Pod.AI (the `apps/shopify-agent` app with server `server/shopify-agent`) only. The site and the site POD Agent are unchanged.
Everything below describes features that are implemented and deployed today (Shopify app version pod-ai-8 plus the server at commit 9496d8f and later). There are no invented metrics, ratings or reviews.

---

## 1. Listing copy

Character limits used: app name ≤ 30, subtitle/tagline ≤ 62, introduction ≤ 100, details ≤ 500, feature bullets ≤ 80. Counts are in brackets.

### English (primary)

**App name:** Pod.AI — AI Customer Chat  [25]

**Tagline (subtitle):** AI chat that answers product, shipping and order questions  [58]

**Introduction:** Answer shoppers 24/7 from your own products, policies and orders — in their language.  [85]

**Detailed description (App details):**
> Pod.AI adds an AI chat to your store that answers from your real shop data. Shoppers ask "where is my order?", "do you ship to Switzerland?" or "show me your products" and get an instant answer with order and tracking cards or product cards with add-to-cart. Replies follow the shopper's language. Questions the AI can't answer go to your team with the shopper's e-mail. It works without an AI key; an LLM can be added for open questions.  [438]

**Key benefits (3–5):**
1. Fewer "Where is my order?" tickets: customers check status and tracking themselves (order number + e-mail).
2. Answers grounded in your store: products, shipping rates, policies and discount codes come straight from Shopify, not from a generic model.
3. Speaks your customers' language: English, German, French, Italian and Chinese built in; other languages via an optional LLM.
4. Nothing slips through: unanswerable questions become a handoff queue with the reply e-mail, and the AI keeps helping meanwhile.
5. See the impact: dashboard with conversations, AI resolution rate, hours saved, self-served order lookups, chat-influenced revenue and first-response time.

**Feature list (≤ 80 chars each):**
- Order status and live parcel tracking card (carrier APIs, 51Tracking, link)  [76]
- Product cards with image, price, View and Add to cart  [53]
- Shipping cost and delivery answers from your Shopify shipping zones  [67]
- Policy answers (shipping, refunds, privacy) from Settings → Policies  [69]
- Discount code check  [19]
- Replies in the shopper's language: EN, DE, FR, IT, ZH (+ more with LLM)  [70]
- Human handoff queue with reply e-mail; "Back to AI" button  [56]
- Custom knowledge: add your own Q&A; turn unanswered questions into answers  [74]
- Dashboard: resolution rate, hours saved, WISMO, revenue, busiest hours  [70]
- Theme app embed: brand colour, position, title, greeting, avatar  [63]
- Admin in English, German, French and Italian  [43]
- Works without an AI key; optional LLM answers you can switch off  [64]
- GDPR webhooks, signed storefront requests, payment-data filter  [61]

**Screenshot captions** (files listed in §5):
1. Dashboard: "See what your chat resolves: conversations, AI resolution rate, hours saved, revenue"
2. Storefront products: "Shoppers browse your products in chat and add to cart in one tap"
3. Handoffs: "Questions the AI can't answer land in your team queue with the reply e-mail"
4. Settings: "Match your brand: colour, position, greeting in EN / DE / FR / IT, LLM on/off"
5. Order tracking: "Where is my order? Status and live tracking without a support ticket"
6. Multilingual: "Answers in your customer's language: here, German"

**Search terms (max 5 on the listing; extras for SEO copy):**
- Primary: AI chatbot, live chat, order tracking, customer support, FAQ chatbot
- Extras: WISMO, where is my order, multilingual chat, AI customer service, helpdesk, shipping questions, Swiss store chat

**Category suggestion:** Customer support → Chat (secondary: Order tracking)

**Support info (placeholders — open decision):**
- Support e-mail: `support@<pod.ai domain>` — **placeholder, to be created** (no personal address).
- Support URL / FAQ: `https://<pod.ai domain>/support` — placeholder.
- Privacy policy: https://wed.swisspro.site/shopify-agent/privacy (live).
- Response time promise: e.g. "within 1 business day" — confirm.
- Developer name on the listing: "POD.AI".

### German (Deutsch)
- Tagline: KI-Chat für Produkt-, Versand- und Bestellfragen [48]
- Introduction: Beantwortet Kundenfragen rund um die Uhr – aus Ihren Produkten, Richtlinien und Bestellungen. [93]
- Benefits:
  - Weniger „Wo ist meine Bestellung?“-Anfragen.
  - Antworten aus Ihren echten Shopdaten.
  - Antworten in der Sprache Ihrer Kunden.
  - Übergabe an Ihr Team mit E-Mail.
  - Dashboard mit Lösungsquote, gesparten Stunden und Umsatz durch den Chat.

### French (Français)
- Tagline: Chat IA pour les questions produits, livraison et commandes [59]
- Introduction: Répond à vos clients 24h/24 à partir de vos produits, politiques et commandes. [79]
- Benefits:
  - Moins de demandes « Où est ma commande ? ».
  - Réponses issues de vos vraies données.
  - Répond dans la langue du client.
  - Transfert à votre équipe avec l'e-mail.
  - Tableau de bord : taux de résolution, heures économisées, revenus.

### Italian (Italiano)
- Tagline: Chat IA per domande su prodotti, spedizioni e ordini [52]
- Introduction: Risponde ai clienti 24/7 usando i tuoi prodotti, le informative e gli ordini. [77]
- Benefits:
  - Meno richieste «Dov'è il mio ordine?».
  - Risposte dai dati reali del negozio.
  - Risponde nella lingua del cliente.
  - Passaggio al team con l'e-mail.
  - Dashboard con tasso di risoluzione, ore risparmiate e fatturato.

---

## 2. Privacy policy

- **Public URL (live):** https://wed.swisspro.site/shopify-agent/privacy (also `/shopify-agent/privacy.html`).
- **Source:** `server/shopify-agent/privacy.html`. POD.AI brand, footer "© 2026 POD.AI".
- **Contents:**
  - Shopify scopes and why each is used.
  - Customer data collected in the chat.
  - Storage in the `podai_*` collections.
  - Third parties: Shopify, carrier APIs, 51Tracking, and the optional LLM.
  - Retention.
  - GDPR webhooks.
  - Security.
  - Contact.
- **Implementation checked against the code:**
  - The `customers/data_request`, `customers/redact` and `shop/redact` webhooks are all implemented in `gdpr.js` and registered in `shopify.app.toml`. Webhooks are HMAC-verified. Tests are in `test/app.test.js`.
  - **New in this change:** `customers/redact` also deletes the handoffs and storefront events linked to the deleted chats.
  - **New in this change:** automatic retention purge (`gdpr.purgeExpired`, runs daily, only touches Pod.AI shop tenants):
    - Conversations and handoffs: 12 months after the last activity.
    - Storefront events: 13 months.
    - GDPR log: 3 years.
    - Test: `test/privacy.test.js`.
- **To confirm:**
  - Server location: Frankfurt, Germany (rs8-fra host).
  - Legal entity name and address for "POD.AI" (not published; add it if your lawyer requires it).
  - Support contact.

---

## 3. Pricing proposal (DRAFT — do not configure)

### Competitor reference
Public prices, checked on 4 Nov 2026 via tidio.com, the Shopify App Store, willdesk.com and the comparison article at tycoonagent.ai. Prices change, so re-check before launch.
- **Shopify Inbox:** free, with no AI answers.
- **Tidio Lyro:** $39/mo for up to 200 AI conversations on the App Store listing. The pricing page shows $0.58–0.65 per AI conversation.
- **Gorgias:** helpdesk from $10/mo, plus AI Agent at about $0.90–1.00 per automated interaction.
- **Willdesk:**
  - Free: 20 conversations.
  - Paid: $10–12 per 100 extra conversations.
  - Order-tracking quotas are included.

### Pod.AI cost drivers
- **Rule engine with shop data:** costs us almost nothing per chat.
- **LLM answers:** cost tokens.
- **51Tracking:** a paid API, billed per tracked number.

So conversations, and optionally tracking lookups, are the fair unit.

### Option A — simple flat tiers (recommended for launch)

| Plan | Price | Conversations / mo | Included |
|---|---|---|---|
| Free | $0 | 50 | All rule-based answers, order lookup with tracking link, products, policies, handoff queue, dashboard |
| Growth | $19/mo | 500 | + live parcel tracking events, custom knowledge, branding options |
| Pro | $49/mo | 2,500 | + LLM answers for open questions, priority support |

- Overage: $1.50 per extra 100 conversations, with a capped usage charge.
- 14-day free trial on the paid plans.

**Rationale:**
- Undercuts Tidio Lyro ($39 for 200) and Gorgias (about $1 per AI interaction), because most Pod.AI answers come from rules with no LLM cost.
- A clear free tier is needed to compete with Shopify Inbox.

### Option B — usage-based

- **Base price:** $9/mo, including 300 conversations.
- **Usage:**
  - $0.03 per extra conversation.
  - $0.10 per LLM-answered conversation.
  - $0.02 per live tracking lookup.
- **Rationale:** cost tracks our real costs closely. The downside is that it is harder for merchants to predict.

### Option C — outcome-based (later)

- **Price:** $0.25 per AI-resolved conversation (no handoff), with a $0 minimum and a $99 cap.
- **Rationale:** it matches the dashboard's "AI resolution rate" metric and is an attractive story. It needs stable resolution measurement first.

### Open decisions for pricing
- Which option to use.
- USD or CHF on the listing (Shopify bills in USD).
- Annual discount (17% is the market norm).
- Whether LLM answers are offered on Growth at all.

---

## 4. Protected customer data questionnaire — suggested answers (DRAFT, not submitted)
These are under Partner Dashboard → App → API access → Protected customer data access.

**Step 1 — Data used**

| Data | Request? | Reason (based on the code) |
|---|---|---|
| Protected customer data (orders) | Yes | Order status / tracking answers in the chat (`find_order` in `profile.js`) |
| Name | Yes (read via order only) | Personalising the order reply is not done today, so mark **No** unless a greeting by name is added. Recommended: **No** |
| Email | Yes | Verifies the shopper owns the order (order number + email must match); the reply address for handoffs |
| Phone | No | Not read |
| Address | No | Not read (the order's country/city may appear in tracking events from the carrier, not from Shopify customer fields) |

Purpose to select: **Customer service**. Secondary purpose: **Analytics**, for chat-influenced revenue via the orders' UTM journey only, aggregated with no customer fields. Select it only if that metric stays.

**Step 2 — Data protection details (suggested answers)**

1. **Process the minimum personal data required?** Yes.
   - Orders are fetched live per question and not copied.
   - Only the email the shopper types is stored, in the conversation or handoff.
2. **Tell merchants what data you process and why?** Yes. Privacy policy at https://wed.swisspro.site/shopify-agent/privacy, plus the listing text.
3. **Limit use to the stated purposes?** Yes. No ads, no selling, no cross-store use.
4. **Data processing agreements with merchants?** Yes, via the privacy policy and the app terms. A DPA template is an open item; draft one before applying for Level 2.
5. **Respect consent decisions?** Yes. No marketing; the storefront chat sets no tracking cookies (sessionStorage chat ID only).
6. **Respect opt-out of data sale?** Not applicable; no data is sold.
7. **Automated decision-making with legal effects?** No.
8. **Retention periods?** Yes. Conversations and handoffs: 12 months. Events: 13 months. GDPR log: 3 years. Shop data is deleted on `shop/redact`. Enforced daily by `purgeExpired`.
9. **Encrypt data at rest and in transit?** Partly:
   - **In transit:** yes, HTTPS everywhere.
   - **At rest:** the access token is encrypted with `APP_ENCRYPTION_KEY`. Chat records sit in the app's JSON/DB store on an encrypted server volume — **confirm that the volume is encrypted with the host. If it isn't, answer "No" for the chats or add field encryption.**
10. **Encrypt backups?** Confirm with the host.
11. **Separate test and production data?** Yes. Tests use temporary stores; Shopify tests run only on the dropkingdev dev store.
12. **Data loss prevention strategy?** Partly. The payment-data filter drops card numbers, and the prompt-injection filter is in place.
13. **Limit staff access?** Yes. Only the server admin (SSH key) has access.
14. **Strong passwords for staff?** Yes. SSH keys, plus a password manager.
15. **Log access to personal data?** Partly: GDPR requests are logged in `podai_gdpr`. Answer "No" for general access logs unless server access logs are kept.
16. **Security incident response policy?** To write before submission. Open item.

Level 1 (email, no name/address) is enough for Pod.AI today.

---

## 5. Listing screenshots (1600×900)
These were rendered headlessly with the Pod.AI admin and widget code over mock data.
- The live dropkingdev admin needs a Shopify login.
- The live storefront is password-protected, so it couldn't be captured headlessly.

Files in `/workspace/wedai/report/podai-listing/`:
1. `1-dashboard.png`
2. `2-storefront-products.png`
3. `3-handoffs.png`
4. `4-settings.png`
5. `5-storefront-order-tracking.png`
6. `6-storefront-multilingual-de.png`

**Recommended for the final submission:**
- Re-capture 2, 5 and 6 on dropkingdev with the real theme and real product images, once the store password is removed or from a logged-in browser. The mock storefront uses grey placeholder tiles.
- Use real dashboard numbers once real chats exist. Shopify does not allow fake data that suggests real results; the current dashboard shot shows the "Example data" note.
- Feature media 1600×900. Optional: a 30–60 s demo video.
- App icon 1200×1200 (not yet designed).

---

## 6. Open decisions
1. Support e-mail and support URL (generic POD.AI addresses still need to be created).
2. Legal entity and address shown in the privacy policy and the Partner profile.
3. Pricing option (A/B/C), currency and annual discount; billing stays off until decided.
4. Protected data: confirm disk and backup encryption on the rs8 host. Write the incident-response policy and a DPA.
5. Whether to keep the "chat-influenced revenue" metric. It needs the Analytics purpose in the questionnaire.
6. Real screenshots on dropkingdev (store password, product images) and the app icon.
7. 51Tracking: the paid plan or the free API application decides whether "live tracking events" is promised on the listing. Without it, carriers YunExpress/4PX plus a tracking link.
8. App name on the listing: "Pod.AI — AI Customer Chat", or plain "Pod.AI".
