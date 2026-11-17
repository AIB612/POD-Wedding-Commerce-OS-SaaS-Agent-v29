// Builds the Express application (no listening) so it can be started by app.js or used in tests.
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tenantContext, userContext } from "./auth.js";
import { accountRouter } from "./routes/account.js";
import { securityHeaders, errorHandler, notFound, cspReport, rateLimit } from "./http/middleware.js";
import webhooks from "./routes/webhooks.js";
import shopifyApp from "./routes/shopify-app.js";
import { shopifyAgentRouter } from "./shopify-agent/routes.js";
import { wooAgentRouter } from "./woo-agent/routes.js";
import { agentApiRouter } from "./agent-api/routes.js";
import { billingRouter } from "./billing/routes.js";
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
  const corsMw = cors(origins.length ? { origin: origins } : undefined);
  // the public agent API sets its own open CORS (no credentials) — see server/agent-api/routes.js
  app.use((req, res, next) => (req.path.startsWith("/agent/v1") || req.path === "/.well-known/pod-ai-agent.json" ? next() : corsMw(req, res, next)));
  app.use(securityHeaders);
  app.use(compression());

  // Webhooks MUST see raw bytes before express.json().
  app.use(webhooks);
  app.use(shopifyAgentRouter()); // Shopify Chat Agent app: App Proxy chat, embedded admin, GDPR webhooks (own body parsing)
  app.use(wooAgentRouter()); // Pod.AI for WooCommerce: signed plugin API /woo-agent/v1/* (own body parsing)
  app.use(billingRouter()); // Paddle checkout page + signed webhook (WooCommerce plans; off until PADDLE_* is set)
  app.use(agentApiRouter()); // public agent API for external AI agents: /agent/v1/* (REST + MCP), /.well-known/pod-ai-agent.json
  app.use(shopifyApp); // Shopify app OAuth + webhooks (raw body); admin JSON routes parse their own body

  // 1 MB default JSON limit; /api/invitations sets its own larger limit (photos are embedded as data URLs).
  const json = express.json({ limit: "1mb" });
  // Larger bodies only where images are uploaded (invitation sites, studio designs).
  app.use((req, res, next) => (req.path === "/api/invitations" || req.path === "/api/studio/projects" || req.path === "/api/seller/media" ? next() : json(req, res, next)));
  app.post("/api/csp-report", rateLimit({ bucket: "csp-report", windowMs: 60_000, max: 30 }), express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }), cspReport);
  app.use(tenantContext);
  app.use(userContext);

  app.use(accountRouter());
  app.use(publicRouter({ root, generatedDir }));
  app.use(studioRouter({ generatedDir }));
  app.use(sellerRouter({ generatedDir }));
  app.use("/api/pod-agent", podAgentRouter());
  // Only the embeddable widget is public; the rest of server/pod-agent (server code, README) is never served.
  const widgetFile = new URL("./pod-agent/widget.js", import.meta.url).pathname;
  app.get("/pod-agent/widget.js", (_, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.type("application/javascript").sendFile(widgetFile, { maxAge: "1h" }); });
  app.use("/pod-agent", (_, res) => res.status(404).json({ error: "not_found" }));
  app.use(carrierRates);
  app.use(logisticsRouter());
  app.use(adminRouter({ root }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
