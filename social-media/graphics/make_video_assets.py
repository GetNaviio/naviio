"""Build 1080x1920 vertical creatives (text baked) from the source photos,
for use as the keyframes of the TikTok video."""
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
NAVY, BLUE, TEAL, WHITE = (10, 14, 26), (59, 130, 246), (6, 214, 160), (255, 255, 255)

def f(s, b=True): return ImageFont.truetype(FB if b else FR, s)

def cover(img, w=1080, h=1920):
    img = img.convert("RGB"); iw, ih = img.size
    sc = max(w / iw, h / ih); nw, nh = int(iw * sc), int(ih * sc)
    img = img.resize((nw, nh), Image.LANCZOS)
    return img.crop(((nw - w) // 2, (nh - h) // 2, (nw - w) // 2 + w, (nh - h) // 2 + h))

def scrim(img, top, bottom, ta, ba):
    w, h = img.size; ov = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for y in range(top): d.line([(0, y), (w, y)], fill=(8, 11, 20, int(ta * (1 - y / top))))
    for y in range(bottom): d.line([(0, h - 1 - y), (w, h - 1 - y)], fill=(8, 11, 20, int(ba * (1 - y / bottom))))
    return Image.alpha_composite(img.convert("RGBA"), ov)

def pill(d, xy, text, font, fill, tc, pad=(26, 14)):
    tb = d.textbbox((0, 0), text, font=font); tw, th = tb[2] - tb[0], tb[3] - tb[1]; x, y = xy
    d.rounded_rectangle([x, y, x + tw + pad[0] * 2, y + th + pad[1] * 2], radius=(th + pad[1] * 2) // 2, fill=fill)
    d.text((x + pad[0], y + pad[1] - tb[1]), text, font=font, fill=tc)

def mark(d, x, y, s=1.6):
    w, h, sk = int(40 * s), int(16 * s), int(10 * s)
    d.polygon([(x + sk, y), (x + w + sk, y), (x + w, y + h), (x, y + h)], fill=BLUE)
    o = int(22 * s)
    d.polygon([(x + sk + o, y), (x + w + sk + o, y), (x + w + o, y + h), (x + o, y + h)], fill=TEAL)

def hexbadge(base, cx, cy, r, score="82"):
    d = ImageDraw.Draw(base)
    pts = [(cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    inr = [(cx + r * .6 * math.cos(math.radians(60 * i - 90)), cy + r * .6 * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    d.polygon(pts, fill=(10, 42, 94, 160), outline=WHITE); d.polygon(inr, fill=(6, 214, 160, 130), outline=TEAL)
    fn = f(int(r * .72)); tb = d.textbbox((0, 0), score, font=fn)
    d.text((cx - (tb[2] - tb[0]) / 2, cy - (tb[3] - tb[1]) / 2 - tb[1]), score, font=fn, fill=WHITE)

def storm(img):
    img = scrim(cover(img), 560, 560, 170, 200); d = ImageDraw.Draw(img)
    pill(d, (70, 150), "WITHOUT NAVIIO", f(34), (255, 77, 77, 235), WHITE)
    d.text((70, 250), "Flying blind.", font=f(110), fill=WHITE)
    d.text((72, 400), "Guessing. Reacting. Hoping.", font=f(42, False), fill=(205, 213, 226))
    mark(d, 70, 1780); d.text((180, 1766), "Naviio", font=f(40), fill=WHITE)
    return img.convert("RGB")

def clear(img):
    img = scrim(cover(img), 520, 600, 130, 205); d = ImageDraw.Draw(img)
    pill(d, (70, 150), "WITH NAVIIO", f(34), (255, 255, 255, 240), NAVY)
    d.text((70, 250), "Clear skies.", font=f(110), fill=WHITE)
    d.text((72, 400), "Clarity. Calm. In control.", font=f(42, False), fill=(238, 244, 252))
    hexbadge(img, 1080 - 160, 200, 92); d = ImageDraw.Draw(img)
    bw = 700; bx = (1080 - bw) // 2
    d.rounded_rectangle([bx, 1720, bx + bw, 1812], radius=46, fill=(10, 42, 94, 240))
    t = "Join the waitlist  ·  Q4 2026"; tb = d.textbbox((0, 0), t, font=f(40))
    d.text((540 - (tb[2] - tb[0]) / 2, 1766 - (tb[3] - tb[1]) / 2 - tb[1]), t, font=f(40), fill=WHITE)
    return img.convert("RGB")

files = [os.path.join(SRC, x) for x in os.listdir(SRC) if x.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
files = sorted(files, key=lambda p: ImageStat.Stat(Image.open(p).convert("L")).mean[0])
storm(Image.open(files[0])).save(os.path.join(HERE, "storm_v.png"))
clear(Image.open(files[-1])).save(os.path.join(HERE, "clear_v.png"))
print("saved storm_v.png + clear_v.png")
