"""
Composite Naviio's brand overlays onto the two airplane photos.

Drop both images (any names/format) into social-media/graphics/source/.
The script auto-detects which is the storm (darker) and which is the clear
sky (brighter), then outputs finished 1080x1080 creatives + a 1080x1920 split
cover into social-media/graphics/.

Run:  python3 social-media/graphics/make_creatives.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONTR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

NAVY = (10, 14, 26)
BLUE = (59, 130, 246)
TEAL = (6, 214, 160)
RED = (255, 77, 77)
WHITE = (255, 255, 255)


def f(size, bold=True):
    return ImageFont.truetype(FONT if bold else FONTR, size)


def square(img, s=1080):
    img = img.convert("RGB")
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
    return img.resize((s, s), Image.LANCZOS)


def scrim(img, top=360, bottom=440, top_a=160, bot_a=200):
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y in range(top):
        a = int(top_a * (1 - y / top))
        d.line([(0, y), (w, y)], fill=(8, 11, 20, a))
    for y in range(bottom):
        a = int(bot_a * (1 - y / bottom))
        d.line([(0, h - 1 - y), (w, h - 1 - y)], fill=(8, 11, 20, a))
    return Image.alpha_composite(img.convert("RGBA"), ov)


def pill(d, xy, text, font, fill, tcolor, pad=(24, 12)):
    tb = d.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    x, y = xy
    d.rounded_rectangle([x, y, x + tw + pad[0] * 2, y + th + pad[1] * 2], radius=(th + pad[1] * 2) // 2, fill=fill)
    d.text((x + pad[0], y + pad[1] - tb[1]), text, font=font, fill=tcolor)
    return th + pad[1] * 2


def mark(d, x, y, scale=1.0):
    w = int(40 * scale); h = int(16 * scale); sk = int(10 * scale)
    d.polygon([(x + sk, y), (x + w + sk, y), (x + w, y + h), (x, y + h)], fill=BLUE)
    d.polygon([(x + sk + int(22 * scale), y), (x + w + sk + int(22 * scale), y), (x + w + int(22 * scale), y + h), (x + int(22 * scale), y + h)], fill=TEAL)


def hexbadge(base, cx, cy, r, score="82"):
    d = ImageDraw.Draw(base)
    import math
    pts = [(cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    inner = [(cx + r * 0.6 * math.cos(math.radians(60 * i - 90)), cy + r * 0.6 * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    d.polygon(pts, fill=(10, 42, 94, 150), outline=WHITE)
    d.polygon(inner, fill=(6, 214, 160, 120), outline=TEAL)
    fn = f(int(r * 0.7))
    tb = d.textbbox((0, 0), score, font=fn)
    d.text((cx - (tb[2] - tb[0]) / 2, cy - (tb[3] - tb[1]) / 2 - tb[1]), score, font=fn, fill=WHITE)


def storm_creative(img):
    img = scrim(square(img))
    d = ImageDraw.Draw(img)
    pill(d, (60, 70), "WITHOUT NAVIIO", f(30), (255, 77, 77, 230), WHITE)
    d.text((60, 150), "Flying blind.", font=f(92), fill=WHITE)
    d.text((62, 270), "Guessing. Reacting. Hoping.", font=f(38, False), fill=(200, 208, 222))
    mark(d, 60, 992, 1.4); d.text((150, 980), "Naviio", font=f(34), fill=WHITE)
    return img.convert("RGB")


def clear_creative(img):
    img = scrim(square(img), top=300, top_a=120, bottom=440, bot_a=200)
    d = ImageDraw.Draw(img)
    pill(d, (60, 70), "WITH NAVIIO", f(30), (255, 255, 255, 235), NAVY)
    d.text((60, 150), "Clear skies.", font=f(92), fill=WHITE)
    d.text((62, 270), "Clarity. Calm. In control.", font=f(38, False), fill=(235, 242, 250))
    hexbadge(img, 1080 - 150, 150, 84)
    d = ImageDraw.Draw(img)
    bw = 620; bx = (1080 - bw) // 2
    d.rounded_rectangle([bx, 940, bx + bw, 1018], radius=39, fill=(10, 42, 94, 235))
    t = "Join the waitlist  ·  Q4 2026"
    tb = d.textbbox((0, 0), t, font=f(36))
    d.text((1080 / 2 - (tb[2] - tb[0]) / 2, 979 - (tb[3] - tb[1]) / 2 - tb[1]), t, font=f(36), fill=WHITE)
    return img.convert("RGB")


def main():
    files = [os.path.join(SRC, x) for x in os.listdir(SRC) if x.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    if len(files) < 2:
        print(f"Need 2 images in {SRC} — found {len(files)}. Drop both in and re-run.")
        return
    scored = sorted(files, key=lambda p: ImageStat.Stat(Image.open(p).convert("L")).mean[0])
    storm_path, clear_path = scored[0], scored[-1]
    print(f"storm  = {os.path.basename(storm_path)}")
    print(f"clear  = {os.path.basename(clear_path)}")

    s = storm_creative(Image.open(storm_path))
    c = clear_creative(Image.open(clear_path))
    s.save(os.path.join(HERE, "creative-without-naviio.png"))
    c.save(os.path.join(HERE, "creative-with-naviio.png"))

    cover = Image.new("RGB", (1080, 1920), NAVY)
    cover.paste(square(Image.open(storm_path), 960).crop((0, 60, 960, 900)).resize((1080, 900)), (0, 0))
    cover.paste(square(Image.open(clear_path), 960).crop((0, 60, 960, 900)).resize((1080, 900)), (0, 960))
    cd = ImageDraw.Draw(cover)
    cd.text((60, 360), "Without Naviio", font=f(56), fill=WHITE)
    cd.text((60, 1300), "With Naviio", font=f(56), fill=WHITE)
    cover.save(os.path.join(HERE, "creative-split-cover.png"))
    print("Saved: creative-without-naviio.png, creative-with-naviio.png, creative-split-cover.png")


if __name__ == "__main__":
    main()
