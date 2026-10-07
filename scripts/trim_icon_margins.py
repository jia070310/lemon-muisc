"""Trim outer white/transparent margin; keep orange-tile look; export icon sizes."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "icon.png"
MASTER = ROOT / "assets" / "brand-icons" / "icon-orange-tile-master.png"


def content_bbox(im: Image.Image, thr: int = 8):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p > thr else 0).getbbox()


def is_background(r, g, b, a) -> bool:
    """Pixels that are empty or look like the outer off-white canvas."""
    if a <= 8:
        return True
    mn = min(r, g, b)
    mx = max(r, g, b)
    # off-white / light gray canvas (not orange tile)
    if mn >= 230 and mx >= 240 and (mx - mn) <= 30:
        return True
    # soft pale drop-shadow fringe against white
    if a < 160 and mn >= 190 and (mx - mn) < 30:
        return True
    return False


def clear_outer_background(im: Image.Image) -> Image.Image:
    """Flood-fill from image edges so only the outer white/empty region is cleared."""
    work = im.convert("RGBA")
    px = work.load()
    w, h = work.size
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if seen[i]:
            return
        r, g, b, a = px[x, y]
        if not is_background(r, g, b, a):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)
    return work


def filled_square(src: Image.Image, size: int, margin_ratio: float = 0.01) -> Image.Image:
    work = clear_outer_background(src)
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


def main():
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    MASTER.parent.mkdir(parents=True, exist_ok=True)
    MASTER.write_bytes(SRC.read_bytes())
    print(f"master updated {MASTER}")

    src = Image.open(MASTER).convert("RGBA")
    box = content_bbox(src)
    print("src", src.size, "corner", src.getpixel((0, 0)), "tile40", src.getpixel((40, 40)), "bbox", box)

    targets = [
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
        (512, ROOT / "public" / "icon.png"),
        (192, ROOT / "public" / "icon-192.png"),
        (512, ROOT / "public" / "icon-512.png"),
        (180, ROOT / "public" / "apple-touch-icon.png"),
        (64, ROOT / "public" / "favicon.png"),
        (192, ROOT / "public" / "pwa" / "icon-192.png"),
        (512, ROOT / "public" / "pwa" / "icon-512.png"),
        (512, ROOT / "public" / "pwa" / "icon-maskable-512.png"),
    ]

    dist_public = ROOT / "dist" / "public"
    if dist_public.is_dir():
        targets.extend(
            [
                (512, dist_public / "icon.png"),
                (192, dist_public / "icon-192.png"),
                (512, dist_public / "icon-512.png"),
                (180, dist_public / "apple-touch-icon.png"),
                (64, dist_public / "favicon.png"),
                (192, dist_public / "pwa" / "icon-192.png"),
                (512, dist_public / "pwa" / "icon-512.png"),
                (512, dist_public / "pwa" / "icon-maskable-512.png"),
            ]
        )

    base = filled_square(src, 512, margin_ratio=0.01)
    for size, path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        img = base if size == 512 else base.resize((size, size), Image.Resampling.LANCZOS)
        img.save(path, "PNG")
        print(f"wrote {path} ({size})")

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

    chk = Image.open(ROOT / "icon.png").convert("RGBA")
    box = content_bbox(chk)
    print(
        "verify corner",
        chk.getpixel((0, 0)),
        "edge8",
        chk.getpixel((8, 8)),
        "tile40",
        chk.getpixel((40, 40)),
        "bbox",
        box,
    )
    if box:
        print(
            "new margins",
            box[0],
            box[1],
            chk.width - box[2],
            chk.height - box[3],
        )
    print("done")


if __name__ == "__main__":
    main()
