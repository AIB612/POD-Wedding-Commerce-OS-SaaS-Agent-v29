// Local retrieval engine shared by both customer chats (site chat + Pod.AI). Pure JS, no network, no dependencies:
//   • multilingual tokenizer (EN / DE / FR / IT word stems, accents folded, CJK uni+bigrams)
//   • typo tolerance: unknown words are corrected against the index vocabulary (Damerau-Levenshtein ≤ 1, ≤ 2 for long words)
//   • BM25 ranking over weighted fields (question / tags / answer), scores normalised to 0..1
//   • sentence picker that keeps the 1–2 sentences of a long answer that best match the question
// Default chat mode is LOCAL: answers come from this index plus live shop data; an LLM is never required.
const CJK = /[\u3400-\u9fff]/;
const STOP = new Set(("the a an and or of to in on for with is are was be do does did i you we they it my your our me us can could would "
  + "what which how when where who please hi hello there this that these those any some about have has had will just "
  + "der die das ein eine einen und oder ich du sie wir ihr es ist sind mit für von zu im in am auf wie was wo wann bitte "
  + "le la les un une des et ou je tu il elle nous vous est sont avec pour de du en au aux que qui quoi comment où quand "
  + "il lo la i gli un una e o io tu lui lei noi voi è sono con per di da in che cosa come dove quando "
  + "的 了 吗 呢 吧 我 你 您 们 是 有 在 和 请 问").split(/\s+/));
const fold = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
/** Very light multilingual stemmer: enough to match plural / gender / verb endings, never aggressive. */
export function stem(w) {
  if (w.length <= 4) return w;
  for (const suf of ["ations", "ation", "ungen", "ung", "ments", "ment", "ies", "ers", "ing", "ed", "es", "en", "er", "e", "s", "i", "a", "o"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return suf === "ies" ? w.slice(0, -3) + "y" : w.slice(0, -suf.length);
  }
  return w;
}
/** Tokens of a text: folded word stems (stop words dropped) + CJK unigrams and bigrams. */
export function tokenize(text, { keepStop = false } = {}) {
  const out = [], t = fold(text);
  for (const m of t.matchAll(/[\u3400-\u9fff]+|[a-z0-9]+/g)) {
    const w = m[0];
    if (CJK.test(w)) { for (let i = 0; i < w.length; i++) { if (!STOP.has(w[i])) out.push(w[i]); if (i + 1 < w.length) out.push(w.slice(i, i + 2)); } continue; }
    if (w.length < 2 || (!keepStop && STOP.has(w))) continue;
    out.push(stem(w));
  }
  return out;
}
/** Damerau-Levenshtein distance with an early exit above `max`. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
/** Closest vocabulary word for a (folded) word, or null. Short words are never corrected. */
export function closestWord(w, vocab, { minLen = 5 } = {}) {
  if (w.length < minLen || vocab.has(w)) return null;
  const max = w.length >= 8 ? 2 : 1;
  let best = null, bestD = max + 1;
  for (const v of vocab) {
    if (Math.abs(v.length - w.length) > max || v[0] !== w[0] && v[1] !== w[1]) continue;
    const dd = editDistance(w, v, max);
    if (dd < bestD || (dd === bestD && best && v.length > best.length)) { best = v; bestD = dd; }
  }
  return bestD <= max ? best : null;
}
/** Correct typos word-by-word against a vocabulary of known (folded, unstemmed) words. Returns { text, fixes }. */
const isInsertion = (w, v) => { for (let i = 0; i < v.length; i++) if (v.slice(0, i) + v.slice(i + 1) === w) return true; return false; };
export function correctTypos(text, vocab) {
  const fixes = [];
  const out = String(text || "").replace(/[A-Za-zÀ-ÿ]{4,}/g, w => {
    const f = fold(w); if (vocab.has(f)) return w;
    // 4-letter words: only a missing doubled letter ("tase" → "tasse"); longer words: edit distance 1–2.
    // 4-letter words: only one missing letter ("tase" → "tasse", "ordr" → "order"); longer words: edit distance 1–2.
    const c = f.length === 4 ? [...vocab].find(v => v.length === 5 && v[0] === f[0] && isInsertion(f, v)) || null : closestWord(f, vocab);
    if (!c) return w;
    fixes.push([w, c]); return c;
  });
  return { text: out, fixes };
}
/** Vocabulary (folded words, ≥ 4 letters) from any texts. */
export function buildVocab(texts) {
  const v = new Set();
  for (const t of texts) for (const m of fold(t).matchAll(/[a-z]{4,}/g)) v.add(m[0]);
  return v;
}

/**
 * BM25 index. docs: [{ id, fields: { name: text }, ...payload }]; weights: { name: number } (field boost).
 * search(query) → [{ id, doc, score, norm }] where norm is 0..1 relative to a perfect match of all query terms.
 */
export class BM25 {
  constructor(docs, { weights = {}, k1 = 1.2, b = 0.6 } = {}) {
    this.k1 = k1; this.b = b; this.docs = docs;
    this.rows = docs.map(d => { const tf = new Map(); let len = 0;
      for (const [f, text] of Object.entries(d.fields || {})) { const w = weights[f] ?? 1; for (const t of tokenize(text)) { tf.set(t, (tf.get(t) || 0) + w); len += w; } }
      return { tf, len }; });
    this.avg = this.rows.reduce((s, r) => s + r.len, 0) / Math.max(1, this.rows.length) || 1;
    this.df = new Map(); for (const r of this.rows) for (const t of r.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.vocab = new Set([...this.df.keys()].filter(t => !CJK.test(t) && t.length >= 4));
  }
  idf(t) { const n = this.docs.length, df = this.df.get(t) || 0; return Math.log(1 + (n - df + 0.5) / (df + 0.5)); }
  search(query, { limit = 5, fuzzy = true } = {}) {
    let qt = [...new Set(tokenize(query))];
    if (fuzzy) qt = qt.map(t => this.df.has(t) || CJK.test(t) ? t : (closestWord(t, this.vocab, { minLen: 5 }) || t));
    const all = [...new Set(qt)];
    qt = all.filter(t => this.df.has(t));
    if (!qt.length) return [];
    // Words the index has never seen ("moon", "cheese") still count against the match: a hit on one common word is weak.
    const ideal = all.reduce((s, t) => s + this.idf(t), 0) || 1;
    return this.rows.map((r, i) => {
      let s = 0;
      for (const t of qt) { const f = r.tf.get(t); if (!f) continue; s += this.idf(t) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * r.len / this.avg)); }
      return { id: this.docs[i].id, doc: this.docs[i], score: s, norm: Math.min(1, s / ideal), matched: qt.filter(t => r.tf.has(t)).length, terms: all.length };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

/** Split an answer into sentences (keeps CJK punctuation). */
// Abbreviations that end in a dot but do not end a sentence (e.g. "e.g.", "incl.", "z.B.", "ca.").
const ABBR = /(?:\b(?:e\.g|i\.e|incl|excl|inkl|exkl|approx|ca|etc|vs|nr|no|z\.b|d\.h|bzw|usw|env|ecc|p\.es|min|max|mo|fr|sa)|\b[A-Z])\.$/i;
export const sentences = text => {
  const parts = String(text || "").split(/(?<=[.!?。！？])\s+|(?<=[。！？])/).map(s => s.trim()).filter(Boolean), out = [];
  for (const p of parts) { if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += " " + p; else out.push(p); }
  return out;
};
/**
 * The most relevant 1–`max` sentences of a long answer for this question, in their original order.
 * Short answers (≤ max sentences) come back unchanged. The first sentence is kept when nothing matches better.
 */
export function pickSentences(answer, question, { max = 2 } = {}) {
  const ss = sentences(answer);
  if (ss.length <= max) return answer.trim();
  const qt = new Set(tokenize(question));
  const near = t => qt.has(t) || (t.length >= 5 && [...qt].some(q => q.length >= 4 && Math.abs(q.length - t.length) <= 1 && editDistance(q, t, 1) <= 1));
  const scored = ss.map((s, i) => ({ i, s, score: [...new Set(tokenize(s))].filter(near).length + (i === 0 ? 0.5 : 0) }));
  const keep = scored.slice().sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max).sort((a, b) => a.i - b.i);
  return keep.map(x => x.s).join(CJK.test(answer) ? "" : " ");
}
/** Deterministic variation: pick one phrasing from a list, stable for a given seed (conversation id + turn). */
export function vary(list, seed = "") {
  if (!Array.isArray(list) || !list.length) return "";
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** Shopping / customer-service words in EN/DE/FR/IT used to correct typos before intent detection (any shop). */
export const SHOP_WORDS = "where shipping delivery deliver delivered arrive order orders tracking track parcel package return returns refund exchange payment discount coupon recommend product products price prices cost contact human person cancel change sizes colours colors material customs "
  + "versand lieferung lieferzeit bestellung sendung paket rückgabe erstattung zahlung rabatt gutschein produkt produkte preis kosten kontakt stornieren grössen größen farben "
  + "livraison commande colis retour remboursement paiement réduction produit produits prix contacter annuler tailles couleurs "
  + "spedizione consegna ordine pacco reso rimborso pagamento sconto prodotto prodotti prezzo contattare annullare taglie colori";
