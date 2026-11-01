#!/usr/bin/env python3
"""Compute where the design sits on each product's back / side catalog photo (mockup_photo.views).

Writes mockup_photo.view_areas = {back: {...}, side: {...}} into server/data/studio-catalog.json, all in percent of the
square photo (same convention as mockup_photo.area):
  {"quad": [[x,y] TL, TR, BR, BL], "wrap": bool}   design is warped (perspective) onto that quad of the view photo
  {"plain": true}                                    the real back of the product as photographed (no printable face)
  {"synth": {"src": [[x,y]x4], "dst": [[x,y]x4]}}   view photo shows the product edge-on (artwork would be invisible):
                                                    the front mockup's face quad `src` is shown tilted at `dst` instead
Run: python3 scripts/build_view_areas.py && npm run build:studio-data
Optional manual overrides: mockup_photo.view_areas_manual = {back|side: {...same shape...}} is kept as-is."""
import json, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
from skimage import color

ROOT = Path(__file__).resolve().parent.parent
N = 400
FLAT = {"card", "notebook", "poster", "canvas", "framed", "metal", "acrylic", "tapestry", "puzzle", "rug", "banner", "wrap",
        "sticker", "mousepad", "sleeve", "phone", "tag", "standee", "box"}
WRAP = {"mug", "tumbler", "bottle", "candle", "bowl"}
# back photos that show the product's construction, not a printable face (stretcher frame, kraft backing, hanger, pin…):
# the back view shows that real back as photographed
PLAIN_BACK = {"canvas", "framed", "metal", "acrylic_wall", "photo_frame", "name_badge", "pin"}

def load(src):
    return np.asarray(Image.open(ROOT / src).convert("RGB").resize((N, N), Image.LANCZOS)).astype(float) / 255

def clean(fg):
    fg = nd.binary_opening(fg, iterations=2); fg = nd.binary_closing(fg, iterations=3); fg = nd.binary_fill_holes(fg)
    lab, n = nd.label(fg)
    if n:
        s = nd.sum(fg, lab, range(1, n + 1)); fg = lab == (int(np.argmax(s)) + 1)
    return fg

_RB = None
def seg(src):
    """Product silhouette (N×N bool). rembg (isnet-general-use) when installed, else a background-model + GrabCut fallback."""
    global _RB
    try:
        if _RB is None:
            from rembg import new_session
            _RB = new_session("isnet-general-use")
        from rembg import remove
        mk = remove(Image.open(ROOT / src).convert("RGB"), session=_RB, only_mask=True).convert("L").resize((N, N), Image.BILINEAR)
        fg = clean(np.asarray(mk) > 128)
        if 0.003 < fg.mean() < 0.95: return fg
    except ImportError:
        _RB = False
    return seg_fallback(src)

def seg_fallback(src):
    a = load(src); lab = color.rgb2lab(a)
    yy, xx = np.mgrid[0:N, 0:N] / N
    B = np.zeros((N, N), bool); B[:8] = B[-8:] = B[:, :8] = B[:, -8:] = True
    A = np.stack([np.ones_like(xx), xx, yy, xx * yy, xx ** 2, yy ** 2], -1)
    model = np.zeros_like(lab)
    for c in range(3):
        co, *_ = np.linalg.lstsq(A[B], lab[..., c][B], rcond=None); model[..., c] = A @ co
    dist = np.sqrt(((lab - model) ** 2).sum(-1))
    g = np.full((N, N), cv2.GC_PR_BGD, np.uint8); g[dist > 5] = cv2.GC_PR_FGD; g[B] = cv2.GC_BGD
    img = (a * 255).astype(np.uint8)[..., ::-1].copy()
    try:
        cv2.grabCut(img, g, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
        fg = clean((g == 1) | (g == 3))
    except cv2.error:
        fg = clean(dist > 5)
    return fg

def bbox(m):
    ys, xs = np.nonzero(m)
    return (xs.min(), ys.min(), xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min()) if len(xs) else (0, 0, N, N)

def face_quad(m):
    """4-corner polygon of a flat product's visible face (TL, TR, BR, BL) or None."""
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: return None
    c = max(cs, key=cv2.contourArea); ca = cv2.contourArea(c)
    if ca < 50: return None
    hull = cv2.convexHull(c); per = cv2.arcLength(hull, True)
    for eps in (0.01, 0.02, 0.03, 0.045, 0.06, 0.08):
        ap = cv2.approxPolyDP(hull, eps * per, True)
        if len(ap) == 4:
            q = ap[:, 0, :].astype(float)
            if cv2.contourArea(q.astype(np.float32)) / ca < 0.88: return None
            q = order(q)
            if min(np.linalg.norm(q - np.roll(q, 1, 0), axis=1)) < 0.03 * N: return None
            return q
        if len(ap) < 4: break
    return None

def order(q):
    """TL, TR, BR, BL: sort clockwise around the centroid (image y points down), start at the top-left-most corner."""
    c = q.mean(0); ang = np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0]); q = q[np.argsort(ang)]
    k = int(np.argmin(q.sum(1))); return np.roll(q, -k, axis=0)

def inscribed(mask, aspect, target):
    """Largest axis-aligned rect with w/h=aspect fully inside mask, nearest to target centre (x, y)."""
    S = np.pad(mask.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    tx, ty = target
    def pos(h):
        w = max(1, int(round(h * aspect)))
        if w > N or h > N: return None
        tot = S[h:, w:] - S[:-h, w:] - S[h:, :-w] + S[:-h, :-w]
        ys, xs = np.nonzero(tot == w * h)
        if not len(ys): return None
        d = (ys + h / 2 - ty) ** 2 + (xs + w / 2 - tx) ** 2; k = np.argmin(d)
        return xs[k], ys[k], w, h
    lo, hi, r = 2, N, None
    while lo <= hi:
        mid = (lo + hi) // 2; q = pos(mid)
        if q: r, lo = q, mid + 1
        else: hi = mid - 1
    return r

def save_mask(fg, src):
    """Silhouette of the product in a view photo → assets/mockups/<stem>-vmask.png (white, alpha = product)."""
    stem = Path(src).stem; out = Path(src).parent / f"{stem}-vmask.png"
    a = Image.fromarray((nd.binary_dilation(fg, iterations=1) * 255).astype(np.uint8)).resize((512, 512), Image.BILINEAR)
    im = Image.new("LA", (512, 512), 255); im.putalpha(a); im.save(ROOT / out, optimize=True)
    return str(out)

def rect_quad(x, y, w, h): return np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], float)
def qarea(q): return abs(cv2.contourArea(np.asarray(q, np.float32)))
def pct(q): return [[round(float(x) * 100 / N, 2), round(float(y) * 100 / N, 2)] for x, y in q]

def compute(p):
    m = p["mockup_photo"]; views = m.get("views") or {}
    ax, ay, aw, ah = [v * N / 100 for v in m["area"]]
    fa = rect_quad(ax, ay, aw, ah); A = aw / ah
    ffg = seg(m["src"]); fb = bbox(ffg)
    flat = p["shape"] in FLAT or (p["shape"] == "acrylic")
    fq = face_quad(ffg) if flat else None
    if fq is not None and (cv2.pointPolygonTest(fq.astype(np.float32).reshape(-1, 1, 2), (ax + aw / 2, ay + ah / 2), False) < 0 or qarea(fq) < 0.8 * aw * ah):
        fq = None
    if fq is None and flat: fq_src, src_mask = rect_quad(ax, ay, aw, ah), False  # tilt just the printed face
    elif fq is None and p["shape"] == "round": fq_src, src_mask = rect_quad(*fb), True  # discs (coaster, keychain…): whole silhouette
    else: fq_src, src_mask = fq, True
    out = {}
    for v in ("back", "side"):
        src = views.get(v)
        if not src or src == m["src"] or not (ROOT / src).exists(): continue
        vfg = seg(src); vb = bbox(vfg)
        mask_src = save_mask(vfg, src)
        if vfg.mean() < 0.005 or vfg.mean() > 0.9: vfg = np.zeros((N, N), bool); vfg[vb[1]:vb[1]+vb[3], vb[0]:vb[0]+vb[2]] = True
        res = None
        vq = face_quad(vfg) if flat else None
        if fq is not None and vq is not None:
            Hf = cv2.getPerspectiveTransform(fq.astype(np.float32), np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]))
            Hv = cv2.getPerspectiveTransform(np.float32([[0, 0], [1, 0], [1, 1], [0, 1]]), vq.astype(np.float32))
            uv = cv2.perspectiveTransform(fa.reshape(-1, 1, 2).astype(np.float32), Hf)
            uv = np.clip(uv, 0, 1)
            q = cv2.perspectiveTransform(uv, Hv).reshape(-1, 2)
            res = {"quad": q, "how": "face"}
        if res is None:
            # map the print-area centre through the bounding boxes, then fit inside the view silhouette
            cx = vb[0] + ((ax + aw / 2) - fb[0]) / fb[2] * vb[2]; cy = vb[1] + ((ay + ah / 2) - fb[1]) / fb[3] * vb[3]
            fr = inscribed(ffg, A, (ax + aw / 2, ay + ah / 2)); fill = min(1.0, ah / fr[3]) if fr else 0.8
            fill = max(0.55, fill)
            best = None
            for f in ((1.0,) if v == "back" else (1.0, 0.85, 0.7, 0.55, 0.45)):
                r = inscribed(vfg, A * f, (cx, cy))
                if not r: continue
                sc = r[3] * (0.6 + 0.4 * f)
                if best is None or sc > best[0]: best = (sc, r)
            if best:
                x, y, w, h = best[1]; w2, h2 = w * fill, h * fill
                # keep the same physical size ratio as the front (relative to the product height)
                k = min(1.0, (ah / fb[3]) * vb[3] / h2) if h2 else 1
                w2, h2 = w2 * k if k < 1 else w2, h2 * k if k < 1 else h2
                res = {"quad": rect_quad(x + (w - w2) / 2, y + (h - h2) / 2, w2, h2), "how": "fit"}
        # edge-on / too small to show the artwork → show the front tilted in perspective instead
        too_small = res is None or qarea(res["quad"]) < 0.22 * aw * ah * (vb[3] / fb[3]) ** 2 or min(np.ptp(res["quad"][:, 0]), np.ptp(res["quad"][:, 1])) < 0.06 * N
        if res is None:
            cx = vb[0] + ((ax + aw / 2) - fb[0]) / fb[2] * vb[2]; cy = vb[1] + ((ay + ah / 2) - fb[1]) / fb[3] * vb[3]
            w2, h2 = aw * vb[2] / fb[2], ah * vb[3] / fb[3]
            res = {"quad": rect_quad(cx - w2 / 2, cy - h2 / 2, w2, h2), "how": "bbox"}
        if res is not None and flat and p["shape"] not in ("sleeve", "box") and p["id"] != "slides" and v == "side":  # flat goods seen almost edge-on (spine, thin edge): squeezed to a sliver
            qw = (np.linalg.norm(res["quad"][1] - res["quad"][0]) + np.linalg.norm(res["quad"][2] - res["quad"][3])) / 2
            qh = (np.linalg.norm(res["quad"][3] - res["quad"][0]) + np.linalg.norm(res["quad"][2] - res["quad"][1])) / 2
            if qh and qw / qh < 0.5 * A: too_small = True
        if v == "back" and p["id"] in PLAIN_BACK:
            out[v] = {"plain": True, "mask": mask_src}; continue
        if v == "side" and too_small and fq_src is not None:
            s = fq_src
            cxv, cyv = 50 * N / 100, 50 * N / 100
            sw, sh = np.ptp(s[:, 0]), np.ptp(s[:, 1]); sc = min(0.62 * N / sh, 0.5 * N / sw, 1.0)
            W, Hh = sw * sc, sh * sc
            # rotateY ~35°: near (left) edge full height, far (right) edge 82 % tall, width foreshortened
            Wf = W * 0.78
            dst = np.array([[cxv - Wf / 2, cyv - Hh / 2], [cxv + Wf / 2, cyv - Hh * 0.41], [cxv + Wf / 2, cyv + Hh * 0.41], [cxv - Wf / 2, cyv + Hh / 2]])
            out[v] = {"synth": {"src": pct(s), "dst": pct(dst), "mask": save_mask(ffg, m["src"]) if src_mask else None}}
        else:
            out[v] = {"quad": pct(res["quad"]), "wrap": p["shape"] in WRAP, "mask": mask_src}
    return out

def main():
    path = ROOT / "server/data/studio-catalog.json"; cat = json.loads(path.read_text(encoding="utf-8"))
    only = set(sys.argv[1:])
    for p in cat["products"]:
        if only and p["id"] not in only: continue
        m = p.get("mockup_photo") or {}
        if not m.get("src") or not m.get("area"): continue
        va = compute(p); va.update(m.get("view_areas_manual") or {})
        m["view_areas"] = va
        print(p["id"], {k: ("synth" if "synth" in x else "quad") for k, x in va.items()})
    path.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
