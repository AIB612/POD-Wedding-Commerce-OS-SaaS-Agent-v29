"""Standardised, white-label product renders for POD Studio — all products, one studio look.

Every product: blank (no print), same studio backdrop, same top-left light, soft ground shadow, front view.
Three files per product in assets/mockups/:
  <id>.jpg        base render
  <id>-mask.png   alpha = printable product area (recolouring keeps the shading)
  <id>-shade.jpg  grey shading map, white = no change (the design follows folds / curvature)
plus studio-mockup-assets.js (embedded copies for file:// use); print areas are printed as JSON.

These are procedural renders made from scratch. To use AI-generated or photographed images instead, follow
docs/MOCKUP_PROMPTS.md and keep the same file names / print areas.
Run: python3 scripts/generate_mockups.py   (numpy, pillow, scipy)
"""
import base64, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter

N, SS, OUTPX = 1000, 2, 800
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "mockups")
rng = np.random.default_rng(7)
XX, YY = np.meshgrid(np.arange(N), np.arange(N))
WHITE = (247, 246, 243)


# ------------------------------------------------------------------ primitives
def P(points, s):
    return [(x * s, y * s) for x, y in points]


def mk(fn):
    im = Image.new("L", (N * SS, N * SS), 0)
    fn(ImageDraw.Draw(im), SS)
    return np.asarray(im.resize((N, N), Image.LANCZOS), dtype=np.float32) / 255.0


def poly(pts): return mk(lambda d, s: d.polygon(P(pts, s), fill=255))
def rrect(x0, y0, x1, y1, r): return mk(lambda d, s: d.rounded_rectangle(P([(x0, y0), (x1, y1)], s), radius=r * s, fill=255))
def ell(x0, y0, x1, y1): return mk(lambda d, s: d.ellipse(P([(x0, y0), (x1, y1)], s), fill=255))
def ring(x0, y0, x1, y1, w): return mk(lambda d, s: d.ellipse(P([(x0, y0), (x1, y1)], s), outline=255, width=max(1, int(w * s))))
def line(pts, w): return mk(lambda d, s: d.line(P(pts, s), fill=255, width=max(1, int(w * s)), joint="curve"))
def U(*ms): return np.clip(sum(ms), 0, 1)


def backdrop():
    y = np.linspace(0, 1, N)[:, None]
    top, bot = np.array([244, 239, 233], np.float32), np.array([229, 221, 211], np.float32)
    bg = top[None, None, :] + (bot - top)[None, None, :] * y[..., None]
    xx, yy = np.meshgrid(np.linspace(-1, 1, N), np.linspace(-1, 1, N))
    return (bg * (1 - 0.10 * (xx ** 2 + yy ** 2))[..., None]).astype(np.float32)


def grain(strength=0.006, scale=1.8):
    n = gaussian_filter(rng.standard_normal((N, N)), scale)
    return 1 + strength * n / (n.std() + 1e-6)


def weave(strength=0.02, f=0.9): return 1 + strength * np.sin(XX * f) * np.sin(YY * f)


def light(amount=0.07):
    xx, yy = np.meshgrid(np.linspace(-1, 1, N), np.linspace(-1, 1, N))
    return 1 - amount * (0.82 * xx + 0.57 * yy) * 0.6


def ao(mask, reach=36, depth=0.2): return 1 - depth * np.exp(-distance_transform_edt(mask > 0.5) / reach)
def dome(mask, reach=90, lo=0.8): return lo + (1.02 - lo) * (1 - np.exp(-distance_transform_edt(mask > 0.5) / reach))


def ridge(px, py, angle, length, width, depth):
    dx, dy = math.cos(angle), math.sin(angle)
    t = np.clip((XX - px) * dx + (YY - py) * dy, -length / 2, length / 2)
    d = np.hypot(XX - (px + t * dx), YY - (py + t * dy))
    taper = 1 - (np.abs(t) / (length / 2)) ** 2
    return 1 - depth * taper * (np.exp(-(d / width) ** 2) - 0.45 * np.exp(-((d - width * 1.4) / width) ** 2))


def cyl(x0, x1, spec=0.10):
    u = np.clip((XX - x0) / max(1, x1 - x0), 0, 1)
    return 0.72 + 0.34 * np.sin(np.pi * u) ** 0.6 + spec * np.exp(-((u - 0.28) / 0.05) ** 2)


def gloss(x0, y0, x1, y1, amount=0.08):
    t = np.clip(((XX - x0) + (YY - y0)) / max(1, (x1 - x0) + (y1 - y0)), 0, 1)
    return 1 + amount * np.exp(-((t - 0.25) / 0.08) ** 2)


def shadow(bg, mask, dx=0, dy=16, blur=24, k=0.33):
    sh = gaussian_filter(np.roll(np.roll(mask, dy, 0), dx, 1), blur)
    return bg * (1 - k * sh[..., None])


def paint(rgb, mask, shade, color):
    c = np.array(color, np.float32)[None, None, :] * shade[..., None]
    return rgb * (1 - mask[..., None]) + c * mask[..., None]


class R:
    """One render on the standard backdrop. `mask`/`shade` describe the printable (recolourable) product."""
    def __init__(self, silhouette, shadow_kw=None):
        self.sil = silhouette  # full object incl. non-printable parts (used for scene compositions)
        self.rgb = shadow(backdrop(), silhouette, **(shadow_kw or {}))
        self.mask = np.zeros((N, N), np.float32)
        self.shade = np.ones((N, N), np.float32)

    def body(self, mask, shade, color=WHITE):
        shade = np.clip(shade * np.ones((N, N)), 0.2, 1.12)
        self.rgb = paint(self.rgb, mask, shade, color)
        self.mask = U(self.mask, mask)
        self.shade = np.where(mask > 0.02, np.clip(shade, 0.2, 1.0), self.shade)
        return self

    def part(self, mask, color, shade=None):  # non-printable parts (lids, handles, hardware …)
        sh = np.ones((N, N)) if shade is None else np.clip(shade * np.ones((N, N)), 0.2, 1.15)
        self.rgb = paint(self.rgb, mask, sh, color)
        self.mask = np.clip(self.mask - mask, 0, 1)
        return self


def save(pid, r, area):
    os.makedirs(OUT, exist_ok=True)
    rs = lambda a: Image.fromarray(a).resize((OUTPX, OUTPX), Image.LANCZOS)
    rs(np.clip(r.rgb, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f"{pid}.jpg"), quality=82, optimize=True, progressive=True)
    a = rs((np.clip(r.mask, 0, 1) * 255).astype(np.uint8))
    Image.merge("LA", (Image.new("L", (OUTPX, OUTPX), 255), a)).save(os.path.join(OUT, f"{pid}-mask.png"), optimize=True)
    s = np.where(r.mask > 0.02, np.clip(r.shade, 0, 1), 1.0)
    rs((s * 255).astype(np.uint8)).save(os.path.join(OUT, f"{pid}-shade.jpg"), quality=88)
    # build cache (not shipped): RGBA cut-out of the whole object for scripts/build_scenes.py
    cut_dir = os.path.join(ROOT, "scripts", ".cache", "cuts"); os.makedirs(cut_dir, exist_ok=True)
    sil = np.clip(np.maximum(r.sil, r.mask), 0, 1)
    cut = Image.fromarray(np.clip(r.rgb, 0, 255).astype(np.uint8)).convert("RGBA"); cut.putalpha(Image.fromarray((sil * 255).astype(np.uint8)))
    cut = cut.crop(cut.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()); cut.thumbnail((520, 520), Image.LANCZOS); cut.save(os.path.join(cut_dir, f"{pid}.png"))
    return {"src": f"assets/mockups/{pid}.jpg", "mask": f"assets/mockups/{pid}-mask.png", "shade": f"assets/mockups/{pid}-shade.jpg", "area": [round(v / 10, 2) for v in area]}


# ------------------------------------------------------------------ apparel
SHORT = [(330, 190), (420, 165), (500, 205), (580, 165), (670, 190), (830, 270), (900, 420), (790, 470), (730, 400), (735, 880), (500, 905), (265, 880), (270, 400), (210, 470), (100, 420), (170, 270)]
LONG = [(330, 200), (420, 175), (500, 215), (580, 175), (670, 200), (820, 290), (905, 690), (835, 715), (735, 430), (740, 880), (500, 905), (260, 880), (265, 430), (165, 715), (95, 690), (180, 290)]


def garment(pid, kind, area, color=WHITE):
    m = poly(LONG if kind in ("hoodie", "sweater", "jacket", "fleece") else SHORT)
    if kind == "hoodie":
        m = U(m, poly([(360, 230), (390, 120), (450, 75), (550, 75), (610, 120), (640, 230), (560, 260), (440, 260)]))
    if kind in ("jacket", "fleece"):
        m = U(m, poly([(400, 170), (500, 140), (600, 170), (590, 230), (410, 230)]))
    sh = ao(m) * light() * grain()
    for a in [(330, 560, 1.25, 260, 16, .10), (690, 600, 1.9, 240, 14, .09), (500, 820, .05, 330, 12, .07), (590, 720, 2.4, 200, 12, .06)]:
        sh = sh * ridge(*a)
    if kind in ("tee", "polo"):
        sh = sh * (1 - .16 * ell(440, 168, 560, 238) - .07 * ring(432, 162, 568, 246, 12))
    if kind == "polo":
        sh = sh * (1 - .12 * line([(440, 175), (500, 250), (560, 175)], 8) - .10 * line([(500, 250), (500, 360)], 5))
        for y in (285, 325): sh = sh * (1 - .25 * ell(494, y - 6, 506, y + 6))
    if kind == "hoodie":
        sh = sh * (1 - .30 * ell(430, 120, 570, 250) - .07 * ring(418, 108, 582, 262, 14))
        sh = sh * (1 - .10 * mk(lambda d, s: d.polygon(P([(380, 640), (620, 640), (660, 820), (340, 820)], s), outline=255, width=5 * s)))
        for x in (470, 530): sh = sh * ridge(x, 330, 1.57, 150, 4, .18)
    if kind == "sweater":
        sh = sh * (1 - .18 * ell(445, 175, 555, 240)) * weave(.03, .6)
        for y in range(850, 900, 9): sh = sh * (1 - .05 * line([(265, y), (735, y)], 3))
    if kind in ("jacket", "fleece"):
        sh = sh * (1 - .08 * line([(410, 230), (500, 200), (590, 230)], 8))
        if kind == "fleece": sh = sh * grain(.03, 3.5)
    r = R(m).body(m, sh, color)
    if kind in ("jacket", "fleece"):
        r.part(line([(500, 205), (500, 895)], 5), (150, 150, 150))
    return save(pid, r, area)


def baby_body(pid):
    m = poly([(380, 230), (440, 210), (500, 245), (560, 210), (620, 230), (760, 300), (800, 420), (700, 450), (680, 420), (690, 700), (640, 820), (560, 860), (540, 800), (460, 800), (440, 860), (360, 820), (310, 700), (320, 420), (300, 450), (200, 420), (240, 300)])
    sh = ao(m) * light() * grain() * ridge(500, 600, 1.5, 300, 14, .06)
    sh = sh * (1 - .15 * ell(450, 215, 550, 270) - .06 * ring(442, 208, 558, 276, 10))
    return save(pid, R(m).body(m, sh), (390, 330, 220, 220))


def leggings(pid):
    m = poly([(380, 110), (620, 110), (650, 900), (545, 905), (505, 330), (495, 330), (455, 905), (350, 900)])
    sh = ao(m, 28) * light() * grain() * ridge(500, 125, 0, 240, 8, .12) * ridge(430, 600, 1.55, 400, 10, .06) * ridge(570, 600, 1.59, 400, 10, .06)
    return save(pid, R(m).body(m, sh, (240, 238, 234)), (350, 110, 300, 795))


def apron(pid):
    strap = ring(380, 40, 620, 330, 16) * (YY < 200)
    m = poly([(360, 190), (640, 190), (650, 370), (790, 420), (780, 900), (220, 900), (210, 420), (350, 370)])
    sh = ao(m) * light() * weave(.02) * grain() * ridge(500, 880, 0, 500, 10, .06)
    sh = sh * (1 - .09 * mk(lambda d, s: d.rectangle(P([(300, 620), (700, 760)], s), outline=255, width=4 * s)))
    r = R(U(m, strap)).body(m, sh, (233, 222, 203)).part(strap, (176, 164, 146))
    for x, dx in ((215, -90), (785, 90)): r.part(line([(x, 420), (x + dx, 520)], 14), (176, 164, 146))
    return save(pid, r, (320, 400, 360, 190))


def cap(pid):
    crown = mk(lambda d, s: d.chord(P([(230, 260), (770, 820)], s), 180, 360, fill=255))
    brim = ell(200, 500, 800, 640) * (YY > 535)
    sh = dome(crown, 120, .75) * light() * weave(.02)
    for x in (390, 500, 610): sh = sh * (1 - .07 * line([(500, 262), (x, 540)], 4))
    r = R(U(crown, brim)).body(crown, sh, (52, 62, 74)).part(brim, (44, 52, 62), .85).part(ell(486, 252, 514, 278), (40, 48, 58))
    return save(pid, r, (400, 380, 200, 100))


def bandana(pid):
    m = poly([(150, 260), (850, 260), (500, 820)])
    sh = ao(m, 30) * light() * grain() * ridge(500, 400, 0, 600, 12, .06) * ridge(420, 500, 1.0, 300, 10, .05)
    return save(pid, R(m).body(m, sh), (250, 270, 500, 330))


def gaiter(pid):
    m = rrect(330, 150, 670, 860, 40)
    sh = cyl(330, 670, .04) * grain() * weave(.015) * ridge(500, 200, 0, 340, 10, .08) * ridge(500, 820, 0, 340, 10, .08)
    return save(pid, R(m).body(m, sh), (340, 170, 320, 670))


# ------------------------------------------------------------------ drinkware
def mug(pid, x0=280, x1=680, y0=300, y1=820, color=WHITE, rim=None, inside=(150, 146, 140)):
    body = rrect(x0, y0, x1, y1, 26)
    hx = x1 - 70
    handle = ring(hx, y0 + (y1 - y0) * .2, hx + (x1 - x0) * .52, y0 + (y1 - y0) * .78, (x1 - x0) * .115) * (XX > x1 - 20)
    top = ell(x0, y0 - 22, x1, y0 + 28)
    r = R(U(body, handle, top)).body(body, cyl(x0, x1), color)
    r.part(handle, color, .84).part(top, rim or color, .92).part(ell(x0 + 16, y0 - 14, x1 - 16, y0 + 22), inside)
    if rim: r.part(ring(x0, y0 - 22, x1, y0 + 28, 8), rim)
    w, h = x1 - x0, y1 - y0
    return save(pid, r, (x0 + w * .08, y0 + h * .12, w * .84, h * .76))


def tumbler(pid):
    body = poly([(370, 220), (630, 220), (605, 880), (395, 880)])
    lid = rrect(355, 150, 645, 235, 22)
    r = R(U(body, lid)).body(body, cyl(370, 630), (226, 229, 232)).part(lid, (58, 58, 58), cyl(355, 645) * .95)
    return save(pid, r, (390, 340, 220, 440))


def bottle(pid, color=(226, 229, 232), x0=380, x1=620):
    body = rrect(x0, 300, x1, 880, 60)
    neck = poly([(x0 + 40, 300), (x1 - 40, 300), (x1 - 70, 220), (x0 + 70, 220)])
    capm = rrect(x0 + 60, 140, x1 - 60, 225, 16)
    r = R(U(body, neck, capm)).body(body, cyl(x0, x1), color).part(neck, color, cyl(x0, x1) * .95).part(capm, (54, 54, 56), cyl(x0, x1) * .9)
    return save(pid, r, (x0 + 20, 400, x1 - x0 - 40, 380))


def candle(pid):
    jar = rrect(320, 280, 680, 860, 40)
    label = rrect(345, 470, 655, 720, 8)
    r = R(U(jar, rrect(310, 230, 690, 300, 20))).part(jar, (214, 208, 200), cyl(320, 680) * .9)
    r.part(rrect(310, 230, 690, 300, 20), (66, 56, 48), cyl(310, 690) * .9).body(label, cyl(320, 680) * .98, (252, 249, 242))
    return save(pid, r, (355, 480, 290, 230))


def bowl(pid):
    body = mk(lambda d, s: d.chord(P([(200, 220), (800, 820)], s), 0, 180, fill=255)) * (YY > 500)
    top = ell(200, 440, 800, 560)
    r = R(U(body, top)).body(body, cyl(200, 800, .05), WHITE).part(top, (236, 231, 225)).part(ell(240, 460, 760, 545), (222, 216, 209))
    return save(pid, r, (300, 600, 400, 130))


# ------------------------------------------------------------------ wall / flat
def wall(pid, style, x0=300, y0=150, x1=700, y1=683):
    frame = 30 if style == "framed" else 0
    outer = rrect(x0 - frame, y0 - frame, x1 + frame, y1 + frame, 2)
    art = rrect(x0, y0, x1, y1, 6 if style == "acrylic" else 2)
    r = R(outer, {"dx": 10, "dy": 16, "blur": 18, "k": .28})
    if style == "framed": r.part(outer * (1 - art), (92, 66, 44), light(.1) * .9)
    sh = light(.03) * (weave(.02) if style == "canvas" else 1) * (gloss(x0, y0, x1, y1, .09) if style in ("metal", "acrylic", "framed") else 1)
    r.body(art, sh, (250, 249, 246))
    if style == "canvas":
        r.part(poly([(x1, y0), (x1 + 22, y0 + 16), (x1 + 22, y1 + 16), (x1, y1)]), (214, 210, 203))
        r.part(poly([(x0, y1), (x1, y1), (x1 + 22, y1 + 16), (x0 + 22, y1 + 16)]), (196, 191, 184))
    if style == "acrylic":
        for cx, cy in [(x0 + 24, y0 + 24), (x1 - 24, y0 + 24), (x0 + 24, y1 - 24), (x1 - 24, y1 - 24)]:
            r.part(ell(cx - 12, cy - 12, cx + 12, cy + 12), (196, 190, 182), light(.2))
    return save(pid, r, (x0, y0, x1 - x0, y1 - y0))


def tapestry(pid):
    cloth = poly([(170, 160), (830, 160), (835, 880), (165, 880)])
    sh = light(.04) * grain() * weave(.02)
    for x in range(260, 800, 140): sh = sh * ridge(x, 520, 1.57, 700, 18, .05)
    r = R(cloth).body(cloth, sh).part(rrect(140, 140, 860, 168, 8), (120, 92, 66))
    return save(pid, r, (170, 170, 660, 700))


def rug(pid):
    m = rrect(140, 250, 860, 750, 6)
    r = R(m, {"dy": 8, "blur": 12, "k": .3}).body(m, light(.04) * weave(.035, .5) * grain(.02, 1.5), (240, 236, 228))
    fr = U(*[line([(x, 250), (x, 228)], 4) + line([(x, 750), (x, 772)], 4) for x in range(146, 860, 14)])
    r.part(fr, (230, 224, 214))
    return save(pid, r, (150, 260, 700, 480))


def puzzle(pid):
    m = rrect(170, 260, 830, 760, 4)
    sh = light(.03) * (1 - .05 * U(*[line([(170 + i * 82, 260), (170 + i * 82, 760)], 3) for i in range(1, 8)], *[line([(170, 260 + j * 83), (830, 260 + j * 83)], 3) for j in range(1, 6)]))
    return save(pid, R(m, {"dy": 8, "blur": 12, "k": .26}).body(m, sh), (170, 260, 660, 500))


def banner(pid):
    m = rrect(90, 360, 910, 640, 4)
    r = R(m, {"dy": 10, "blur": 14}).body(m, light(.04) * ridge(500, 500, 0, 800, 30, .04) * grain())
    r.part(U(line([(40, 250), (110, 365)], 4), line([(960, 250), (890, 365)], 4)), (140, 128, 114)).part(U(ell(98, 368, 122, 392), ell(878, 368, 902, 392)), (180, 180, 180))
    return save(pid, r, (100, 370, 800, 260))


def wrap(pid):
    sheet, roll = rrect(120, 200, 760, 800, 4), rrect(740, 180, 860, 820, 50)
    r = R(U(sheet, roll)).body(sheet, light(.03) * grain(.008)).part(roll, WHITE, cyl(740, 860) * .95)
    return save(pid, r, (120, 200, 620, 600))


def card(pid, x0, y0, x1, y1, color=(252, 249, 242), folded=False):
    m = rrect(x0, y0, x1, y1, 3)
    sh = light(.03) * grain(.008, .8)
    if folded: sh = sh * (1 - .08 * (XX > (x0 + x1) / 2))
    r = R(m, {"dx": 6, "dy": 10, "blur": 12, "k": .25}).body(m, sh, color)
    if folded: r.part(line([((x0 + x1) / 2, y0), ((x0 + x1) / 2, y1)], 3), (226, 220, 210))
    pad = 0.04 * (x1 - x0)
    area = ((x0 + x1) / 2 + pad, y0 + pad, (x1 - x0) / 2 - 2 * pad, y1 - y0 - 2 * pad) if folded else (x0 + pad, y0 + pad, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad)
    return save(pid, r, area)


def notebook(pid):
    m = rrect(320, 140, 720, 860, 10)
    r = R(m).body(m, light(.03) * grain(.008), (250, 248, 244))
    r.part(U(*[ring(296, y, 336, y + 22, 5) for y in range(170, 840, 32)]), (110, 110, 112))
    return save(pid, r, (350, 170, 350, 660))


def sticker(pid, x0=280, y0=280, x1=720, y1=720):
    m = rrect(x0, y0, x1, y1, 70)
    pad = (x1 - x0) * .1
    return save(pid, R(m, {"dy": 8, "blur": 12, "k": .25}).body(m, light(.03) * gloss(x0, y0, x1, y1, .05)), (x0 + pad, y0 + pad, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad))


def phone_case(pid):
    m = rrect(330, 110, 670, 890, 70)
    sh = (0.86 + 0.16 * (1 - np.exp(-distance_transform_edt(m > .5) / 18))) * light(.05)
    r = R(m, {"dx": 8, "dy": 16, "blur": 22}).body(m, sh).part(rrect(360, 140, 500, 290, 34), (38, 38, 40)).part(U(ell(375, 155, 435, 215), ell(425, 215, 485, 275)), (12, 12, 14))
    return save(pid, r, (330, 110, 340, 780))


def popsocket(pid):
    phone, disc = rrect(300, 90, 700, 910, 60), ell(380, 380, 620, 620)
    r = R(U(phone, disc)).part(phone, (44, 44, 46), light(.1)).body(disc, dome(disc, 40, .85) * light(.05))
    return save(pid, r, (395, 395, 210, 210))


def mousepad(pid):
    m = rrect(60, 300, 940, 700, 22)
    return save(pid, R(m, {"dy": 8, "blur": 12, "k": .3}).body(m, light(.04) * weave(.015, .8), (240, 240, 238)), (70, 310, 860, 380))


# ------------------------------------------------------------------ home / bags / objects
def pillow(pid, x0=190, y0=220, x1=810, y1=830, rad=70, bolster=False):
    m = rrect(x0, y0, x1, y1, rad)
    sh = dome(m, 90) * light(.08) * grain() * weave(.008)
    for cx, cy, a in [(x0 + 30, y0 + 30, .8), (x1 - 30, y0 + 30, 2.3), (x0 + 30, y1 - 30, -.8), (x1 - 30, y1 - 30, -2.3)]:
        sh = sh * ridge(cx, cy, a, 130, 10, .12)
    r = R(m, {"dy": 20, "blur": 30})
    if bolster:
        inner = rrect(x0 + 80, y0 + 80, x1 - 80, y1 - 80, rad - 40)
        r.part(m * (1 - inner), (236, 232, 226), sh * dome(m * (1 - inner) + inner, 40, .85))
        r.body(inner, dome(inner, 70, .82) * light(.05) * grain(), WHITE)
        return save(pid, r, (x0 + 90, y0 + 90, x1 - x0 - 180, y1 - y0 - 180))
    r.body(m, sh)
    return save(pid, r, (x0 + 30, y0 + 30, x1 - x0 - 60, y1 - y0 - 60))


def tote(pid):
    b = poly([(250, 330), (750, 330), (775, 900), (225, 900)])
    h = U(*[mk(lambda d, s, x0=x0: d.arc(P([(x0, 120), (x0 + 110, 520)], s), 180, 360, fill=255, width=26 * s)) for x0 in (330, 560)]) * (1 - b)
    sh = ao(b, 30, .18) * light(.06) * weave(.02) * grain() * ridge(500, 880, 0, 480, 10, .08) * ridge(300, 620, 1.5, 300, 14, .06)
    r = R(U(b, h), {"dy": 14}).body(b, sh, (242, 234, 218)).part(h, (226, 216, 196), .9)
    return save(pid, r, (320, 400, 360, 420))


def sleeve(pid, x0=150, y0=280, x1=850, y1=720, color=(66, 66, 70)):
    m = rrect(x0, y0, x1, y1, 40)
    r = R(m).body(m, dome(m, 60, .86) * light(.05) * weave(.01), color).part(line([(x0 + 40, y0 + 6), (x1 - 40, y0 + 6)], 6), (200, 196, 190))
    return save(pid, r, (x0 + 40, y0 + 40, x1 - x0 - 80, y1 - y0 - 80))


def backpack(pid):
    body, pocket = rrect(270, 150, 730, 900, 120), rrect(340, 520, 660, 860, 50)
    top = mk(lambda d, s: d.arc(P([(420, 70), (580, 230)], s), 180, 360, fill=255, width=22 * s))
    r = R(U(body, top)).part(body, (52, 52, 54), dome(body, 80, .8) * light(.06)).part(top, (40, 40, 42))
    r.body(pocket, dome(pocket, 40, .85) * light(.05), (62, 62, 64)).part(line([(345, 528), (655, 528)], 5), (150, 150, 150))
    return save(pid, r, (370, 560, 260, 270))


def standee(pid, x0, y0, x1, y1, base=True, easel=False):
    plate = rrect(x0, y0, x1, y1, 10)
    foot = rrect(x0 - 30, y1 - 10, x1 + 30, y1 + 50, 10)
    r = R(U(plate, foot) if base else plate, {"dy": 12, "blur": 16, "k": .25})
    if easel:
        r.part(U(line([(x0 + 60, y1), (x0 - 20, 960)], 14), line([(x1 - 60, y1), (x1 + 20, 960)], 14), line([(500, y0 + 80), (500, 960)], 14)), (150, 118, 86))
    if base: r.part(foot, (200, 194, 186), light(.1))
    r.body(plate, light(.03) * gloss(x0, y0, x1, y1, .12), (246, 246, 244))
    if base: r.part(foot * plate, (200, 194, 186), light(.1))
    return save(pid, r, (x0 + 15, y0 + 15, x1 - x0 - 30, (y1 - y0 - 40) if base else (y1 - y0 - 30)))


def acrylic_block(pid):
    m = rrect(300, 200, 700, 760, 8)
    r = R(m, {"dy": 14, "blur": 20}).body(m, light(.03) * gloss(300, 200, 700, 760, .14), (246, 247, 247))
    r.part(poly([(700, 210), (740, 240), (740, 780), (700, 760)]), (214, 220, 222)).part(poly([(310, 760), (700, 760), (740, 780), (350, 780)]), (200, 206, 208))
    return save(pid, r, (320, 220, 360, 520))


def ornament(pid):
    ball, capm = ell(300, 300, 700, 700), rrect(460, 260, 540, 315, 8)
    r = R(U(ball, capm)).body(ball, dome(ball, 110, .7) * gloss(300, 300, 700, 700, .12))
    r.part(capm, (196, 166, 106), light(.15)).part(ring(482, 220, 518, 270, 5), (196, 166, 106)).part(line([(500, 60), (500, 222)], 3), (150, 130, 110))
    return save(pid, r, (370, 370, 260, 260))


def pendant(pid):
    disc = ell(390, 420, 610, 640)
    chain = mk(lambda d, s: d.arc(P([(250, -120), (750, 460)], s), 20, 160, fill=255, width=5 * s))
    r = R(U(disc, chain), {"dy": 8, "blur": 10, "k": .22}).body(disc, dome(disc, 30, .78) * gloss(390, 420, 610, 640, .2), (222, 204, 160))
    r.part(chain, (200, 182, 140)).part(ring(488, 395, 512, 428, 6), (200, 182, 140))
    return save(pid, r, (420, 450, 160, 160))


def luggage_tag(pid):
    m = poly([(380, 260), (620, 260), (620, 840), (380, 840), (380, 300)])
    r = R(m).body(m, dome(m, 30, .85) * light(.08) * grain(.02, 1.4), (139, 90, 60))
    r.part(ell(487, 287, 513, 313), (229, 221, 211)).part(line([(500, 300), (560, 160), (680, 110)], 10), (92, 58, 38))
    return save(pid, r, (410, 360, 180, 440))


def lanyard(pid):
    strap = U(line([(330, 60), (490, 640)], 34), line([(670, 60), (510, 640)], 34))
    clip, badge = rrect(470, 630, 530, 700, 10), rrect(380, 700, 620, 900, 12)
    r = R(U(strap, clip, badge)).body(strap * (1 - clip), light(.05) * weave(.03, 1.2), (60, 72, 88))
    r.part(clip, (160, 166, 170), light(.15)).part(badge, (250, 250, 250), light(.04))
    return save(pid, r, (330, 60, 340, 580))


def gift_box(pid):
    front, lid = rrect(240, 360, 760, 860, 6), rrect(210, 280, 790, 400, 6)
    r = R(U(front, lid)).body(front * (1 - lid), light(.06) * ao(front, 20, .1) * .92, (200, 176, 140)).body(lid, light(.05) * ao(lid, 14, .08), (214, 192, 156))
    return save(pid, r, (330, 470, 340, 300))


def stocking(pid):
    m = poly([(380, 230), (630, 230), (630, 640), (650, 760), (600, 840), (440, 870), (300, 850), (280, 760), (340, 700), (380, 640)])
    cuff = rrect(350, 140, 660, 250, 18)
    r = R(U(m, cuff)).body(m * (1 - cuff), ao(m) * light() * grain() * weave(.02), (232, 230, 226)).part(cuff, WHITE, grain(.03, 3) * light(.05))
    return save(pid, r, (390, 280, 230, 340))


def build():
    return {
        "tee": garment("tee", "tee", (360, 300, 280, 360)), "hoodie": garment("hoodie", "hoodie", (370, 340, 260, 260)),
        "polo_emb": garment("polo_emb", "polo", (565, 300, 110, 110)), "fleece": garment("fleece", "fleece", (560, 300, 110, 110)),
        "windbreaker": garment("windbreaker", "jacket", (530, 300, 170, 220)), "xmas_sweater": garment("xmas_sweater", "sweater", (290, 280, 420, 520)),
        "baby_body": baby_body("baby_body"), "leggings": leggings("leggings"), "apron": apron("apron"), "cap_emb": cap("cap_emb"),
        "pet_bandana": bandana("pet_bandana"), "neck_gaiter": gaiter("neck_gaiter"),
        "mug": mug("mug"), "magic_mug": mug("magic_mug", color=(40, 40, 42), inside=(30, 30, 32)), "espresso": mug("espresso", 340, 600, 430, 780),
        "enamel_mug": mug("enamel_mug", 300, 660, 360, 800, rim=(42, 62, 92)), "tumbler": tumbler("tumbler"), "bottle": bottle("bottle"),
        "thermos": bottle("thermos", (205, 208, 212), 395, 605), "candle": candle("candle"), "pet_bowl": bowl("pet_bowl"),
        "poster": wall("poster", "poster"), "canvas": wall("canvas", "canvas"), "framed": wall("framed", "framed"), "metal": wall("metal", "metal"),
        "acrylic_wall": wall("acrylic_wall", "acrylic"), "tapestry": tapestry("tapestry"), "rug": rug("rug"), "puzzle": puzzle("puzzle"),
        "banner": banner("banner"), "wrap_paper": wrap("wrap_paper"), "greeting": card("greeting", 180, 290, 820, 740, folded=True),
        "postcard": card("postcard", 200, 300, 800, 720), "invitation": card("invitation", 300, 120, 700, 880), "menu_card": card("menu_card", 360, 100, 640, 900),
        "notebook": notebook("notebook"), "sticker": sticker("sticker"), "tattoo": sticker("tattoo", 340, 340, 660, 660), "phone_case": phone_case("phone_case"),
        "popsocket": popsocket("popsocket"), "mousepad_xl": mousepad("mousepad_xl"), "pillow": pillow("pillow"), "pet_bed": pillow("pet_bed", 120, 280, 880, 820, 110, bolster=True),
        "tote": tote("tote"), "laptop_sleeve": sleeve("laptop_sleeve"), "ski_case": sleeve("ski_case", 240, 350, 760, 650, (238, 238, 236)),
        "backpack": backpack("backpack"), "trophy": standee("trophy", 380, 160, 620, 760), "acrylic_stand": standee("acrylic_stand", 360, 140, 640, 780),
        "welcome_sign": standee("welcome_sign", 290, 80, 710, 720, base=False, easel=True), "photo_frame": acrylic_block("photo_frame"),
        "ornament": ornament("ornament"), "engraved_jewelry": pendant("engraved_jewelry"), "luggage_tag": luggage_tag("luggage_tag"),
        "lanyard": lanyard("lanyard"), "gift_box": gift_box("gift_box"), "stocking": stocking("stocking"),
    }


if __name__ == "__main__":
    out = build()
    assets = {}
    for v in out.values():
        for key, mime in (("src", "image/jpeg"), ("mask", "image/png"), ("shade", "image/jpeg")):
            with open(os.path.join(ROOT, v[key]), "rb") as f:
                assets[v[key]] = f"data:{mime};base64," + base64.b64encode(f.read()).decode()
    with open(os.path.join(ROOT, "studio-mockup-assets.js"), "w") as f:
        f.write("/* Generated by scripts/generate_mockups.py — embedded mockup images for file:// use. */\nwindow.STUDIO_MOCKUP_ASSETS = " + json.dumps(assets) + ";\n")
    json.dump(out, sys.stdout, indent=1)
