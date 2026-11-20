# WordPress.org assets for "Pod.AI Chat for WooCommerce"

These files go into the plugin's SVN `assets/` folder (NOT into trunk / the zip):

| File | Use |
|---|---|
| banner-772x250.png, banner-1544x500.png | Plugin page header |
| icon-128x128.png, icon-256x256.png | Plugin icon |
| screenshot-1.png … screenshot-9.png | Matches `== Screenshots ==` 1–9 in readme.txt (9 = Assistant) |

Regenerate the plugin zip with `node scripts/build-woo-plugin.mjs` (→ apps/woocommerce-plugin/dist/).
