"""One source of truth for scenes: the storefront (index.html sceneData) and the POD Studio use the same scenes.

  python3 scripts/build_scenes.py

1. Reads the wedding scenes from index.html and writes them into server/data/studio-catalog.json as studio
   scenarios (one kit per storefront group + a complete set) with their products (same names, same materials).
2. Gives every studio product selectable materials (price difference per material).
3. Renders scene images for every scene without a photo (assets/scenes/<key>.jpg) — products are cut out of the
   standard renders (assets/mockups) and placed on the four storefront hotspot positions.
4. Renders the design showcase images for the storefront (assets/showcase/*.jpg).
Then run `npm run build:studio-data`.
"""
import json, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CAT = os.path.join(ROOT, "server", "data", "studio-catalog.json")
CNY_EUR = 0.128          # demo rate used to convert storefront prices / material surcharges
SLOTS = [(0.27, 0.57), (0.61, 0.35), (0.14, 0.75), (0.55, 0.50)]   # storefront hotspot positions (left, top)
FONT_DIR = "/usr/share/fonts/truetype/dejavu"


def font(name, size):
    for f in (os.path.join(FONT_DIR, name), os.path.join(FONT_DIR, "DejaVuSerif.ttf")):
        if os.path.exists(f): return ImageFont.truetype(f, size)
    return ImageFont.load_default()


# ------------------------------------------------------------------ 1. storefront scenes → studio
def storefront_scenes():
    s = open(os.path.join(ROOT, "index.html"), encoding="utf8").read()
    mats = {}
    block = re.search(r"const materialsByType = \{(.*?)\n\};", s, re.S).group(1)
    for t, body in re.findall(r"(\w+):\[(.*?)\]", block, re.S):
        mats[t] = [{"id": i, "name": n, "delta": float(d)} for i, n, d in re.findall(r'\{id:"(\w+)",name:"([^"]+)",delta:(-?[\d.]+)', body)]
    scenes = {}
    for m in re.finditer(r'\n  (\w+):\{\n    name:"([^"]+)", subtitle:"([^"]+)",\n    note:"([^"]+)",\n    colors:(\[[^\]]+\]),\n    groups:\[(.*?)\n    \]\n  \}', s, re.S):
        key, name, sub, note, colors, body = m.groups()
        groups = [[g, [{"name": n, "price": float(pr), "type": t, "desc": d} for n, pr, t, d in re.findall(r'p\("([^"]+)",([\d.]+),"(\w+)","([^"]*)"\)', items)]] for g, items in re.findall(r'\["([^"]+)",\[(.*?)\]\]', body, re.S)]
        scenes[key] = {"name": name, "subtitle": sub, "note": note, "colors": json.loads(colors), "groups": groups}
    return scenes, mats


def source_for(name, typ):
    """Which standard render / print area a storefront product uses."""
    n = name.lower()
    rules = [("gift box", "gift_box"), ("tote", "tote"), ("favor bag", "ski_case"), ("pouch", "ski_case"), ("mason jar", "candle"), ("cup", "tumbler"),
             ("candle", "candle"), ("sticker", "sticker"), ("label", "sticker"), ("fan", "postcard"), ("seed packet", "postcard"),
             ("banner", "banner"), ("runner", "banner"), ("table number", "acrylic_stand"), ("thank you", "greeting"), ("rsvp", "postcard"),
             ("save the date", "postcard"), ("place card", "postcard"), ("menu", "menu_card"), ("program", "menu_card"),
             ("sign", "welcome_sign"), ("board", "welcome_sign"), ("welcome", "welcome_sign"), ("chart", "welcome_sign")]
    for k, v in rules:
        if k in n: return v
    return {"invite": "invitation", "table": "menu_card", "sign": "welcome_sign", "gift": "gift_box"}[typ]


def sku(name): return re.sub(r"^-|-$", "", re.sub(r"[^A-Z0-9]+", "-", name.upper()))[:48]


def merge_wedding(cat, scenes, mats, zh_names):
    byid = {p["id"]: p for p in cat["products"]}
    cat["products"] = [p for p in cat["products"] if not p["id"].startswith("wd_")]
    cat["scenarios"] = [s for s in cat["scenarios"] if not s["id"].startswith("wedding_")]
    added, wedding_sc = {}, []
    for key, sc in scenes.items():
        kits, all_ids = [], []
        for g, items in sc["groups"]:
            ids = []
            for it in items:
                pid = "wd_" + sku(it["name"]).lower().replace("-", "_")
                if pid not in added:
                    src = byid[source_for(it["name"], it["type"])]
                    eur = it["price"] * CNY_EUR
                    added[pid] = {"id": pid, "name": {"zh": zh_names.get(it["name"], it["name"]), "en": it["name"], "de": it["name"]}, "desc": {"zh": it["desc"]},
                        "category": "wedding", "storefront_sku": sku(it["name"]), "storefront_type": it["type"], "shape": src["shape"], "print_area_mm": src["print_area_mm"],
                        "default_mode": src["default_mode"], "base_cost_eur": round(eur * 0.42, 2), "price_ceiling_eur": round(eur * 1.5, 2), "ship_class": src["ship_class"],
                        "facilities": src["facilities"], "packaging": src["packaging"], "weight_g": src["weight_g"], "technique": src["technique"], "mockup_photo": src.get("mockup_photo"),
                        "materials": [{"id": m["id"], "name": {"zh": m["name"], "en": m["name"], "de": m["name"]}, "delta_eur": round(m["delta"] * CNY_EUR, 2)} for m in mats.get(it["type"], [])],
                        **({"note": src["note"]} if src.get("note") else {})}
                ids.append(pid)
            kits.append({"id": f"wedding_{key}_{len(kits) + 1}", "name": {"zh": g, "en": g, "de": g}, "items": ids, "default_qty": 40})
            all_ids += ids
        kits.insert(0, {"id": f"wedding_{key}_set", "name": {"zh": "全套", "en": "Complete set", "de": "Komplettset"}, "items": all_ids, "default_qty": 40})
        wedding_sc.append({"id": f"wedding_{key}", "storefront_scene": key, "name": {"zh": sc["subtitle"], "en": sc["name"], "de": sc["name"]},
                           "audience": {"zh": sc["note"], "en": sc["name"], "de": sc["name"]}, "colors": sc["colors"], "kits": kits})
    cat["products"] += list(added.values())
    cat["scenarios"] = wedding_sc + cat["scenarios"]
    for s in wedding_sc: cat["scenario_buyers"][s["id"]] = ["individual", "merchant"]
    return cat


# ------------------------------------------------------------------ 2. materials for every product
MATS = {
    "paper": [("cotton_300", "棉纹艺术纸 300g", "Cotton art paper 300 g", "Baumwollpapier 300 g", 0), ("pearl", "珠光纸", "Pearl shimmer", "Perlglanz", .25), ("kraft", "再生牛皮纸", "Recycled kraft", "Recycling-Kraftpapier", -.1), ("vellum", "半透明硫酸纸", "Vellum", "Transparentpapier", .35)],
    "apparel": [("organic_180", "有机棉 180 g/m²", "Organic cotton 180 g/m²", "Bio-Baumwolle 180 g/m²", 0), ("heavy_240", "重磅棉 240 g/m²", "Heavyweight cotton 240 g/m²", "Schwere Baumwolle 240 g/m²", 2.2), ("recycled", "再生混纺", "Recycled blend", "Recycling-Mischgewebe", 1.0)],
    "ceramic": [("gloss", "亮面陶瓷", "Glossy ceramic", "Glänzende Keramik", 0), ("matte", "哑光陶瓷", "Matte ceramic", "Matte Keramik", .8)],
    "metal_drink": [("steel", "不锈钢", "Stainless steel", "Edelstahl", 0), ("powder", "粉末涂层", "Powder-coated", "Pulverbeschichtet", 1.4)],
    "acrylic": [("clear_3", "透明亚克力 3 mm", "Clear acrylic 3 mm", "Klares Acryl 3 mm", 0), ("frosted_5", "磨砂亚克力 5 mm", "Frosted acrylic 5 mm", "Satiniertes Acryl 5 mm", 3.0), ("mirror", "金色镜面", "Gold mirror", "Goldspiegel", 6.0)],
    "wall": [("matte_200", "哑光纸 200g", "Matte paper 200 g", "Mattes Papier 200 g", 0), ("satin_250", "绸面纸 250g", "Satin 250 g", "Seidenmatt 250 g", 1.2), ("fineart", "艺术棉纸", "Fine-art cotton rag", "Hahnemühle-Baumwollpapier", 4.0)],
    "canvas": [("polycotton", "涤棉帆布", "Poly-cotton canvas", "Polyester-Baumwoll-Leinwand", 0), ("cotton", "纯棉帆布", "Cotton canvas", "Baumwoll-Leinwand", 3.0)],
    "bag": [("canvas_280", "帆布 280 g", "Cotton canvas 280 g", "Baumwoll-Canvas 280 g", 0), ("recycled", "再生棉", "Recycled cotton", "Recycling-Baumwolle", .6), ("jute", "黄麻", "Jute", "Jute", 1.2)],
    "textile": [("polyester", "柔软涤纶", "Soft polyester", "Weiches Polyester", 0), ("linen_look", "仿麻面料", "Linen look", "Leinenoptik", 1.5)],
}
CAT_MATS = {"apparel": "apparel", "paper": "paper", "wall_art": "wall", "home": "textile", "pets": "textile", "outdoor": "textile", "seasonal": "paper"}
ID_MATS = {"mug": "ceramic", "magic_mug": "ceramic", "espresso": "ceramic", "pet_bowl": "ceramic", "enamel_mug": "metal_drink", "tumbler": "metal_drink", "bottle": "metal_drink",
           "thermos": "metal_drink", "canvas": "canvas", "tote": "bag", "acrylic_wall": "acrylic", "acrylic_stand": "acrylic", "trophy": "acrylic", "welcome_sign": "acrylic",
           "photo_frame": "acrylic", "notebook": "paper", "greeting": "paper", "postcard": "paper", "invitation": "paper", "menu_card": "paper", "wrap_paper": "paper"}


def add_materials(cat):
    for p in cat["products"]:
        if p["id"].startswith("wd_"): continue
        key = ID_MATS.get(p["id"]) or CAT_MATS.get(p["category"])
        if key: p["materials"] = [{"id": i, "name": {"zh": zh, "en": en, "de": de}, "delta_eur": d} for i, zh, en, de, d in MATS[key]]
        else: p.pop("materials", None)


# ------------------------------------------------------------------ 3. scene images
def cutout(pid_src):
    f = os.path.join(ROOT, "scripts", ".cache", "cuts", f"{pid_src}.png")
    if not os.path.exists(f): raise SystemExit("run `python3 scripts/generate_mockups.py` first (creates scripts/.cache/cuts)")
    return Image.open(f).convert("RGBA")


def scene_backdrop(W, H, colors):
    c = [tuple(int(x[i:i + 2], 16) for i in (1, 3, 5)) for x in colors]
    wall_top, wall_bot, table = np.array(c[1], np.float32), np.array(c[0], np.float32), np.array(c[2], np.float32)
    y = np.linspace(0, 1, H)[:, None, None]
    img = np.broadcast_to(wall_top * (1 - y) + wall_bot * y, (H, W, 3)).copy()
    horizon = int(H * 0.56)
    t = np.linspace(0, 1, H - horizon)[:, None, None]
    img[horizon:] = table * (1.04 - 0.12 * t) + 255 * 0.04
    xx, yy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    img *= (1 - 0.13 * (xx ** 2 + 0.6 * yy ** 2))[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([0, horizon - 2, W, horizon + 3], fill=(255, 255, 255, 40))                    # table edge highlight
    cx, top = int(W * 0.5), int(H * 0.06)                                                         # soft arch on the wall
    d.arc([cx - int(W * .2), top, cx + int(W * .2), top + int(H * .9)], 180, 360, fill=(255, 255, 255, 70), width=10)
    return im


def place(canvas, obj, cx, cy, h):
    k = h / obj.height; o = obj.resize((max(1, int(obj.width * k)), max(1, int(h))), Image.LANCZOS)
    x, y = int(cx - o.width / 2), int(cy - o.height * 0.62)
    sh = Image.new("RGBA", (o.width + 80, o.height // 5 + 40), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([30, 15, o.width + 50, o.height // 5 + 25], fill=(40, 28, 20, 70))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)), (x - 40, y + o.height - o.height // 10 - 20))
    canvas.alpha_composite(o, (x, y))


SIZE_MM = {}
def scale_for(pid, base):
    """Real-world size → drawing height (sticker small, sign / garment large)."""
    mm = SIZE_MM.get(pid, 200)
    return max(base * 0.42, min(base * 1.12, base * (0.45 + mm / 520)))


def scene_image(key, colors, groups, out):
    """Products stand on the table: one hero per group in the back row (hotspots), the rest in front.
    Returns the hotspot positions in percent [[left, top], …] (one per group)."""
    W, H = 1500, 1200
    im = scene_backdrop(W, H, colors).convert("RGBA")
    n = min(len(groups), 4)
    heroes = [(g[1][0], 0.5 + (i - (n - 1) / 2) * (0.78 / max(n, 1))) for i, g in enumerate(groups[:4])]
    extras = [pid for g in groups[:4] for pid in g[1][1:]][:6]
    front = [0.5 + (i - (len(extras) - 1) / 2) * (0.86 / max(len(extras), 1)) for i in range(len(extras))]
    hot = []
    for pid, x in heroes:                                   # back row
        obj = cutout(pid); h = scale_for(pid, 330); w = obj.width * h / obj.height
        if w > 330: h *= 330 / w
        place(im, obj, x * W, 0.70 * H - h * 0.38, h); hot.append([round(x * 100, 1), round((0.70 * H - h * 0.55) / H * 100, 1)])
    for pid, x in zip(extras, front):                       # front row
        obj = cutout(pid); h = scale_for(pid, 220); w = obj.width * h / obj.height
        if w > 230: h *= 230 / w
        place(im, obj, x * W, 0.90 * H - h * 0.38, h)
    im.convert("RGB").save(out, quality=84, optimize=True, progressive=True)
    return hot


# ------------------------------------------------------------------ 4. showcase (designs on products)
def design_canvas(kind, size=900):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if kind == "monogram":
        d.ellipse([60, 60, size - 60, size - 60], outline=(40, 35, 31, 255), width=18); d.ellipse([100, 100, size - 100, size - 100], outline=(154, 109, 87, 255), width=6)
        f = font("DejaVuSerif-Italic.ttf", 300); d.text((size / 2, size / 2), "A&N", font=f, fill=(40, 35, 31, 255), anchor="mm")
    elif kind == "brand":
        f = font("DejaVuSans-Bold.ttf", 150); d.text((size / 2, size / 2 - 40), "NORD", font=f, fill=(36, 52, 71, 255), anchor="mm")
        d.text((size / 2, size / 2 + 90), "STUDIO", font=font("DejaVuSans.ttf", 70), fill=(154, 109, 87, 255), anchor="mm")
    elif kind == "leaves":
        for i in range(9):
            a = i * 40; cx, cy = size / 2 + 260 * np.cos(np.radians(a)), size / 2 + 260 * np.sin(np.radians(a))
            d.ellipse([cx - 60, cy - 120, cx + 60, cy + 120], fill=(98, 128, 92, 230))
        d.text((size / 2, size / 2), "Lea & Max", font=font("DejaVuSerif-Italic.ttf", 110), fill=(40, 35, 31, 255), anchor="mm")
    elif kind == "cafe":
        d.ellipse([150, 150, size - 150, size - 150], fill=(154, 109, 87, 255))
        d.text((size / 2, size / 2 - 30), "Café", font=font("DejaVuSerif-Italic.ttf", 170), fill=(255, 250, 244, 255), anchor="mm")
        d.text((size / 2, size / 2 + 110), "LUMIÈRE", font=font("DejaVuSans-Bold.ttf", 64), fill=(255, 250, 244, 255), anchor="mm")
    elif kind == "wave":
        for i in range(7):
            y = 220 + i * 70; d.arc([80, y - 120, size - 80, y + 120], 200, 340, fill=(48, 110, 160, 255), width=26)
        d.text((size / 2, size - 170), "SUMMER CLUB", font=font("DejaVuSans-Bold.ttf", 80), fill=(36, 52, 71, 255), anchor="mm")
    else:  # "team"
        d.rounded_rectangle([120, 260, size - 120, size - 260], radius=60, fill=(36, 52, 71, 255))
        d.text((size / 2, size / 2), "ACME · 2027", font=font("DejaVuSans-Bold.ttf", 96), fill=(255, 255, 255, 255), anchor="mm")
    return im


def showcase(pid, kind, out, color=None):
    base = Image.open(os.path.join(ROOT, "assets", "mockups", f"{pid}.jpg")).convert("RGB")
    mask = Image.open(os.path.join(ROOT, "assets", "mockups", f"{pid}-mask.png")).getchannel("A")
    shade = Image.open(os.path.join(ROOT, "assets", "mockups", f"{pid}-shade.jpg")).convert("L")
    W = base.width
    img = np.asarray(base, np.float32)
    if color:  # recolour the product, keep the shading
        m = np.asarray(mask, np.float32)[..., None] / 255
        img = img * (1 - m) + img * (np.array(color, np.float32) / 255) * m
    cat = json.load(open(CAT, encoding="utf8")); area = next(p for p in cat["products"] if p["id"] == pid)["mockup_photo"]["area"]
    ax, ay, aw, ah = [v / 100 * W for v in area]
    dsg = design_canvas(kind); k = min(aw / dsg.width, ah / dsg.height); dsg = dsg.resize((int(dsg.width * k), int(dsg.height * k)), Image.LANCZOS)
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0)); layer.alpha_composite(dsg, (int(ax + (aw - dsg.width) / 2), int(ay + (ah - dsg.height) / 2)))
    L = np.asarray(layer, np.float32); a = L[..., 3:] / 255 * (np.asarray(mask, np.float32)[..., None] / 255)
    rgb = L[..., :3] * (np.asarray(shade, np.float32)[..., None] / 255)
    img = img * (1 - a) + rgb * a
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((720, 720), Image.LANCZOS).save(out, quality=84, optimize=True, progressive=True)


if __name__ == "__main__":
    cat = json.load(open(CAT, encoding="utf8"))
    scenes, mats = storefront_scenes()
    i18n = open(os.path.join(ROOT, "i18n.js"), encoding="utf8").read()
    cat = merge_wedding(cat, scenes, mats, {})
    add_materials(cat)
    json.dump(cat, open(CAT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    byid = {p["id"]: p for p in cat["products"]}
    for p in cat["products"]:   # real size of the render source, for scene scaling
        if not p["id"].startswith("wd_"): SIZE_MM[p["id"]] = max(p["print_area_mm"]) * (1.6 if p["category"] == "apparel" else 1.0)
    src = lambda pid: (byid[pid].get("mockup_photo") or {}).get("src", "").split("/")[-1].replace(".jpg", "") or pid
    os.makedirs(os.path.join(ROOT, "assets", "scenes"), exist_ok=True)
    for sc in cat["scenarios"]:
        key = sc.get("storefront_scene") or sc["id"]
        if key == "cream": continue  # has its own photograph
        groups = [[k["name"]["en"], [src(p) for p in k["items"]]] for k in (sc["kits"][1:] if sc["id"].startswith("wedding_") else sc["kits"])]
        colors = sc.get("colors") or ["#d8cec2", "#efe8df", "#c9bba9", "#c7b29c"]
        hot = scene_image(key, colors, groups, os.path.join(ROOT, "assets", "scenes", f"{key}.jpg"))
        sc["scene_image"] = {"src": f"assets/scenes/{key}.jpg", "hotspots": hot}
    json.dump(cat, open(CAT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(ROOT, "assets", "showcase"), exist_ok=True)
    for pid, kind, col in [("invitation", "monogram", None), ("tee", "brand", None), ("tote", "leaves", None), ("mug", "cafe", None), ("hoodie", "wave", (190, 205, 186)), ("tumbler", "team", None)]:
        showcase(pid, kind, os.path.join(ROOT, "assets", "showcase", f"{pid}-{kind}.jpg"), col)
    print("scenes:", len(cat["scenarios"]), "products:", len(cat["products"]))
