"""Import an AI-generated or photographed product image as a POD Studio mockup.

    python3 scripts/import_mockup.py <product_id> <image> [--area x,y,w,h]

The image should follow docs/MOCKUP_PROMPTS.md: square, front view, blank / white-label product on the standard
backdrop. The script
  1. crops to a square and resizes to 800 px  → assets/mockups/<id>.jpg
  2. separates the product from the backdrop (colour distance to the backdrop + clean-up) → <id>-mask.png (alpha)
  3. builds the shade map from the product's own luminance (white = no change) → <id>-shade.jpg
  4. keeps the product's print area from studio-catalog.json unless --area (percent) is given
  5. rewrites studio-mockup-assets.js (offline copies) and reminds you to run `npm run build:studio-data`.
Only import images you created or are licensed to use.
"""
import base64, json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, binary_opening, gaussian_filter, label

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CAT = os.path.join(ROOT, "server", "data", "studio-catalog.json")
OUT, PX = os.path.join(ROOT, "assets", "mockups"), 800


def main(pid, path, area=None):
    cat = json.load(open(CAT, encoding="utf8"))
    prod = next((p for p in cat["products"] if p["id"] == pid), None)
    if not prod: sys.exit(f"unknown product: {pid}")
    im = Image.open(path).convert("RGB")
    s = min(im.size); im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((PX, PX), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    # backdrop model: per-row colour taken from the left/right image borders (the standard backdrop is a vertical gradient)
    border = np.concatenate([a[:, :24], a[:, -24:]], axis=1).mean(axis=1, keepdims=True)
    diff = np.sqrt(((a - border) ** 2).sum(-1))
    m = diff > 18
    m = binary_opening(m, iterations=2)
    lab, n = label(m)
    if n: m = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)   # largest object = the product
    m = binary_fill_holes(m)
    soft = np.clip(gaussian_filter(m.astype(np.float32), 1.0), 0, 1)
    lum = a.mean(-1) / 255.0
    ref = np.percentile(lum[m], 97) if m.any() else 1.0
    shade = np.where(soft > 0.02, np.clip(lum / max(ref, 1e-3), 0, 1), 1.0)
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, f"{pid}.jpg"), quality=86, optimize=True, progressive=True)
    Image.merge("LA", (Image.new("L", (PX, PX), 255), Image.fromarray((soft * 255).astype(np.uint8)))).save(os.path.join(OUT, f"{pid}-mask.png"), optimize=True)
    Image.fromarray((shade * 255).astype(np.uint8)).save(os.path.join(OUT, f"{pid}-shade.jpg"), quality=90)
    mp = prod.get("mockup_photo") or {}
    if area: mp["area"] = area
    elif "area" not in mp:  # default: central 60 % of the product's bounding box
        ys, xs = np.where(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        mp["area"] = [round((x0 + .2 * (x1 - x0)) / PX * 100, 2), round((y0 + .2 * (y1 - y0)) / PX * 100, 2), round(.6 * (x1 - x0) / PX * 100, 2), round(.6 * (y1 - y0) / PX * 100, 2)]
    mp.update({"src": f"assets/mockups/{pid}.jpg", "mask": f"assets/mockups/{pid}-mask.png", "shade": f"assets/mockups/{pid}-shade.jpg"})
    prod["mockup_photo"] = mp
    json.dump(cat, open(CAT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    write_assets(cat)
    print(f"imported {pid}: mask covers {m.mean() * 100:.1f}% of the image; print area {mp['area']} — now run: npm run build:studio-data")


def write_assets(cat):
    assets = {}
    for p in cat["products"]:
        mp = p.get("mockup_photo")
        if not mp: continue
        for key in ("src", "mask", "shade"):
            f = mp.get(key)
            if f and os.path.exists(os.path.join(ROOT, f)):
                mime = "image/png" if f.endswith(".png") else "image/jpeg"
                assets[f] = f"data:{mime};base64," + base64.b64encode(open(os.path.join(ROOT, f), "rb").read()).decode()
    with open(os.path.join(ROOT, "studio-mockup-assets.js"), "w") as fh:
        fh.write("/* Embedded mockup images for file:// use (scripts/import_mockup.py / generate_mockups.py). */\nwindow.STUDIO_MOCKUP_ASSETS = " + json.dumps(assets) + ";\n")


if __name__ == "__main__":
    args = [x for x in sys.argv[1:] if not x.startswith("--area")]
    area = next((list(map(float, x.split("=", 1)[1].split(","))) for x in sys.argv[1:] if x.startswith("--area=")), None)
    if len(args) != 2: sys.exit(__doc__)
    main(args[0], args[1], area)
