import fs from "node:fs/promises";
const kbPath = new URL("./data/knowledge.json", import.meta.url);
let cache;
async function load() { if (!cache) cache = JSON.parse(await fs.readFile(kbPath, "utf8")); return cache; }

// Whitespace terms for Latin text plus CJK bigrams, so Chinese queries (no spaces) can match.
function terms(query = "") {
  const q = String(query).toLowerCase().slice(0, 2000);
  const out = new Set(q.split(/\s+/).filter(t => t.length > 1));
  for (const run of q.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

export async function retrieve(query, { scene } = {}) {
  // Demo lexical retriever. Replace with embedding/vector connector in production.
  const docs = await load(), ts = terms(query);
  return docs.map(d => {
    const hay = (d.title + " " + d.text + " " + (d.tags || []).join(" ")).toLowerCase();
    let score = ts.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    if (score > 0 && scene && (d.tags || []).includes(scene)) score += 1;
    return { ...d, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}
