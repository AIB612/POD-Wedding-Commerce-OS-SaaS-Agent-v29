#!/usr/bin/env python3
"""Generate lightweight WebP derivatives for the storefront homepage.

- assets/mockups/thumb/<id>.webp   ~160px product thumbnails (320px @2x as <id>@2x.webp)
- assets/scenes/<name>-800.webp / -1200.webp   responsive hero scene variants
- assets/showcase/thumb/<name>.webp   480px product-wall / showcase images
Run: python3 scripts/build_thumbs.py
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

def save(im, out, w, q=78):
    out.parent.mkdir(parents=True, exist_ok=True)
    im = im.convert("RGB")
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(out, "WEBP", quality=q, method=6)

def main():
    m = ROOT / "assets/mockups"
    for f in sorted(m.glob("*.jpg")):
        if f.stem.endswith(("-shade", "-mask")) or re.search(r"_[0-9a-f]{6}$", f.stem):  # skip masks and colour variants
            continue
        im = Image.open(f)
        save(im, m / "thumb" / f"{f.stem}.webp", 160)
        save(im, m / "thumb" / f"{f.stem}@2x.webp", 320, 72)
    for f in sorted((ROOT / "assets/scenes").glob("*.jpg")) + [ROOT / "assets/scenes/cream.webp"]:
        im = Image.open(f)
        for w in (800, 1200):
            save(im, f.with_name(f"{f.stem}-{w}.webp"), w, 74)
    for f in sorted((ROOT / "assets/showcase").glob("*.jpg")):
        save(Image.open(f), ROOT / "assets/showcase/thumb" / f"{f.stem}.webp", 480, 76)

if __name__ == "__main__":
    main()
