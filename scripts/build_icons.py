"""Build icons:
- fnNAS app + PWA: orange-tile rounded icon
- Web UI + favicon/title: transparent headphones glyph
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

ORANGE_TILE_SRC = Path(
    r"C:\Users\feige\.cursor\projects\d-xiangmu-lemon-music\assets"
    r"\c__Users_feige_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"f7ddb5093ef1ef3e16c2fa43d2009a55_images_56-2646b46f-eb22-46bb-9c65-0781d013ab8e.png"
)
ORANGE_MASTER = ROOT / "assets" / "brand-icons" / "icon-orange-tile-master.png"

GLYPH_SRC_CANDIDATES = [
    ROOT / "assets" / "brand-icons" / "headphones-3d-glyph.png",
    ROOT / "assets" / "brand-icons" / "headphones-3d-source.png",
]
GLYPH = ROOT / "assets" / "brand-icons" / "headphones-3d-glyph.png"


def content_bbox(im: Image.Image, thr: int = 8):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p > thr else 0).getbbox()


def extract_glyph(src: Image.Image, pad_ratio: float = 0.04) -> Image.Image:
    box = content_bbox(src)
    if not box:
        raise RuntimeError("no opaque pixels in glyph source")
    cropped = src.crop(box)
    side = max(cropped.width, cropped.height)
    pad = max(1, int(round(side * pad_ratio)))
    canvas = side + 2 * pad
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    dx = (canvas - cropped.width) // 2
    dy = (canvas - cropped.height) // 2
    out.paste(cropped, (dx, dy), cropped)
    return out


def fit_to_square(src: Image.Image, size: int, margin_ratio: float = 0.01) -> Image.Image:
    """Scale content bbox into square canvas; keep transparency outside squircle."""
    work = src.convert("RGBA")
    box = content_bbox(work)
    if not box:
        raise RuntimeError("no opaque pixels")
    cropped = work.crop(box)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    margin = max(1, int(round(size * margin_ratio)))
    inner = size - 2 * margin
    scale = min(inner / cropped.width, inner / cropped.height)
    nw = max(1, int(round(cropped.width * scale)))
    nh = max(1, int(round(cropped.height * scale)))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    dx = (size - nw) // 2
    dy = (size - nh) // 2
    out.paste(resized, (dx, dy), resized)
    return out


def make_transparent_web(glyph: Image.Image, size: int, margin_ratio: float = 0.06) -> Image.Image:
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    margin = max(1, int(round(size * margin_ratio)))
    inner = size - 2 * margin
    g = glyph.resize((inner, inner), Image.Resampling.LANCZOS)
    out.paste(g, (margin, margin), g)
    return out


def save(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            path.unlink()
        except OSError:
            bak = path.with_suffix(path.suffix + ".bak")
            path.replace(bak)
    img.save(path, "PNG")
    print(f"wrote {path} ({img.size[0]}x{img.size[1]})")


def load_orange_tile() -> Image.Image:
    src = ORANGE_TILE_SRC if ORANGE_TILE_SRC.exists() else ORANGE_MASTER
    if not src.exists():
        raise SystemExit("missing orange-tile icon source")
    ORANGE_MASTER.parent.mkdir(parents=True, exist_ok=True)
    if src.resolve() != ORANGE_MASTER.resolve():
        shutil.copy2(src, ORANGE_MASTER)
    print(f"orange tile: {src}")
    return Image.open(ORANGE_MASTER).convert("RGBA")


def load_glyph() -> Image.Image:
    src = next((p for p in GLYPH_SRC_CANDIDATES if p.exists()), None)
    if not src:
        raise SystemExit("missing transparent headphones glyph")
    print(f"glyph: {src}")
    im = Image.open(src).convert("RGBA")
    glyph = extract_glyph(im)
    save(glyph, GLYPH)
    return glyph


def main():
    orange = load_orange_tile()
    glyph = load_glyph()

    # 飞牛应用图标：橙底圆角
    app_targets = [
        (512, ROOT / "icon.png"),
        (64, ROOT / "fpk" / "ICON.PNG"),
        (256, ROOT / "fpk" / "ICON_256.PNG"),
        (32, ROOT / "fpk" / "app" / "ui" / "images" / "icon_32.png"),
        (48, ROOT / "fpk" / "app" / "ui" / "images" / "icon_48.png"),
        (64, ROOT / "fpk" / "app" / "ui" / "images" / "icon_64.png"),
        (128, ROOT / "fpk" / "app" / "ui" / "images" / "icon_128.png"),
        (256, ROOT / "fpk" / "app" / "ui" / "images" / "icon_256.png"),
        (32, ROOT / "fpk" / "app" / "ui" / "images" / "icon-32.png"),
        (48, ROOT / "fpk" / "app" / "ui" / "images" / "icon-48.png"),
        (64, ROOT / "fpk" / "app" / "ui" / "images" / "icon-64.png"),
        (128, ROOT / "fpk" / "app" / "ui" / "images" / "icon-128.png"),
        (256, ROOT / "fpk" / "app" / "ui" / "images" / "icon-256.png"),
    ]

    # PWA / 主屏：橙底圆角
    pwa_targets = [
        (192, ROOT / "public" / "pwa" / "icon-192.png"),
        (512, ROOT / "public" / "pwa" / "icon-512.png"),
        (512, ROOT / "public" / "pwa" / "icon-maskable-512.png"),
        (180, ROOT / "public" / "apple-touch-icon.png"),
    ]

    # 网页内 + 标题栏 favicon：透明耳机
    web_targets = [
        (512, ROOT / "public" / "icon.png"),
        (192, ROOT / "public" / "icon-192.png"),
        (512, ROOT / "public" / "icon-512.png"),
        (64, ROOT / "public" / "favicon.png"),
    ]

    dist_public = ROOT / "dist" / "public"
    if dist_public.is_dir():
        pwa_targets.extend(
            [
                (192, dist_public / "pwa" / "icon-192.png"),
                (512, dist_public / "pwa" / "icon-512.png"),
                (512, dist_public / "pwa" / "icon-maskable-512.png"),
                (180, dist_public / "apple-touch-icon.png"),
            ]
        )
        web_targets.extend(
            [
                (512, dist_public / "icon.png"),
                (192, dist_public / "icon-192.png"),
                (512, dist_public / "icon-512.png"),
                (64, dist_public / "favicon.png"),
            ]
        )

    base_app = fit_to_square(orange, 512, margin_ratio=0.0)
    for size, path in app_targets + pwa_targets:
        img = base_app if size == 512 else base_app.resize((size, size), Image.Resampling.LANCZOS)
        save(img, path)

    base_web = make_transparent_web(glyph, 512)
    for size, path in web_targets:
        img = base_web if size == 512 else base_web.resize((size, size), Image.Resampling.LANCZOS)
        save(img, path)

    fav = ROOT / "public" / "favicon.png"
    if fav.exists():
        ico = ROOT / "public" / "favicon.ico"
        Image.open(fav).convert("RGBA").save(ico, format="ICO", sizes=[(32, 32), (64, 64)])
        print(f"wrote {ico}")
        dist_ico = ROOT / "dist" / "public" / "favicon.ico"
        if dist_ico.parent.is_dir():
            Image.open(fav).convert("RGBA").save(
                dist_ico, format="ICO", sizes=[(32, 32), (64, 64)]
            )
            print(f"wrote {dist_ico}")

    app = Image.open(ROOT / "icon.png").convert("RGBA")
    web = Image.open(ROOT / "public" / "icon.png").convert("RGBA")
    pwa = Image.open(ROOT / "public" / "pwa" / "icon-512.png").convert("RGBA")
    print("app corner", app.getpixel((0, 0)), "app mid", app.getpixel((256, 256)))
    print("pwa mid", pwa.getpixel((256, 256)))
    print("web corner", web.getpixel((0, 0)), "web mid", web.getpixel((256, 256)))
    print("done")


if __name__ == "__main__":
    main()
