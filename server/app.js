import "dotenv/config";
import { createApp } from "./create-app.js";
import { validateConfig, baseUrl } from "./config.js";
import { startSchedulers } from "./jobs/scheduler.js";
import { flushStore } from "./saas-store.js";

validateConfig();
const app = await createApp();
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`Wedding Commerce OS running on ${baseUrl()}`));
startSchedulers();

// Graceful shutdown: stop accepting connections, flush pending store writes, then exit.
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => { await flushStore(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
process.on("unhandledRejection", err => console.error("[server] unhandled rejection:", err));
