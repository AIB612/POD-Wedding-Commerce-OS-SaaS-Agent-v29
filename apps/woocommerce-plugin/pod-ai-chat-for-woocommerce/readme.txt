=== Pod.AI Chat for WooCommerce ===
Contributors: dropkingai
Tags: ai chat, ai agent, customer service, product recommendations, order tracking
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI shopping assistant that answers from your own store data, recommends in-stock products, adds them to the cart, tracks orders and creates tickets.

== Description ==

Pod.AI Chat is a client for the Pod.AI hosted service (https://podai.swisspro.site). It adds a shopping assistant to your WooCommerce storefront. Answers come from your store's own catalogue (products, policies, shipping) through Pod.AI. You do not need a third-party LLM API key. An optional LLM can be used only if you add your own key in your Pod.AI account.


* **Products** – finds and recommends in-stock products with real prices (budget, recipient, colour; "cheaper", "more like this").
* **Act, not just answer** – adds a recommended product to the shopper's cart (WooCommerce Store API), links to checkout and applies your public coupon. It never takes payment.
* **Orders** – order status and tracking link with the order number and billing e-mail (WooCommerce Shipment Tracking, Advanced Shipment Tracking, YITH and generic tracking meta).
* **Policies and shipping** – refund/returns, terms, privacy, your shipping page, shipping zones and costs, your own FAQ.
* **Contact us → tickets** – the shopper leaves an e-mail, a ticket POD-T-… is created and the chat transcript is e-mailed to your ticket address. Manage tickets (status, notes) under Pod.AI Chat → Tickets.
* **AI agent access (MCP)** – AI assistants such as ChatGPT, Claude, Grok or Gemini can search your in-stock products and create a prefilled checkout link through your store's own MCP server and REST API (hosted by Pod.AI, read-only). The shopper always reviews the cart and pays in your WooCommerce checkout. On by default; one checkbox turns it off.
* **Assistant for your team** – Pod.AI Chat → Assistant: ask "What needs my attention today?", see KPIs, unanswered questions, open tickets with a reply draft, and teach new answers. Changes (knowledge answers, ticket status and notes, chat on/off) are only prepared and run after you click Confirm; your orders, products and customers are never changed.
* **Languages** – the chat answers in English, German, French, Italian and Chinese; admin translated into the same languages.
* **Plans** – Free (50 chats / month), Growth (500 chats, USD 19 / month) and Pro (2,500 chats, USD 49 / month); yearly billing saves 20 %. Paid plans start with a 14-day free trial and are billed by Paddle, our merchant of record.

= External services =

This plugin is a client for the Pod.AI hosted service (https://podai.swisspro.site). It does not send any data until an administrator clicks "Connect to Pod.AI" and explicitly connects the store. There is no analytics, telemetry or Google Analytics in wp-admin. Widget usage events are not sent.

After you connect, the following is sent to Pod.AI, and only then:

* On connect: your site URL, REST URL, store name, admin e-mail, currency, locale and WordPress / WooCommerce / plugin versions.
* Product sync (when you connect, when you save a product, and once a day): title, short description, prices, currency, image URL, product URL, in-stock status, type, purchasable and on-sale flags, categories, tags, and visible variations (title, price, in-stock status). SKUs and exact stock quantities are not sent unless you tick the optional, off-by-default checkbox "Also send SKUs and exact stock quantities" on the connect screen or under Settings.
* Store settings you configure: policy page titles and text, shipping zones and costs, the ticket e-mail, widget settings, your FAQ and the public coupon you configure.
* Chat messages typed by shoppers, and the e-mail a shopper leaves for a ticket.
* AI agent access (if on): Pod.AI answers AI assistants' product searches from the synced catalogue data and returns links to your store. No order or customer data is used.
* Billing (only when you upgrade): your plan choice and the admin e-mail are sent to Pod.AI and Paddle (https://www.paddle.com, merchant of record) to create the checkout. Paddle terms: https://www.paddle.com/legal/checkout-buyer-terms · Paddle privacy: https://www.paddle.com/legal/privacy
* Assistant (admin only): the questions you type under Pod.AI Chat → Assistant, your WordPress username (for the activity log) and the changes you confirm. Once a week Pod.AI e-mails a summary (chat counts, unanswered questions, ticket numbers — no shopper e-mail addresses) to your ticket e-mail, or the store / admin e-mail when that is empty; you can turn it off. Pod.AI keeps the activity log without chat text or e-mail addresses.
* Order data is never synced. When a shopper gives an order number and billing e-mail, the service asks your site (signed request) and receives only status, items, total and tracking.

All requests are signed with a per-site secret. Disconnecting or uninstalling deletes your store's data at Pod.AI.

Terms of service: https://podai.swisspro.site/terms
Privacy policy: https://podai.swisspro.site/privacy

== Installation ==

1. Upload the plugin and activate it (WooCommerce must be active).
2. Go to **Pod.AI Chat → Settings** and click **Connect to Pod.AI**.
3. Set the ticket e-mail, colour and position, pick your shipping and contact pages, add FAQ entries and save.
4. Open your shop — the chat button appears bottom right (or left).

== Frequently Asked Questions ==

= Does it use ChatGPT or another AI API? =
The plugin is a client for the Pod.AI hosted service. Answers come from your store's own catalogue via Pod.AI. No third-party LLM API key is required. You can optionally add your own LLM key in your Pod.AI account.

= Can the assistant place orders or take payments? =
No. It can add items to the shopper's cart and apply a public coupon; the shopper checks out as usual.

= What is "AI agent access"? =
External AI assistants can find your products and send shoppers a prefilled cart link (`https://your-store/?podai_cart=…`). They see only in-stock products with current prices — never orders or customers — and cannot pay. Your store publishes the details at `/.well-known/pod-ai-agent.json`. Turn it off under Pod.AI Chat → Settings → AI agents.

== Screenshots ==

1. The chat recommends in-stock products with real prices.
2. One click adds a product to the cart.
3. The store's public coupon is applied to the cart.
4. Order status and tracking with order number + e-mail.
5. Answers in the shopper's language (here Chinese).
6. "Contact us" turns into a ticket for your team.
7. Settings: connection, chat, widget, knowledge, AI agents and plan.
8. Tickets in the WordPress admin: status, notes, transcript.
9. Assistant for your team: briefing, tickets with reply drafts, teach answers — every change waits for your Confirm.

== Changelog ==

= 1.2.2 =
* Review fixes: accurate service description, SKUs and exact stock quantities opt-in (off by default), no widget analytics, settings sanitization separated from connection credentials, admin CSS/JS enqueued, bundled translation files removed (translations via translate.wordpress.org).

= 1.2.1 =
* Text domain and plugin folder renamed to pod-ai-chat-for-woocommerce (the WordPress.org slug). Settings, connection and tickets are kept. If an older copy in the folder pod-ai-chat is active, it is switched off automatically when you activate this version.

= 1.2.0 =
* New: Pod.AI Chat → Assistant – team assistant (briefing, KPIs, unanswered questions, tickets with reply drafts, knowledge, chat search) in English, German, French, Italian and Chinese. Every change waits for your Confirm and is listed under Recent activity.
* New: "Draft answers" – the Assistant drafts answers for questions the chat could not answer, using only your own policies (with the source shown); you confirm, edit or reject each one.
* New: weekly summary e-mail to your ticket e-mail (chats, unanswered questions, waiting tickets). Tell the Assistant "stop the weekly e-mail" to turn it off.
* Answers taught in the Assistant are kept when you save Settings (an FAQ entry with the same question replaces them).

= 1.1.0 =
* AI agent access: MCP server + REST API per store (search products, product details, prefilled checkout link), discovery at /.well-known/pod-ai-agent.json, prefilled cart links (?podai_cart=).
* Plans with Paddle checkout (14-day free trial, yearly −20 %), customer portal; subscription cancelled when the store is disconnected.

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 1.2.2 =
SKUs and exact stock quantities are no longer sent unless you opt in under Pod.AI Chat → Settings. Widget analytics events are no longer sent.

= 1.2.1 =
New folder pod-ai-chat-for-woocommerce; settings are kept. Coming from a zip install (folder pod-ai-chat)? Activate 1.2.1, then remove the old folder by FTP, not with Delete in WordPress (that disconnects the store).

= 1.2.0 =
Adds the Assistant page for your team. No action needed.

= 1.1.0 =
Adds AI agent access (MCP) and paid plans. No action needed.
