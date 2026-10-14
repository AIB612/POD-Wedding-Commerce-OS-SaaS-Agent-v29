// Admin API client: tenant + admin key headers; asks for the key once on a 401 and keeps it per tab.
const KEY_STORE = 'wedding-commerce-admin-key';
export const TENANT = 'tenant_demo';
const adminKey = () => { try { return sessionStorage.getItem(KEY_STORE) || 'change-me'; } catch { return 'change-me'; } };

let keyPrompt = null;
export let authDenied = false;
function askKey() {
  keyPrompt ||= Promise.resolve().then(() => {
    const k = window.prompt('Admin API Key (ADMIN_API_KEY)');
    if (!k) { authDenied = true; return false; }
    try { sessionStorage.setItem(KEY_STORE, k.trim()); } catch {}
    return true;
  }).finally(() => setTimeout(() => { keyPrompt = null; }, 0));
  return keyPrompt;
}

/** Returns parsed JSON, or null on network/auth failure. Error bodies come back with __error: true. */
export async function api(path, opt = {}, retry = true) {
  try {
    const used = adminKey();
    const r = await fetch(path, { ...opt, headers: { 'x-tenant-id': TENANT, 'x-admin-api-key': used, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    if (r.status === 401 && retry && !authDenied && (adminKey() !== used || await askKey())) return api(path, opt, false);
    if (r.status === 401) authDenied = true;
    const d = await r.json().catch(() => null);
    if (!r.ok) return d && d.error ? { ...d, __error: true } : null;
    return d;
  } catch { return null; }
}
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

/** Authenticated binary download (Excel / CSV exports) — a plain <a href> cannot send the admin header. */
export async function downloadAuthed(path, fallbackName, retry = true) {
  const used = adminKey();
  const r = await fetch(path, { headers: { 'x-tenant-id': TENANT, 'x-admin-api-key': used } });
  if (r.status === 401 && retry && !authDenied && (adminKey() !== used || await askKey())) return downloadAuthed(path, fallbackName, false);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  const m = (r.headers.get('content-disposition') || '').match(/filename="?([^";]+)"?/i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = m?.[1] || fallbackName;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Raw file upload (import preview). */
export async function uploadFile(path, file, retry = true) {
  const used = adminKey();
  const r = await fetch(path, { method: 'POST', headers: { 'x-tenant-id': TENANT, 'x-admin-api-key': used, 'x-file-name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' }, body: file });
  if (r.status === 401 && retry && !authDenied && (adminKey() !== used || await askKey())) return uploadFile(path, file, false);
  const d = await r.json().catch(() => null);
  return r.ok ? d : { ...(d || {}), __error: true };
}
export const ok = r => r && !r.__error;

export function downloadCsv(name, rows) {
  if (!rows.length) return false;
  const cols = Object.keys(rows[0]);
  const cell = v => { const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return true;
}
