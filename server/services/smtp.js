// Minimal SMTP client (no dependencies): implicit TLS (port 465 / SMTP_SECURE=true) or STARTTLS (587/25, required unless
// SMTP_REQUIRE_TLS=false), AUTH PLAIN/LOGIN, multipart text+html. Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME.
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export const smtpConfigured = (env = process.env) => !!env.SMTP_HOST;

function reader(sock) {
  let buf = "", waiters = [];
  const pump = () => { for (;;) { const lines = buf.split("\r\n"); let end = -1;
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { end = i; break; }
      if (end < 0 || !waiters.length) return; const msg = lines.slice(0, end + 1); buf = lines.slice(end + 1).join("\r\n");
      const w = waiters.shift(); w.resolve({ code: Number(msg[end].slice(0, 3)), text: msg.join("\n") }); } };
  const onData = d => { buf += d.toString("utf8"); pump(); };
  sock.on("data", onData);
  return { next: () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); pump(); }), fail: e => { for (const w of waiters.splice(0)) w.reject(e); }, detach: () => sock.off("data", onData) };
}
const enc = s => /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=` : s;
const b64lines = s => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
const clean = v => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

export function buildMessage({ from, fromName, to, subject, text, html, date = new Date(), id = crypto.randomUUID() }) {
  const b = `b_${crypto.randomBytes(12).toString("hex")}`, domain = String(from).split("@")[1] || "localhost";
  return [`From: ${fromName ? `${enc(clean(fromName))} <${from}>` : from}`, `To: ${to}`, `Subject: ${enc(clean(subject))}`, `Date: ${date.toUTCString()}`, `Message-ID: <${id}@${domain}>`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64lines(text || subject || ""),
    `--${b}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64lines(html || ""), `--${b}--`, ""].join("\r\n");
}

export async function sendSmtp({ to, subject, text, html }, env = process.env) {
  const host = env.SMTP_HOST, port = Number(env.SMTP_PORT || 587), secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const from = env.FROM_EMAIL || env.SMTP_USER, user = env.SMTP_USER, pass = env.SMTP_PASS, timeout = Number(env.SMTP_TIMEOUT_MS || 20000);
  if (!host || !from) throw new Error("smtp_not_configured");
  if (/[\r\n<>]/.test(to) || /[\r\n<>]/.test(from)) throw new Error("smtp_invalid_address");
  const tlsOpts = { servername: host, rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false" };
  let sock = secure ? tls.connect({ host, port, ...tlsOpts }) : net.connect({ host, port });
  sock.setTimeout(timeout);
  let rd = reader(sock);
  const failAll = e => rd.fail(e);
  sock.on("timeout", () => { failAll(new Error("smtp_timeout")); sock.destroy(); }); sock.on("error", e => failAll(e));
  const cmd = async (line, ok) => { if (line != null) sock.write(line + "\r\n"); const r = await rd.next(); if (!ok.includes(r.code)) throw new Error(`smtp_${r.code}: ${r.text.split("\n").pop().slice(4, 160)}`); return r; };
  try {
    await cmd(null, [220]);
    const ehloName = env.SMTP_EHLO_NAME || "wed.swisspro.site";
    let ehlo = await cmd(`EHLO ${ehloName}`, [250]);
    if (!secure) {
      if (/STARTTLS/i.test(ehlo.text)) {
        await cmd("STARTTLS", [220]); rd.detach();
        sock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, ...tlsOpts }, () => resolve(t)); t.once("error", reject); });
        sock.setTimeout(timeout); rd = reader(sock); sock.on("error", e => rd.fail(e)); sock.on("timeout", () => { rd.fail(new Error("smtp_timeout")); sock.destroy(); });
        ehlo = await cmd(`EHLO ${ehloName}`, [250]);
      } else if (env.SMTP_REQUIRE_TLS !== "false") throw new Error("smtp_starttls_unavailable");
    }
    if (user) {
      if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) await cmd(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass || ""}`).toString("base64")}`, [235]);
      else { await cmd("AUTH LOGIN", [334]); await cmd(Buffer.from(user).toString("base64"), [334]); await cmd(Buffer.from(pass || "").toString("base64"), [235]); }
    }
    await cmd(`MAIL FROM:<${from}>`, [250]); await cmd(`RCPT TO:<${to}>`, [250, 251]); await cmd("DATA", [354]);
    const msg = buildMessage({ from, fromName: env.FROM_NAME, to, subject, text, html }).replace(/\r\n\./g, "\r\n..");
    const r = await cmd(msg + "\r\n.", [250]);
    sock.write("QUIT\r\n"); sock.end();
    return { provider: "smtp", status: "sent", code: r.code };
  } catch (e) { sock.destroy(); throw e; }
}
