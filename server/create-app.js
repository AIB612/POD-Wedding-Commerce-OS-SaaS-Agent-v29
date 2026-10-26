// Builds the Express application (no listening) so it can be started by app.js or used in tests.
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tenantContext, userContext } from "./auth.js";
import { accountRouter } from "./routes/account.js";
import { securityHeaders, errorHandler, notFound } from "./http/middleware.js";
import webhooks from "./routes/webhooks.js";
import shopifyApp from "./routes/shopify-app.js";
import { getDb } from "./db/index.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { logisticsRouter } from "./routes/logistics.js";
import carrierRates from "./routes/carrier-rates.js";
import { studioRouter } from "./routes/studio.js";
import { sellerRouter } from "./routes/seller.js";
import { podAgentRouter } from "./pod-agent/routes.js";
import { initPriceList } from "./services/price-list-service.js";
import { initFees } from "./services/fees-service.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createApp({ root = projectRoot, generatedDir = path.join(projectRoot, "generated") } = {}) {
  await fs.mkdir(generatedDir, { recursive: true });
  await initFees(); // admin fees & tax (seeded from the previous zone values, packaging 0)
  await initPriceList(); // admin price list (seeded from the retail formula on first start)
  await getDb(); // Shopify tables: opens MySQL (DATABASE_URL) / SQLite (SQLITE_PATH) / memory and runs migrations
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "true" ? true : process.env.TRUST_PROXY);

  const origins = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  app.use(cors(origins.length ? { origin: origins } : undefined));
  app.use(securityHeaders);
  app.use(compression());

  // Webhooks MUST see raw bytes before express.json().
  app.use(webhooks);
  app.use(shopifyApp); // Shopify app OAuth + webhooks (raw body); admin JSON routes parse their own body

  // 1 MB default JSON limit; /api/invitations sets its own larger limit (photos are embedded as data URLs).
  const json = express.json({ limit: "1mb" });
  // Larger bodies only where images are uploaded (invitation sites, studio designs).
  app.use((req, res, next) => (req.path === "/api/invitations" || req.path === "/api/studio/projects" || req.path === "/api/seller/media" ? next() : json(req, res, next)));
  app.use(tenantContext);
  app.use(userContext);

  app.use(accountRouter());
  app.use(publicRouter({ root, generatedDir }));
  app.use(studioRouter({ generatedDir }));
  app.use(sellerRouter({ generatedDir }));
  app.use("/api/pod-agent", podAgentRouter());
  app.use("/pod-agent", express.static(new URL("./pod-agent", import.meta.url).pathname));
  app.use(carrierRates);
  app.use(logisticsRouter());
  app.use(adminRouter({ root }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
