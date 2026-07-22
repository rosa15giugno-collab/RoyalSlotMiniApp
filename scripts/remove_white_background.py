"""Remove white backgrounds and build true alpha for Mini App PNG assets."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SYMBOLS_DIR = ROOT / "assets" / "symbols"
LOGO_PATH = ROOT / "assets" / "brand" / "casino-by-rosa-logo.png"

SYMBOL_FILES = [
    "bar.png",
    "seven.png",
    "horseshoe.png",
    "cherry.png",
    "jollypoker.png",
    "crown.png",
    "bell.png",
    "star.png",
    "diamond.png",
]


def is_background_pixel(r: int, g: int, b: int, a: int, tolerance: int) -> bool:
    if a < 8:
        return True

    brightness = (r + g + b) / 3
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    saturation = max_c - min_c

    if brightness >= 255 - tolerance and saturation <= tolerance + 8:
        return True

    if brightness >= 248 and saturation <= 18:
        return True

    if brightness >= 235 and saturation <= 12:
        return True

    return False


def flood_background_mask(img: Image.Image, tolerance: int) -> list[list[bool]]:
    width, height = img.size
    pixels = img.load()
    mask = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def try_add(x: int, y: int) -> None:
        if mask[y][x]:
            return
        r, g, b, a = pixels[x, y]
        if is_background_pixel(r, g, b, a, tolerance):
            mask[y][x] = True
            queue.append((x, y))

    for x in range(width):
        try_add(x, 0)
        try_add(x, height - 1)
    for y in range(height):
        try_add(0, y)
        try_add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height:
                try_add(nx, ny)

    return mask


def defringe_white(img: Image.Image) -> Image.Image:
    width, height = img.size
    pixels = img.load()

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a <= 0 or a >= 255:
                continue

            alpha = a / 255.0
            # Undo white-background premultiplication on edge pixels.
            r = int(max(0, min(255, (r - (1 - alpha) * 255) / alpha)))
            g = int(max(0, min(255, (g - (1 - alpha) * 255) / alpha)))
            b = int(max(0, min(255, (b - (1 - alpha) * 255) / alpha)))
            pixels[x, y] = (r, g, b, a)

    return img


def soften_edges(img: Image.Image, background_mask: list[list[bool]]) -> Image.Image:
    width, height = img.size
    pixels = img.load()

    for y in range(height):
        for x in range(width):
            if background_mask[y][x]:
                pixels[x, y] = (0, 0, 0, 0)
                continue

            r, g, b, a = pixels[x, y]
            brightness = (r + g + b) / 3
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            saturation = max_c - min_c

            if brightness > 210 and saturation < 28:
                fade = max(0.0, min(1.0, (230 - brightness) / 35))
                new_alpha = int(a * fade)
                pixels[x, y] = (r, g, b, new_alpha)

    return img


def remove_white_background(path: Path, tolerance: int = 34) -> None:
    img = Image.open(path).convert("RGBA")
    mask = flood_background_mask(img, tolerance)
    img = soften_edges(img, mask)
    img = defringe_white(img)
    img.save(path, "PNG", optimize=True)
    print(f"Processed {path.name}")


def main() -> None:
    for name in SYMBOL_FILES:
        remove_white_background(SYMBOLS_DIR / name)

    if LOGO_PATH.exists():
        remove_white_background(LOGO_PATH, tolerance=40)

    print("Done.")


if __name__ == "__main__":
    main()
