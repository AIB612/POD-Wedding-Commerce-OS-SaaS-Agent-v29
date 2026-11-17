=== Pod.AI Chat for WooCommerce ===
Contributors: podai
Tags: chat, ai assistant, customer service, product recommendations, order tracking
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
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
* **Languages** – the chat answers in English, German, French, Italian and Chinese; admin translated into the same languages.

= External service =

This plugin connects to the Pod.AI service (https://podai.swisspro.site) to answer chats. What is sent and when:

* On connect: your site URL, REST URL, store name, admin e-mail, currency, locale and WordPress / WooCommerce versions.
* Product sync (on product save and daily): public product data — title, price, currency, image URL, stock status, product URL, categories, tags, short description, variations.
* Store settings: names and text of your policy pages, shipping zones and costs, the ticket e-mail, widget settings, your FAQ and the public coupon you configure.
* Chat messages typed by shoppers, and the e-mail a shopper leaves for a ticket.
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

== Changelog ==

= 1.0.0 =
* First release.
