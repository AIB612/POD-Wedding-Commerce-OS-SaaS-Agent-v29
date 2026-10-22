// Ordered, append-only migrations. Portable between SQLite and MySQL/MariaDB
// (VARCHAR keys so MySQL can index them; TEXT for payloads). Never edit an applied migration — add a new one.
export const MIGRATIONS = [
  {
    id: "001_shopify_core",
    sql: [
      `CREATE TABLE IF NOT EXISTS shopify_shops (shop VARCHAR(255) PRIMARY KEY, tenant_id VARCHAR(64), access_token_enc TEXT, scopes TEXT, installed_at VARCHAR(40), uninstalled_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS oauth_states (nonce VARCHAR(128) PRIMARY KEY, shop VARCHAR(255) NOT NULL, tenant_id VARCHAR(64), expires_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS product_links (shop VARCHAR(255) NOT NULL, local_product_id VARCHAR(128) NOT NULL, shopify_product_id VARCHAR(255), variant_ids TEXT, pushed_at VARCHAR(40), PRIMARY KEY (shop, local_product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS order_links (shop VARCHAR(255) NOT NULL, shopify_order_id VARCHAR(255) NOT NULL, local_order_id VARCHAR(128), status VARCHAR(64), fulfillment_id VARCHAR(255), created_at VARCHAR(40), updated_at VARCHAR(40), PRIMARY KEY (shop, shopify_order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS webhook_log (id VARCHAR(255) PRIMARY KEY, topic VARCHAR(128), shop VARCHAR(255), received_at VARCHAR(40), status VARCHAR(64), note TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ]
  },
  {
    id: "002_shopify_expiring_tokens",
    sql: [
      `ALTER TABLE shopify_shops ADD COLUMN refresh_token_enc TEXT`,
      `ALTER TABLE shopify_shops ADD COLUMN token_expires_at BIGINT`,
      `ALTER TABLE shopify_shops ADD COLUMN refresh_expires_at BIGINT`,
      `ALTER TABLE shopify_shops ADD COLUMN webhooks_registered_at VARCHAR(40)`
    ]
  },
  {
    id: "003_shopify_currency_webhook_report",
    sql: [
      `ALTER TABLE shopify_shops ADD COLUMN currency_code VARCHAR(8)`,
      `ALTER TABLE shopify_shops ADD COLUMN webhook_report TEXT`
    ]
  }
];
