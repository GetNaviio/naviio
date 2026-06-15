"""Clean, on-brand 4K motion graphic (vector/type), rendered frame-by-frame.
Usage: python3 make_motion.py <start> <end> <outdir>
Renders RGBA frames [start, end) at 2160x3840. Transparent background so the
same frames serve both a navy MP4 and an alpha overlay export."""
import sys, math, os
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, T = 2160, 3840, 30, 8.0
CX = W // 2
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BLUE = (59, 130, 246); TEAL = (6, 214, 160); WHITE = (255, 255, 255); MUTE = (150, 162, 180); GREEN = (16, 185, 129)

def fnt(s, b=True): return ImageFont.truetype(FB if b else FR, s)
def clamp(x): return 0.0 if x < 0 else 1.0 if x > 1 else x
def ease(a, b, t):
    s = clamp((t - a) / (b - a)); return s * s * (3 - 2 * s)

def ctext(layer, cy, text, font, color, a, rise=0):
    d = ImageDraw.Draw(layer); tb = d.textbbox((0, 0), text, font=font)
    x = CX - (tb[2] - tb[0]) / 2 - tb[0]; y = cy - (tb[3] - tb[1]) / 2 - tb[1] + rise
    d.text((x, y), text, font=font, fill=color + (int(255 * a),))

def hexagon(layer, t):
    cy = 1980; R = 560
    appear = ease(3.0, 3.5, t)
    build = ease(3.3, 5.0, t)
    d = ImageDraw.Draw(layer)
    outer = [(CX + R * math.cos(math.radians(60 * i - 90)), cy + R * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    if appear > 0:
        d.line(outer + [outer[0]], fill=WHITE + (int(40 * appear),), width=3, joint="curve")
        for i in range(6):
            d.line([(CX, cy), outer[i]], fill=WHITE + (int(28 * appear),), width=2)
    scores = [0.86, 0.72, 0.62, 0.80, 0.74, 0.66]
    pts = []
    for i, sc in enumerate(scores):
        rr = R * sc * build
        pts.append((CX + rr * math.cos(math.radians(60 * i - 90)), cy + rr * math.sin(math.radians(60 * i - 90))))
    if build > 0.02:
        fill_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        ImageDraw.Draw(fill_layer).polygon(pts, fill=BLUE + (90,), outline=BLUE + (255,))
        fill_layer.putalpha(fill_layer.getchannel("A").point(lambda v: int(v * build)))
        layer.alpha_composite(fill_layer)
        for (px, py) in pts:
            d.ellipse([px - 11, py - 11, px + 11, py + 11], fill=TEAL + (int(255 * build),))
    n = int(round(82 * ease(3.4, 5.0, t)))
    ctext(layer, cy - 20, str(n), fnt(220), GREEN, ease(3.4, 4.0, t))
    ctext(layer, cy + 130, "health score", fnt(58, False), MUTE, ease(4.2, 4.8, t))
    labels = [("Revenue", -90, -150), ("Margin", -30, 60), ("Cash flow", 30, 60), ("Debt", 90, 80), ("Expenses", 150, -60), ("DSO", 210, -60)]
    la = ease(4.4, 5.2, t)
    if la > 0:
        for (txt, ang, dx) in labels:
            lx = CX + (R + 120) * math.cos(math.radians(ang)); ly = cy + (R + 120) * math.sin(math.radians(ang))
            dd = ImageDraw.Draw(layer); tb = dd.textbbox((0, 0), txt, font=fnt(50))
            dd.text((lx - (tb[2] - tb[0]) / 2 + dx * 0, ly - (tb[3] - tb[1]) / 2 - tb[1]), txt, font=fnt(50), fill=WHITE + (int(220 * la),), anchor=None)

def logomark(layer, x, y, s, a):
    d = ImageDraw.Draw(layer); w = int(70 * s); h = int(28 * s); sk = int(18 * s); o = int(40 * s)
    d.polygon([(x + sk, y), (x + w + sk, y), (x + w, y + h), (x, y + h)], fill=BLUE + (int(255 * a),))
    d.polygon([(x + sk + o, y), (x + w + sk + o, y), (x + w + o, y + h), (x + o, y + h)], fill=TEAL + (int(255 * a),))

def render(t):
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # scene 1 — headline
    a1 = ease(0.3, 1.1, t) * (1 - ease(2.6, 3.2, t))
    if a1 > 0:
        ctext(frame, 1820, "Most founders are", fnt(120), WHITE, a1, rise=int(40 * (1 - ease(0.3, 1.1, t))))
        ctext(frame, 1980, "flying blind.", fnt(120), BLUE, a1, rise=int(40 * (1 - ease(0.5, 1.3, t))))
    # scene 2 — hexagon (3.0–5.6)
    hexscene = (1 - ease(5.6, 6.2, t))
    if t > 2.9 and hexscene > 0:
        hx = Image.new("RGBA", (W, H), (0, 0, 0, 0)); hexagon(hx, t)
        if hexscene < 1: hx.putalpha(hx.getchannel("A").point(lambda v: int(v * hexscene)))
        frame.alpha_composite(hx)
    # scene 3 — payoff line + logo + CTA (6.0–8.0)
    a3 = ease(6.1, 6.8, t)
    if a3 > 0:
        ctext(frame, 1640, "Six signals. One score.", fnt(104), WHITE, a3, rise=int(36 * (1 - a3)))
        logomark(frame, CX - 150, 1815, 3.0, ease(6.4, 7.0, t))
        ctext(frame, 2010, "Naviio", fnt(150), WHITE, ease(6.4, 7.0, t))
        ctext(frame, 2155, "Your financial co-pilot", fnt(56, False), MUTE, ease(6.7, 7.2, t))
        ca = ease(7.0, 7.5, t); pill = Image.new("RGBA", (W, H), (0, 0, 0, 0)); pd = ImageDraw.Draw(pill)
        bw = 1000; bx = CX - bw // 2
        pd.rounded_rectangle([bx, 2360, bx + bw, 2480], radius=60, fill=BLUE + (255,))
        pill.putalpha(pill.getchannel("A").point(lambda v: int(v * ca)))
        frame.alpha_composite(pill)
        ctext(frame, 2420, "Join the waitlist", fnt(60), WHITE, ca)
        ctext(frame, 2560, "Coming Q4 2026", fnt(48), TEAL, ease(7.2, 7.6, t))
    return frame

def main():
    start, end, outdir = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    for i in range(start, end):
        render(i / FPS).save(os.path.join(outdir, f"f{i:04d}.png"))
    print(f"rendered {start}..{end}")

if __name__ == "__main__":
    main()
