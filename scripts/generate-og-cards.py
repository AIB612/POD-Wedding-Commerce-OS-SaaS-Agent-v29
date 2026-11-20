#!/usr/bin/env python3
"""Generate German (de_CH, ss not ß) Open Graph / Twitter share images."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "brand"

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
GEORGIA_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
GEORGIA = "/System/Library/Fonts/Supplemental/Georgia.ttf"

# Avenir Next indices: 0 Bold, 2 Demi Bold, 5 Medium, 7 Regular
def font_avenir(size, index=7):
    return ImageFont.truetype(AVENIR, size, index=index)

def font_georgia(size, bold=True):
    return ImageFont.truetype(GEORGIA_B if bold else GEORGIA, size)

# Palette
CREAM = (246, 240, 232)
CREAM_DEEP = (238, 229, 217)
INK = (43, 37, 32)
INK_SOFT = (90, 78, 68)
GOLD = (166, 122, 72)
GOLD_LINE = (196, 160, 112)
MUTED = (138, 126, 116)
WHITE = (255, 255, 255)

W, H = 1200, 630
SQ = 600


def load_cover(path, box, crop=None):
    """Resize/crop source into `box` (w,h). crop is (l,t,r,b) in source coords or None=center cover."""
    im = Image.open(path).convert("RGB")
    tw, th = box
    if crop:
        im = im.crop(crop)
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def rounded(im, radius):
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0) + im.size, radius=radius, fill=255)
    im.putalpha(mask)
    return im


def drop_shadow(im, radius=24, offset=(0, 12), opacity=80):
    w, h = im.size
    ox, oy = offset
    pad = radius * 2
    canvas = Image.new("RGBA", (w + pad * 2 + abs(ox), h + pad * 2 + abs(oy)), (0, 0, 0, 0))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, opacity))
    if im.mode == "RGBA":
        shadow.putalpha(ImageChops_multiply_alpha(im.split()[-1], opacity))
    else:
        shadow = Image.new("L", im.size, opacity)
        sh_rgba = Image.new("RGBA", im.size, (0, 0, 0, 0))
        sh_rgba.putalpha(shadow)
        shadow = sh_rgba
    sx = pad + max(ox, 0)
    sy = pad + max(oy, 0)
    canvas.paste(shadow, (sx, sy), shadow)
    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=radius))
    canvas.alpha_composite(im.convert("RGBA"), (pad + max(-ox, 0), pad + max(-oy, 0)))
    return canvas


def ImageChops_multiply_alpha(alpha, opacity):
    # scale existing alpha by opacity/255
    return alpha.point(lambda p: int(p * opacity / 255))


def text_size(draw, text, font):
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def draw_lines(draw, lines, x, y, fonts, fills, spacings, anchor="lt"):
    """lines: list of strings; fonts/fills/spacings parallel or broadcast last."""
    cy = y
    for i, line in enumerate(lines):
        font = fonts[i] if i < len(fonts) else fonts[-1]
        fill = fills[i] if i < len(fills) else fills[-1]
        sp = spacings[i] if i < len(spacings) else spacings[-1]
        draw.text((x, cy), line, font=font, fill=fill, anchor=anchor)
        cy += sp
    return cy


def panel_card(size, photo, panel_w, panel_on="right", mark=None, brand="", brand_font=None,
               lines=None, domain="", alt_bg=CREAM):
    """Landscape card: photo + typographic panel."""
    w, h = size
    canvas = Image.new("RGB", (w, h), alt_bg)
    if panel_on == "right":
        photo_box = (w - panel_w, h)
        canvas.paste(photo.resize(photo_box) if photo.size != photo_box else photo, (0, 0))
        px = w - panel_w
    else:
        photo_box = (w - panel_w, h)
        canvas.paste(photo.resize(photo_box) if photo.size != photo_box else photo, (panel_w, 0))
        px = 0

    draw = ImageDraw.Draw(canvas)
    # panel fill already if we draw a rect (photo may not cover)
    draw.rectangle((px, 0, px + panel_w, h), fill=alt_bg)
    # gold hairline on the photo edge
    if panel_on == "right":
        draw.rectangle((px, 36, px + 3, h - 36), fill=GOLD_LINE)
    else:
        draw.rectangle((px + panel_w - 3, 36, px + panel_w, h - 36), fill=GOLD_LINE)

    # inner padding
    pad = 56
    tx = px + pad
    ty = 64

    if mark is not None:
        m = mark.convert("RGBA")
        ms = 72
        m = m.resize((ms, ms), Image.Resampling.LANCZOS)
        canvas.paste(m, (tx, ty), m)
        ty += ms + 22

    if brand:
        draw.text((tx, ty), brand, font=brand_font, fill=INK, anchor="lt")
        # move down by font metrics
        bb = draw.textbbox((tx, ty), brand, font=brand_font)
        ty = bb[3] + 18
        # gold rule
        draw.rectangle((tx, ty, tx + 72, ty + 3), fill=GOLD)
        ty += 32

    if lines:
        for item in lines:
            text, font, fill, gap = item
            draw.text((tx, ty), text, font=font, fill=fill, anchor="lt")
            bb = draw.textbbox((tx, ty), text, font=font)
            ty = bb[3] + gap

    if domain:
        df = font_avenir(20, 5)
        draw.text((tx, h - 56), domain, font=df, fill=MUTED, anchor="ls")

    return canvas


def square_card(mark, brand, tagline, domain, brand_font, tag_font):
    canvas = Image.new("RGB", (SQ, SQ), CREAM)
    draw = ImageDraw.Draw(canvas)
    # thin gold frame
    draw.rectangle((28, 28, SQ - 29, SQ - 29), outline=GOLD_LINE, width=2)

    y = 110
    if mark is not None:
        m = mark.convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
        canvas.paste(m, ((SQ - 96) // 2, y), m)
        y += 96 + 28

    # center brand
    draw.text((SQ // 2, y), brand, font=brand_font, fill=INK, anchor="mt")
    bb = draw.textbbox((SQ // 2, y), brand, font=brand_font, anchor="mt")
    y = bb[3] + 18
    # rule
    rw = 64
    draw.rectangle(((SQ - rw) // 2, y, (SQ + rw) // 2, y + 3), fill=GOLD)
    y += 28
    for line in tagline if isinstance(tagline, list) else [tagline]:
        draw.text((SQ // 2, y), line, font=tag_font, fill=INK_SOFT, anchor="mt")
        bb = draw.textbbox((SQ // 2, y), line, font=tag_font, anchor="mt")
        y = bb[3] + 8

    draw.text((SQ // 2, SQ - 56), domain, font=font_avenir(18, 5), fill=MUTED, anchor="ms")
    return canvas


def save_jpeg(im, path, quality=88):
    im = im.convert("RGB")
    im.save(path, "JPEG", quality=quality, optimize=True, subsampling=0)
    size = Path(path).stat().st_size
    q = quality
    while size > 280_000 and q > 72:
        q -= 4
        im.save(path, "JPEG", quality=q, optimize=True, subsampling=2)
        size = Path(path).stat().st_size
    print(f"  wrote {path.name:28} {im.size}  {size:7} B  q={q}")
    return path


def main():
    mark = Image.open(OUT / "mark-on-light.png")
    table = Image.open(OUT / "og-pod.jpg")  # wedding tablescape; we'll crop away LOGOs
    studio = Image.open(ROOT / "STUDIO_PREVIEW.png")
    gifts = Image.open(ROOT / "assets/scenes/gifts-1200.webp")
    chat = Image.open(ROOT / "assets/agent/admin-chat-agent-assistant.png")

    # --- POD home: floral tablescape left, typography right.
    # Crop the existing og-pod to favour flowers/glasses and hide merch LOGOs.
    # Source 1200x630; LOGOs sit mid-right (mug/tote) and a place card lower-center.
    # Use a tighter left-upper crop if we zoom slightly.
    photo_w = 720
    # Zoom into left 70% and a tad up to keep florals, then cover remaining LOGOs
    # by the right panel (panel starts at 720). Place-card "LOGO" may remain — crop left-center.
    # Cream Garden Wedding scene: Alps, stationery, no "LOGO" placeholders
    pod_photo = load_cover(ROOT / "assets/scenes/cream-1200.webp", (photo_w, H), crop=(0, 40, 980, 780))

    pod_home = panel_card(
        (W, H), pod_photo, panel_w=W - photo_w, panel_on="right", mark=mark,
        brand="POD", brand_font=font_georgia(72),
        lines=[
            ("Print-on-Demand", font_avenir(30, 5), GOLD, 8),
            ("Designplattform", font_georgia(36, bold=False), INK, 14),
            ("für Hochzeiten und", font_avenir(26, 7), INK_SOFT, 6),
            ("personalisierte Produkte", font_avenir(26, 7), INK_SOFT, 0),
        ],
        domain="pod.swisspro.site",
    )
    save_jpeg(pod_home, OUT / "og-pod-home.jpg")

    # --- POD studio: studio UI on the left
    # STUDIO_PREVIEW is 1440x950 — crop a product/canvas region
    studio_photo = load_cover(ROOT / "STUDIO_PREVIEW.png", (photo_w, H))
    pod_studio = panel_card(
        (W, H), studio_photo, panel_w=W - photo_w, panel_on="right", mark=mark,
        brand="POD", brand_font=font_georgia(72),
        lines=[
            ("Online-Designstudio", font_avenir(28, 5), GOLD, 14),
            ("Kits, Preise und", font_avenir(28, 7), INK, 6),
            ("Lieferung auf", font_avenir(28, 7), INK, 6),
            ("einen Blick", font_avenir(28, 7), INK, 0),
        ],
        domain="pod.swisspro.site",
    )
    save_jpeg(pod_studio, OUT / "og-pod-studio.jpg")

    # --- POD legal / generic: gifts scene
    # Tighter stationery crop of the same alpine wedding set (invites + guestbook)
    legal_photo = load_cover(ROOT / "assets/scenes/cream-1200.webp", (photo_w, H), crop=(220, 280, 1200, 800))
    pod_legal = panel_card(
        (W, H), legal_photo, panel_w=W - photo_w, panel_on="right", mark=mark,
        brand="POD", brand_font=font_georgia(72),
        lines=[
            ("Print-on-Demand", font_avenir(30, 5), GOLD, 10),
            ("Designplattform", font_georgia(36, bold=False), INK, 18),
            ("Versand, Datenschutz", font_avenir(24, 7), INK_SOFT, 6),
            ("und rechtliche Angaben", font_avenir(24, 7), INK_SOFT, 0),
        ],
        domain="pod.swisspro.site",
    )
    save_jpeg(pod_legal, OUT / "og-pod-legal.jpg")

    pod_sq = square_card(
        mark, "POD",
        ["Print-on-Demand", "Designplattform"],
        "pod.swisspro.site",
        font_georgia(72), font_avenir(28, 7),
    )
    save_jpeg(pod_sq, OUT / "og-pod-square.jpg")

    # --- Pod.AI cards: typography left, product UI in a framed window on the right

    def draw_platform_pills(draw, x, y, highlight=None):
        """Visible Shopify + WooCommerce + und mehr chips, readable at thumbnail size."""
        font = font_avenir(22, 2)  # Demi Bold
        labels = ["Shopify", "WooCommerce", "und mehr"]
        # Lay out in one wrapping row, then fall back to a second row if needed.
        max_w = 360
        gap, pad_x, box_h = 10, 16, 40
        row_x, row_y = x, y
        for label in labels:
            bb = draw.textbbox((0, 0), label, font=font)
            tw = bb[2] - bb[0]
            w = tw + pad_x * 2
            if row_x > x and row_x + w > x + max_w:
                row_x = x
                row_y += box_h + 10
            box = (row_x, row_y, row_x + w, row_y + box_h)
            emph = highlight == label
            if emph:
                draw.rounded_rectangle(box, radius=20, fill=INK)
                fill = CREAM
            else:
                draw.rounded_rectangle(box, radius=20, fill=WHITE, outline=GOLD, width=2)
                fill = INK
            draw.text((row_x + pad_x, row_y + box_h / 2), label, font=font, fill=fill, anchor="lm")
            row_x += w + gap
        return row_y + box_h

    def podai_product_card(headline_lines, kicker="Agentic-Commerce-KI-Agent", highlight=None):
        canvas = Image.new("RGB", (W, H), CREAM)
        draw = ImageDraw.Draw(canvas)
        panel_w = 470
        # left panel already cream; gold hairline at panel edge
        draw.rectangle((panel_w - 3, 36, panel_w, H - 36), fill=GOLD_LINE)

        # right: softly darker cream well + screenshot
        well = Image.new("RGB", (W - panel_w, H), CREAM_DEEP)
        canvas.paste(well, (panel_w, 0))

        # crop the chat transcript (right two-thirds of the 1600x900 admin shot)
        # leave a bit of the left nav so it still looks like a product
        shot = load_cover(
            ROOT / "assets/agent/admin-chat-agent-assistant.png",
            (680, 560),
            crop=(220, 0, 1560, 900),
        )
        shot = rounded(shot, 22)
        framed = drop_shadow(shot, radius=22, offset=(0, 14), opacity=70)
        # center the framed shot in the right well
        fw, fh = framed.size
        fx = panel_w + (W - panel_w - fw) // 2
        fy = (H - fh) // 2
        canvas.paste(framed, (fx, fy), framed)

        pad = 56
        tx, ty = pad, 64
        m = mark.convert("RGBA").resize((72, 72), Image.Resampling.LANCZOS)
        canvas.paste(m, (tx, ty), m)
        ty += 72 + 20
        draw.text((tx, ty), "Pod.AI", font=font_georgia(68), fill=INK, anchor="lt")
        bb = draw.textbbox((tx, ty), "Pod.AI", font=font_georgia(68))
        ty = bb[3] + 16
        draw.rectangle((tx, ty, tx + 72, ty + 3), fill=GOLD)
        ty += 28
        kickers = kicker if isinstance(kicker, (list, tuple)) else [kicker]
        for line in kickers:
            draw.text((tx, ty), line, font=font_avenir(26, 5), fill=GOLD, anchor="lt")
            bb = draw.textbbox((tx, ty), line, font=font_avenir(26, 5))
            ty = bb[3] + 4
        ty += 14
        for line in headline_lines:
            draw.text((tx, ty), line, font=font_avenir(26, 7), fill=INK_SOFT, anchor="lt")
            bb = draw.textbbox((tx, ty), line, font=font_avenir(26, 7))
            ty = bb[3] + 6
        ty += 16
        ty = draw_platform_pills(draw, tx, ty, highlight=highlight)
        draw.text((tx, H - 56), "podai.swisspro.site", font=font_avenir(20, 5), fill=MUTED, anchor="ls")
        return canvas

    save_jpeg(
        podai_product_card(
            [],
            kicker=["KI-Agent für", "Einzelhandel und E-Commerce"],
        ),
        OUT / "og-podai-home.jpg",
    )
    save_jpeg(
        podai_product_card(
            ["Eine der unterstützten", "Plattformen"],
            kicker="für WooCommerce",
            highlight="WooCommerce",
        ),
        OUT / "og-podai-woo.jpg",
    )
    save_jpeg(
        podai_product_card(
            ["für Einzelhandel und E-Commerce", "Installation und häufige Fragen"],
            kicker="Support und Ressourcen",
        ),
        OUT / "og-podai-support.jpg",
    )
    save_jpeg(
        podai_product_card(
            ["für Einzelhandel und E-Commerce", "Datenschutz, Bedingungen,", "Sicherheit"],
            kicker="Rechtliche Angaben",
        ),
        OUT / "og-podai-legal.jpg",
    )

    ai_sq = square_card(
        mark, "Pod.AI",
        ["KI-Agent für Einzelhandel", "und E-Commerce", "Shopify · WooCommerce · mehr"],
        "podai.swisspro.site",
        font_georgia(68), font_avenir(24, 7),
    )
    save_jpeg(ai_sq, OUT / "og-podai-square.jpg")
    print("done")


if __name__ == "__main__":
    main()
