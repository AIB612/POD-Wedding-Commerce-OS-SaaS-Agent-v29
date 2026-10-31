// SMTP mailer against a local fake server: STARTTLS refusal without TLS, plain session when TLS not required, AUTH, DATA, dot-stuffing.
import assert from "node:assert/strict";
import net from "node:net";
const { sendSmtp, buildMessage, smtpConfigured } = await import("./services/smtp.js");
function fake({ starttls = false } = {}) {
  const log = [];
  const srv = net.createServer(s => { let data = false, buf = "";
    s.write("220 fake ESMTP\r\n");
    s.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\r\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === ".") { data = false; s.write("250 queued\r\n"); } else log.push("D:" + line); continue; }
      log.push(line);
      if (/^EHLO/.test(line)) s.write(`250-fake\r\n${starttls ? "250-STARTTLS\r\n" : ""}250 AUTH PLAIN LOGIN\r\n`);
      else if (/^AUTH PLAIN/.test(line)) s.write("235 ok\r\n"); else if (/^MAIL|^RCPT/.test(line)) s.write("250 ok\r\n");
      else if (line === "DATA") { data = true; s.write("354 go\r\n"); } else if (line === "QUIT") { s.write("221 bye\r\n"); s.end(); } else s.write("502 no\r\n"); } }); });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ srv, log, port: srv.address().port })));
}
assert.equal(smtpConfigured({}), false); assert.equal(smtpConfigured({ SMTP_HOST: "x" }), true);
const m = buildMessage({ from: "a@b.ch", fromName: "Wed.AI 婚礼", to: "c@d.ch", subject: "Hi · 已发货", text: "t", html: "<p>h</p>" });
assert.match(m, /=\?UTF-8\?B\?/); assert.match(m, /multipart\/alternative/);
{ // TLS required by default: server without STARTTLS is refused
  const f = await fake(); await assert.rejects(sendSmtp({ to: "c@d.ch", subject: "s", text: "t" }, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(f.port), FROM_EMAIL: "a@b.ch" }), /starttls_unavailable/); f.srv.close(); }
{ const f = await fake();
  const r = await sendSmtp({ to: "c@d.ch", subject: "s", text: ".leading dot", html: "<p>x</p>" }, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(f.port), SMTP_REQUIRE_TLS: "false", SMTP_USER: "u", SMTP_PASS: "p", FROM_EMAIL: "a@b.ch" });
  assert.equal(r.status, "sent"); assert.ok(f.log.includes("MAIL FROM:<a@b.ch>")); assert.ok(f.log.includes("RCPT TO:<c@d.ch>")); assert.ok(f.log.some(l => l.startsWith("AUTH PLAIN ")));
  await assert.rejects(sendSmtp({ to: "x@y.ch>\r\nRCPT TO:<evil@z.ch", subject: "s" }, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(f.port), SMTP_REQUIRE_TLS: "false", FROM_EMAIL: "a@b.ch" }), /invalid_address/);
  f.srv.close(); }
console.log(JSON.stringify({ smtp: "pass" }));
