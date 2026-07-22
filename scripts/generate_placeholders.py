"""Regenerate fallback placeholders for Royal Slot symbols (optional backup assets)."""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Install Pillow: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent / "assets" / "symbols"

SYMBOLS = {
    "bar": {"label": "BAR", "accent": (210, 210, 230), "glow": (160, 160, 200)},
    "seven": {"label": "7", "accent": (255, 60, 60), "glow": (255, 30, 30)},
    "horseshoe": {"label": "HORSE", "accent": (255, 200, 80), "glow": (220, 150, 40)},
    "cherry": {"label": "CHERRY", "accent": (255, 70, 90), "glow": (255, 40, 70)},
    "jollypoker": {"label": "JOKER", "accent": (180, 80, 255), "glow": (140, 40, 220)},
    "crown": {"label": "CROWN", "accent": (255, 210, 60), "glow": (255, 170, 20)},
    "bell": {"label": "BELL", "accent": (255, 215, 60), "glow": (255, 180, 30)},
    "star": {"label": "STAR", "accent": (255, 230, 90), "glow": (255, 200, 50)},
    "diamond": {"label": "DIAMOND", "accent": (120, 220, 255), "glow": (60, 180, 255)},
}


def load_font(size: int):
    for name in ("arialbd.ttf", "Arial Bold.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_symbol(name: str, spec: dict) -> Image.Image:
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.ellipse((24, 24, 232, 232), fill=spec["glow"] + (30,))
    draw.ellipse((40, 40, 216, 216), outline=spec["accent"] + (200,), width=3)

    label = spec["label"]
    font = load_font(48 if label == "7" else 32)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2), label, fill=spec["accent"], font=font)
    return img


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, spec in SYMBOLS.items():
        path = ROOT / f"{name}.png"
        if path.exists():
            print(f"Skip existing {path}")
            continue
        draw_symbol(name, spec).save(path, "PNG")
        print(f"Created {path}")


if __name__ == "__main__":
    main()
