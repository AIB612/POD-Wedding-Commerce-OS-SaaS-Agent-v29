# Pod.AI Chat for WooCommerce – tests

Backend unit/integration tests live in `server/woo-agent/test/woo.test.js` and run with `node scripts/test-all.mjs`.

The files here run against a **local** WordPress + WooCommerce test store (never a real shop):

1. Start the backend locally: `NODE_ENV=development WOO_ALLOW_HTTP=true TEST_EMAIL_ALLOWLIST=<your test inbox> STORE_PERSIST_PATH=/tmp/podai/state.json node server/app.js` (port 3999 with `PORT=3999`).
2. Install WordPress + WooCommerce, symlink `apps/woocommerce-plugin/pod-ai-chat-for-woocommerce` into `wp-content/plugins/`, activate it, then `wp eval-file seed.php` (products, shipping zones, coupon `welcome10`, orders 27/28).
3. In *Pod.AI Chat → Settings* set the service URL to `http://127.0.0.1:3999` and click **Connect to Pod.AI**.
   Test-store settings the e2e expects (Settings page, or `wp eval`): FAQ `Do you offer gift wrapping?` → `Yes, gift wrapping is free – just add a note at checkout.`, shipping page = the seeded "Shipping" page, contact page = "Contact", public coupon `WELCOME10` ("10% off your first order").
   All test chats come from one IP: raise the per-visitor limit (20 / min) **in the test store only** with an mu-plugin: `add_filter( 'podai_chat_rate_limit', fn () => 500 );`
   `ORDER` = id of the seeded `buyer@example.com` order (printed by `seed.php`, e.g. 26).
4. `WP_URL=http://127.0.0.1:8088 node e2e-local.mjs` – chat via the WP REST proxy (5 languages, recommendations, order lookup, coupon, ticket).
5. `WP_URL=… WP_ADMIN_USER=… WP_ADMIN_PASS=… CHROME=/usr/bin/google-chrome node browser-e2e.mjs` – real browser: widget, add to cart (Store API), coupon, tracking, Chinese, ticket, admin ticket management, screenshots into `SHOTS_DIR`.

Assistant (plugin 1.2.0): open *Pod.AI Chat → Assistant* as an admin — the page asks "What needs my attention today?" on load; teach an answer (`answer "…" with "…"`), click **Confirm**, then ask the storefront chat the same question. Requests to `admin-ajax.php?action=podai_chat_assistant` without the page nonce must return 403.

Static checks: `php -l` on every file and `wp plugin check pod-ai-chat-for-woocommerce --include-experimental --include-low-severity-errors --include-low-severity-warnings` (Plugin Check 2.2.0: no errors, no warnings in 1.2.0).

Last full run (2026-11-20, plugin 1.2.0): WordPress 7.1.5 + WooCommerce 11.3.1 on SQLite — `e2e-local.mjs` 22/22, `browser-e2e.mjs` 11/11, Assistant page end-to-end (connect → ticket → briefing → teach → Confirm → chat answers → survives settings save; no-nonce → 403). Also WordPress 6.8.3 + WooCommerce 10.3.4.

AI agents: `MCP_SDK_DIR=<path to @modelcontextprotocol/sdk> WP_URL=… CHROME=… node mcp-agent-e2e.mjs` – official MCP client: discovery, initialize, tools/list, search, get_product, create_checkout_link, then opens the link in a browser and checks the prefilled cart + coupon.

Build the release zip: `node scripts/build-woo-plugin.mjs` → `apps/woocommerce-plugin/dist/pod-ai-chat-for-woocommerce.zip` (served at https://podai.swisspro.site/woocommerce/pod-ai-chat-for-woocommerce.zip). WordPress.org assets (banners, icons, screenshots): `apps/woocommerce-plugin/wordpress-org-assets/`.
