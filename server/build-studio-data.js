// Generates studio-data.js (browser global) from server/data/studio-catalog.json — the single source of truth.
// Run: npm run build:studio-data   (the self-test fails if the two drift apart)
import fs from "node:fs";
const json = fs.readFileSync(new URL("./data/studio-catalog.json", import.meta.url), "utf8");
const out = `/* Generated from server/data/studio-catalog.json by \`npm run build:studio-data\` — do not edit by hand. */\nwindow.STUDIO_DATA = ${JSON.stringify(JSON.parse(json))};\n`;
fs.writeFileSync(new URL("../studio-data.js", import.meta.url), out);
console.log("studio-data.js written");
