# Pod.AI Shopify listing screenshots (1600x900, real admin UI, sample data, no prices, no browser frame).
#   1) node apps/shopify-agent/listing/tools/preview-server.mjs      2) python3 apps/shopify-agent/listing/tools/render-shots.py
# Needs Python Playwright + a Chrome/Chromium (CHROME=/path/to/chrome).
from playwright.sync_api import sync_playwright
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
STUB = "window.shopify={config:{locale:'en'},idToken:async()=>(await (await fetch('/__tok')).text()),toast:{show(){}}};"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
    pg.route(lambda u: not u.startswith("http://127.0.0.1"), lambda r: r.abort())
    pg.route("**/app-bridge.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    pg.route("**/__tok", lambda r: r.fulfill(body=open("/tmp/podai-preview/token.txt").read(), content_type="text/plain"))
    pg.add_init_script("try{localStorage.setItem('podai_lang','en')}catch(e){}")
    go = lambda: pg.goto("http://127.0.0.1:4555/shopify-agent?shop=alpine-tees.myshopify.com")
    go(); pg.wait_for_timeout(1800); pg.evaluate("document.body.style.zoom=0.9"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + "1-dashboard.png")
    pg.click("#tabs [data-t=assistant]"); pg.wait_for_timeout(1500); pg.evaluate("document.body.style.zoom=0.8"); pg.wait_for_timeout(300)
    pg.click("#asQuick button:nth-child(2)"); pg.wait_for_timeout(900); pg.evaluate("document.getElementById('asLog').scrollTop=0")
    pg.screenshot(path=OUT + "2-assistant-briefing.png")
    pg.click("#asQuick button:nth-child(3)"); pg.wait_for_timeout(900)
    pg.fill("#asIn", 'answer "Can I change the engraving after ordering?" with "Yes — within 12 hours of ordering. Reply to your order e-mail with the new text."'); pg.press("#asIn", "Enter"); pg.wait_for_timeout(1200)
    pg.evaluate("document.getElementById('asLog').scrollTop=1e9"); pg.screenshot(path=OUT + "3-assistant-confirm.png")
    pg.fill("#asIn", "show POD-T-AB12CD"); pg.press("#asIn", "Enter"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT + "4-assistant-reply-draft.png")
    pg.evaluate("document.body.style.zoom=0.9"); pg.click("#tabs [data-t=handoffs]"); pg.wait_for_timeout(1200)
    pg.locator("#ho tr").nth(1).click(); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT + "5-tickets.png")
    pg.click("#tabs [data-t=knowledge]"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT + "6-knowledge.png")
    b.close()
print("ok")
