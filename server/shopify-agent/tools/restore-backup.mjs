#!/usr/bin/env node
// Restore an encrypted Pod.AI backup (see security/backup.js). Needs the same PODAI_DATA_KEY / APP_ENCRYPTION_KEY (.env).
//   node server/shopify-agent/tools/restore-backup.mjs --list
//   node server/shopify-agent/tools/restore-backup.mjs ~/podai-backups/store-20261109.json.gz.enc --out /tmp/store.restored.json
//   node server/shopify-agent/tools/restore-backup.mjs --backup-now        (take a backup immediately)
// Then, to roll back: stop the app (cloudlinux-selector stop … --app-root pod-wedding AND pod-ai-app), move data/store.json
// aside (it is per-row encrypted, safe to keep), copy the restored file to data/store.json (chmod 600), start both apps.
// The restored file never overwrites an existing path, and nothing is printed except sizes / names.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
(await import("dotenv")).config({ path: path.join(root, ".env"), quiet: true });
const { restoreBackup, runBackup, backupDir } = await import("../security/backup.js");
const a = process.argv.slice(2);
if (a[0] === "--list") { for (const f of fs.readdirSync(backupDir()).sort()) console.log(f, fs.statSync(path.join(backupDir(), f)).size); process.exit(0); }
if (a[0] === "--backup-now") { console.log(JSON.stringify(await runBackup({ force: a.includes("--force") }))); process.exit(0); }
const src = a[0], out = a[a.indexOf("--out") + 1];
if (!src || a.indexOf("--out") < 0 || !out) { console.error("usage: restore-backup.mjs <backup.enc> --out <new-file> | --list | --backup-now"); process.exit(2); }
const r = await restoreBackup(path.resolve(src), path.resolve(out));
console.log(`restored ${r.bytes} bytes to ${path.resolve(out)}`);
