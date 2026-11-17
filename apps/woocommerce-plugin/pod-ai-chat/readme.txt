=== Pod.AI Chat for WooCommerce ===
Contributors: podai
Tags: ai chat, ai agent, customer service, product recommendations, order tracking
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI shopping assistant that answers from your own store data, recommends in-stock products, adds them to the cart, tracks orders and creates tickets.

== Description ==

Pod.AI Chat adds a shopping assistant to your WooCommerce storefront. It answers from your store's own data — no external AI service is needed:

* **Products** – finds and recommends in-stock products with real prices (budget, recipient, colour; "cheaper", "more like this").
* **Act, not just answer** – adds a recommended product to the shopper's cart (WooCommerce Store API), links to checkout and applies your public coupon. It never takes payment.
* **Orders** – order status and tracking link with the order number and billing e-mail (WooCommerce Shipment Tracking, Advanced Shipment Tracking, YITH and generic tracking meta).
* **Policies and shipping** – refund/returns, terms, privacy, your shipping page, shipping zones and costs, your own FAQ.
* **Contact us → tickets** – the shopper leaves an e-mail, a ticket POD-T-… is created and the chat transcript is e-mailed to your ticket address. Manage tickets (status, notes) under Pod.AI Chat → Tickets.
* **AI agent access (MCP)** – AI assistants such as ChatGPT, Claude, Grok or Gemini can search your in-stock products and create a prefilled checkout link through your store's own MCP server and REST API (hosted by Pod.AI, read-only). The shopper always reviews the cart and pays in your WooCommerce checkout. On by default; one checkbox turns it off.
* **Languages** – the chat answers in English, German, French, Italian and Chinese; admin translated into the same languages.
* **Plans** – Free (50 chats / month), Growth (500 chats, USD 19 / month) and Pro (2,500 chats, USD 49 / month); yearly billing saves 20 %. Paid plans start with a 14-day free trial and are billed by Paddle, our merchant of record.

= External service =

This plugin connects to the Pod.AI service (https://podai.swisspro.site) to answer chats. What is sent and when:

* On connect: your site URL, REST URL, store name, admin e-mail, currency, locale and WordPress / WooCommerce versions.
* Product sync (on product save and daily): public product data — title, price, currency, image URL, stock status, product URL, categories, tags, short description, variations.
* Store settings: names and text of your policy pages, shipping zones and costs, the ticket e-mail, widget settings, your FAQ and the public coupon you configure.
* Chat messages typed by shoppers, and the e-mail a shopper leaves for a ticket.
* AI agent access (if on): Pod.AI answers AI assistants' product searches from the synced public product data and returns links to your store. No order or customer data is used.
* Billing (only when you upgrade): your plan choice and the admin e-mail are sent to Pod.AI and Paddle (https://www.paddle.com, merchant of record) to create the checkout. Paddle terms: https://www.paddle.com/legal/checkout-buyer-terms · Paddle privacy: https://www.paddle.com/legal/privacy
* Order data is never synced. When a shopper gives an order number and e-mail, the service asks your site (signed request) and receives only status, items, total and tracking.

All requests are signed with a per-site secret. Disconnecting or uninstalling deletes your store's data at Pod.AI.
Terms: https://podai.swisspro.site/terms · Privacy: https://podai.swisspro.site/privacy

== Installation ==

1. Upload the plugin and activate it (WooCommerce must be active).
2. Go to **Pod.AI Chat → Settings** and click **Connect to Pod.AI**.
3. Set the ticket e-mail, colour and position, pick your shipping and contact pages, add FAQ entries and save.
4. Open your shop — the chat button appears bottom right (or left).

== Frequently Asked Questions ==

= Does it use ChatGPT or another AI API? =
No. Answers come from your own store data with Pod.AI's local search and recommendation engine.

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

== Changelog ==

= 1.1.0 =
* AI agent access: MCP server + REST API per store (search products, product details, prefilled checkout link), discovery at /.well-known/pod-ai-agent.json, prefilled cart links (?podai_cart=).
* Plans with Paddle checkout (14-day free trial, yearly −20 %), customer portal; subscription cancelled when the store is disconnected.

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 1.1.0 =
Adds AI agent access (MCP) and paid plans. No action needed.
