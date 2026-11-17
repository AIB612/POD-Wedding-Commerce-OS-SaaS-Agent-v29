const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Run against a local WordPress + WooCommerce test store with the plugin connected to a local backend.
// WP_URL / SHOTS_DIR / PLAYWRIGHT_MODULE / CHROME can be set via env.
const WP = process.env.WP_URL || 'http://127.0.0.1:8088', S = (process.env.SHOTS_DIR || '/workspace/woo/shots') + '/';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const errors = [], results = [];
const ok = (c, n, x = '') => { results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const watch = p => { p.on('pageerror', e => errors.push(`${p.url()}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`${p.url()}: console ${m.text()}`); }); };
const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } });
const p = await ctx.newPage(); watch(p);
async function ask(text) { const n = await p.locator('.pc-m.pc-a').count(); await p.fill('.pc-f textarea', text); await p.press('.pc-f textarea', 'Enter'); await p.waitForFunction(k => document.querySelectorAll('.pc-m.pc-a').length > k && !document.querySelector('.pc-ty'), n, { timeout: 20000 }); await p.waitForTimeout(300); }
await p.goto(WP + '/?post_type=product&podai=open', { waitUntil: 'networkidle' });
await p.waitForSelector('.pc-w.pc-on'); await p.waitForTimeout(500);
ok(await p.locator('.pc-w.pc-on').isVisible(), 'widget opens on storefront');
await p.screenshot({ path: S + '01-widget-open.png' });
await ask('I need a gift for my girlfriend under 50 CHF');
const cards = p.locator('.pc-car .pc-pc'); ok(await cards.count() >= 2, 'recommendation cards', String(await cards.count()));
await p.screenshot({ path: S + '02-recommendations.png' });
await p.locator('.pc-car').last().locator('button.pc-pri').first().click();
await p.waitForSelector('.pc-act a.pc-pri', { timeout: 15000 });
const cart = await p.evaluate(async () => (await fetch('/index.php?rest_route=/wc/store/v1/cart', { credentials: 'same-origin' })).json());
ok(cart.items_count >= 1, 'add to cart via Store API', `${cart.items_count} item(s): ${cart.items.map(i => i.name).join(', ')}`);
await p.screenshot({ path: S + '03-added-to-cart.png' });
await ask('something cheaper');
await ask('Do you have a discount code?');
await p.locator('.pc-act button.pc-pri').last().click();
await p.waitForFunction(() => [...document.querySelectorAll('.pc-act span, .pc-m.pc-a')].some(e => /WELCOME10/.test(e.textContent) && /applied|Copy/.test(e.textContent)), null, { timeout: 15000 });
const cart2 = await p.evaluate(async () => (await fetch('/index.php?rest_route=/wc/store/v1/cart', { credentials: 'same-origin' })).json());
ok((cart2.coupons || []).some(c => c.code === 'welcome10'), 'coupon applied to cart', JSON.stringify((cart2.coupons || []).map(c => c.code)) + ' total ' + cart2.totals?.total_price);
await p.screenshot({ path: S + '04-coupon-applied.png' });
await ask('Where is my order #27?'); await ask('buyer@example.com');
ok(await p.locator('.pc-oc').count() >= 2, 'order + tracking cards');
await p.screenshot({ path: S + '05-order-tracking.png' });
// checkout link goes to the checkout page (no payment is made)
const href = await p.locator('.pc-act a.pc-pri').first().getAttribute('href'); const cfg = await p.evaluate(() => window.PodAIChat && window.PodAIChat.checkoutUrl); ok(!!href && (href === cfg || /checkout|page_id=/.test(href)), 'checkout link', href);
// Chinese + contact us
const p2 = await ctx.newPage(); watch(p2);
await p2.goto(WP + '/?podai=open', { waitUntil: 'networkidle' }); await p2.waitForSelector('.pc-w.pc-on');
await p2.evaluate(() => sessionStorage.clear());
async function ask2(text) { const n = await p2.locator('.pc-m.pc-a').count(); await p2.fill('.pc-f textarea', text); await p2.press('.pc-f textarea', 'Enter'); await p2.waitForFunction(k => document.querySelectorAll('.pc-m.pc-a').length > k && !document.querySelector('.pc-ty'), n, { timeout: 20000 }); await p2.waitForTimeout(300); }
await ask2('你们有适合送孩子的礼物吗？');
ok(await p2.locator('.pc-car .pc-pc').count() >= 1, 'ZH recommendation');
await p2.screenshot({ path: S + '06-chinese.png' });
await ask2('包裹坏了，我要找人工客服');
await p2.waitForSelector('.pc-hf input[type=email]', { timeout: 10000 });
await p2.fill('.pc-hf input[type=email]', 'sherry.branny@gmail.com'); await p2.locator('.pc-hf button').click();
await p2.waitForFunction(() => /POD-T-/.test(document.querySelector('.pc-log').textContent), null, { timeout: 20000 });
const tk = await p2.evaluate(() => /POD-T-[A-Z2-9]{6}/.exec(document.querySelector('.pc-log').textContent)[0]); ok(!!tk, 'contact us → ticket', tk);
await p2.screenshot({ path: S + '07-contact-ticket.png' });
// mobile
const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p3 = await m.newPage(); watch(p3); await p3.goto(WP + '/?podai=open', { waitUntil: 'networkidle' }); await p3.waitForSelector('.pc-w.pc-on');
await p3.fill('.pc-f textarea', 'Show me your products'); await p3.press('.pc-f textarea', 'Enter'); await p3.waitForSelector('.pc-car .pc-pc', { timeout: 20000 }); await p3.waitForTimeout(500);
await p3.screenshot({ path: S + '08-mobile.png' });
// admin
const a = await (await b.newContext({ viewport: { width: 1366, height: 1000 } })).newPage(); watch(a);
await a.goto(WP + '/wp-login.php'); await a.fill('#user_login', process.env.WP_ADMIN_USER || 'admin'); await a.fill('#user_pass', process.env.WP_ADMIN_PASS || ''); await a.click('#wp-submit'); await a.waitForLoadState('networkidle');
await a.goto(WP + '/wp-admin/admin.php?page=pod-ai-chat', { waitUntil: 'networkidle' });
ok(await a.locator('text=Connected').first().isVisible(), 'admin settings: connected');
await a.screenshot({ path: S + '09-admin-settings.png', fullPage: true });
await a.goto(WP + '/wp-admin/admin.php?page=pod-ai-chat-tickets', { waitUntil: 'networkidle' });
await a.screenshot({ path: S + '10-admin-tickets.png' });
await a.locator(`a:has-text("${tk}")`).first().click(); await a.waitForLoadState('networkidle');
await a.selectOption('select[name=status]', 'pending'); await a.fill('textarea[name=note]', 'Asked the customer for a photo of the parcel.');
await a.click('input[type=submit][value="Save ticket"]'); await a.waitForLoadState('networkidle');
ok(await a.locator('text=Ticket updated').isVisible() && await a.locator('text=Asked the customer for a photo').isVisible(), 'admin: status + note saved');
await a.screenshot({ path: S + '11-admin-ticket-detail.png', fullPage: true });
await a.selectOption('select[name=status]', 'closed'); await a.click('input[type=submit][value="Save ticket"]'); await a.waitForLoadState('networkidle');
await a.goto(WP + '/wp-admin/admin.php?page=pod-ai-chat-tickets&status=closed', { waitUntil: 'networkidle' });
ok(await a.locator(`text=${tk}`).count() >= 1, 'admin: ticket closed (Closed tab)');
console.log(results.join('\n')); console.log('JS errors:', errors.length ? errors : 0);
await b.close();
