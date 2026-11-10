"""Small 2D compositing kit: premultiplied float sprites, affine blits with
mipmaps, sticker-style text with font fallback (incl. colour emoji),
procedural backgrounds and post effects."""

import math
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FONT_DIR = "C:/Windows/Fonts/"
FONT_FILES = {
    "bold": "msyhbd.ttc",
    "reg": "msyh.ttc",
    "brush": "STXINGKA.TTF",
    "impact": "impact.ttf",
    "emoji": "seguiemj.ttf",
    "sym": "seguisym.ttf",
    "arial": "arialbd.ttf",
}


# ------------------------------------------------------------------ math
def ease_out(x, p=3):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** p


def ease_in(x, p=3):
    x = min(max(x, 0.0), 1.0)
    return x**p


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_back(x, s=1.9):
    x = min(max(x, 0.0), 1.0)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def spring(x, freq=3.0, damp=5.0):
    """0 -> 1 with a damped overshoot; x in seconds."""
    if x <= 0:
        return 0.0
    return 1 - math.exp(-damp * x) * math.cos(2 * math.pi * freq * x)


def clamp01(x):
    return min(max(x, 0.0), 1.0)


def lerp(a, b, x):
    return a + (b - a) * x


def stable_hash(k):
    """Process-independent hash (str hashes are salted per interpreter)."""
    import zlib

    return zlib.crc32(repr(k).encode("utf-8"))


def hash01(*k):
    h = stable_hash(k)
    return ((h * 2654435761) & 0xFFFFFFFF) / 0xFFFFFFFF


def rnd(seed):
    return np.random.default_rng(stable_hash(seed))


# --------------------------------------------------------------- affines
def M(tx=0.0, ty=0.0, s=1.0, rot=0.0, sx=None, sy=None, ax=0.0, ay=0.0):
    """3x3: translate(tx,ty) . rotate(rot deg) . scale . translate(-ax,-ay)."""
    sx = s if sx is None else sx * s
    sy = s if sy is None else sy * s
    c, si = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    R = np.array([[c * sx, -si * sy, 0], [si * sx, c * sy, 0], [0, 0, 1.0]])
    R[0, 2] = tx - (R[0, 0] * ax + R[0, 1] * ay)
    R[1, 2] = ty - (R[1, 0] * ax + R[1, 1] * ay)
    return R


def apply(Mx, x, y):
    return Mx[0, 0] * x + Mx[0, 1] * y + Mx[0, 2], Mx[1, 0] * x + Mx[1, 1] * y + Mx[1, 2]


# --------------------------------------------------------------- sprites
class Sprite:
    def __init__(self, rgba):
        """rgba: float32 HxWx4 premultiplied, 0..1."""
        self.levels = [np.ascontiguousarray(rgba, np.float32)]
        while min(self.levels[-1].shape[:2]) > 24 and len(self.levels) < 6:
            a = self.levels[-1]
            self.levels.append(cv2.resize(a, (max(1, a.shape[1] // 2), max(1, a.shape[0] // 2)), interpolation=cv2.INTER_AREA))

    @property
    def w(self):
        return self.levels[0].shape[1]

    @property
    def h(self):
        return self.levels[0].shape[0]

    @staticmethod
    def from_pil(im):
        a = np.asarray(im.convert("RGBA"), np.float32) / 255.0
        a[..., :3] *= a[..., 3:4]
        return Sprite(a)

    @staticmethod
    def from_file(path):
        return Sprite.from_pil(Image.open(path))

    def tinted(self, rgb, alpha=1.0):
        a = self.levels[0][..., 3:4] * alpha
        out = np.concatenate([np.ones_like(self.levels[0][..., :3]) * np.array(rgb, np.float32) * a, a], -1)
        return Sprite(out)


def blit(cv, spr, Mx, alpha=1.0, mode="normal"):
    if alpha <= 0.002:
        return
    sc = math.sqrt(abs(Mx[0, 0] * Mx[1, 1] - Mx[0, 1] * Mx[1, 0]))
    lvl = 0
    while lvl + 1 < len(spr.levels) and sc * (2 ** (lvl + 1)) <= 1.15:
        lvl += 1
    img = spr.levels[lvl]
    f = 2**lvl
    if lvl:
        fx = spr.w / img.shape[1]
        fy = spr.h / img.shape[0]
        Mx = Mx @ np.diag([fx, fy, 1.0])
    h, w = img.shape[:2]
    pts = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], np.float64).T
    q = Mx @ pts
    x0, x1 = int(math.floor(q[0].min())) - 1, int(math.ceil(q[0].max())) + 1
    y0, y1 = int(math.floor(q[1].min())) - 1, int(math.ceil(q[1].max())) + 1
    Hc, Wc = cv.shape[:2]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(Wc, x1), min(Hc, y1)
    if x1 <= x0 or y1 <= y0:
        return
    Mt = Mx[:2].copy()
    Mt[0, 2] -= x0
    Mt[1, 2] -= y0
    out = cv2.warpAffine(img, Mt, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    reg = cv[y0:y1, x0:x1]
    if mode == "add":
        reg += out[..., :3] * alpha
    else:
        a = out[..., 3:4] * alpha
        reg *= 1 - a
        reg += out[..., :3] * alpha
    del f


def blit_at(cv, spr, x, y, s=1.0, rot=0.0, alpha=1.0, ax=0.5, ay=0.5, sx=None, sy=None, cam=None, mode="normal"):
    m = M(x, y, s, rot, sx, sy, spr.w * ax, spr.h * ay)
    if cam is not None:
        m = cam @ m
    blit(cv, spr, m, alpha, mode)


# ------------------------------------------------------------------ fonts
@lru_cache(None)
def font(name, size):
    return ImageFont.truetype(FONT_DIR + FONT_FILES[name], int(size))


@lru_cache(None)
def _notdef(name):
    f = font(name, 48)
    m = f.getmask("\U000e0fff")
    return bytes(m), m.size


@lru_cache(None)
def has_glyph(name, ch):
    if ch in " \u3000":
        return True
    f = font(name, 48)
    m = f.getmask(ch)
    nd = _notdef(name)
    return not (m.size == nd[1] and bytes(m) == nd[0]) and m.size[0] > 0


EMOJI_HINT = set("🐟🦆🚀💤⏰🐱🍗💊🔥⭐💫✨❤💕🔒📦🌐🚫⚡🎉🐾💡🖥🔌🧠👀😵🙀😼🫠🌀💯🆗✅❌⚠🐶🐮🐷🐑🐔🐭🐦🐴🎵🎶")


def pick_font(primary, ch):
    if ch in EMOJI_HINT or ord(ch) >= 0x1F000:
        return "emoji"
    if has_glyph(primary, ch):
        return primary
    for alt in ("bold", "reg", "sym", "emoji"):
        if alt != primary and has_glyph(alt, ch):
            return alt
    return primary


def layout(text, primary, size, spacing=0.0):
    """Returns glyph runs [(x, ch, fontname)] and total width."""
    x = 0.0
    out = []
    for ch in text:
        if ch in "\ufe0f\u200d":
            continue
        fn = pick_font(primary, ch)
        sz = size * (0.92 if fn == "emoji" else 1.0)
        f = font(fn, sz)
        out.append((x, ch, fn, sz))
        x += f.getlength(ch) + spacing * size
    return out, x - (spacing * size if out else 0)


def wrap(text, primary, size, maxw):
    # keep a trailing kaomoji "(...)" together as one unit
    i = text.rfind("(")
    tail = text[i:] if i > 0 else ""
    if tail and not any("一" <= ch <= "鿿" for ch in tail) and len(tail) <= 14:
        body, face = text[:i].rstrip(), tail
        lines = wrap(body, primary, size, maxw)
        if layout(lines[-1] + " " + face, primary, size)[1] <= maxw:
            lines[-1] += " " + face
        else:
            lines.append(face)
        return lines
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        if layout(trial, primary, size)[1] > maxw and cur:
            # keep closing punctuation on the line
            if ch in "，。！？、）)~～":
                cur = trial
                continue
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def _disk(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


@lru_cache(maxsize=512)
def text_sprite(
    text,
    size=80,
    fnt="bold",
    fill=(255, 255, 255),
    fill2=None,  # gradient bottom colour
    strokes=((30, 27, 22, 8),),  # (r,g,b,width) inner -> outer
    shadow=None,  # (dx, dy, (r,g,b), alpha)
    spacing=0.0,
    line_h=1.25,
    align="center",
    maxw=None,
    glow=None,  # (radius, (r,g,b), strength)
):
    lines = wrap(text, fnt, size, maxw) if maxw else text.split("\n")
    lays = [layout(l, fnt, size, spacing) for l in lines]
    tw = max([w for _, w in lays] + [1])
    pad = int(sum(s[3] for s in strokes) + (abs(shadow[0]) + abs(shadow[1]) if shadow else 0) + (glow[0] * 2 if glow else 0) + size * 0.25)
    lh = size * line_h
    Wd = int(tw + 2 * pad)
    Hd = int(lh * len(lines) + 2 * pad + size * 0.2)
    base = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
    color_layer = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
    db = ImageDraw.Draw(base)
    dc = ImageDraw.Draw(color_layer)
    asc = font(fnt, size).getmetrics()[0]
    for li, (runs, w) in enumerate(lays):
        ox = pad + (tw - w) / 2 if align == "center" else pad + (tw - w if align == "right" else 0)
        by = pad + li * lh + asc + (lh - size) * 0.5
        for x, ch, fn, sz in runs:
            f = font(fn, sz)
            if fn == "emoji":
                dc.text((ox + x, by), ch, font=f, embedded_color=True, anchor="ls")
            else:
                db.text((ox + x, by), ch, font=f, fill=(255, 255, 255, 255), anchor="ls")
    glyph_a = np.asarray(base, np.float32)[..., 3] / 255.0
    col = np.asarray(color_layer, np.float32) / 255.0
    all_a = np.maximum(glyph_a, col[..., 3])
    out = np.zeros((Hd, Wd, 4), np.float32)

    def over(rgb, a):
        a = a[..., None]
        out[..., :3] = out[..., :3] * (1 - a) + np.array(rgb, np.float32)[None, None] / 255.0 * a
        out[..., 3:4] = out[..., 3:4] * (1 - a) + a

    # outlines, outermost first
    widths = np.cumsum([s[3] for s in strokes])
    masks = [cv2.dilate(all_a, _disk(w)) for w in widths]
    if glow:
        g = cv2.GaussianBlur(masks[-1] if masks else all_a, (0, 0), glow[0]) * glow[2]
        over(glow[1], np.clip(g, 0, 1))
    if shadow:
        dx, dy, sc, sa = shadow
        m = masks[-1] if masks else all_a
        sh = np.zeros_like(m)
        Mt = np.float32([[1, 0, dx], [0, 1, dy]])
        sh = cv2.warpAffine(m, Mt, (Wd, Hd))
        over(sc, sh * sa)
    for (r, g, b, _), m in reversed(list(zip(strokes, masks))):
        over((r, g, b), m)
    # fill
    if fill2 is not None:
        yy = np.linspace(0, 1, Hd, dtype=np.float32)[:, None, None]
        grad = np.array(fill, np.float32) / 255 * (1 - yy) + np.array(fill2, np.float32) / 255 * yy
        a = glyph_a[..., None]
        out[..., :3] = out[..., :3] * (1 - a) + grad * a
        out[..., 3:4] = out[..., 3:4] * (1 - a) + a
    else:
        over(fill, glyph_a)
    # colour emoji on top
    ca = col[..., 3:4]
    out[..., :3] = out[..., :3] * (1 - ca) + col[..., :3] * ca
    out[..., 3:4] = out[..., 3:4] * (1 - ca) + ca
    return Sprite(out)


# palettes for 花字 (variety-show captions)
HUAZI = {
    "yellow": dict(fill=(255, 246, 170), fill2=(255, 196, 40), strokes=((255, 255, 255, 5), (40, 30, 20, 9)), shadow=(7, 9, (255, 92, 140), 1.0)),
    "pink": dict(fill=(255, 220, 235), fill2=(255, 98, 156), strokes=((255, 255, 255, 5), (60, 20, 50, 9)), shadow=(7, 9, (255, 214, 64), 1.0)),
    "green": dict(fill=(236, 255, 200), fill2=(140, 200, 80), strokes=((255, 255, 255, 5), (30, 60, 30, 9)), shadow=(7, 9, (255, 140, 60), 1.0)),
    "blue": dict(fill=(220, 245, 255), fill2=(80, 170, 255), strokes=((255, 255, 255, 5), (20, 30, 70, 9)), shadow=(7, 9, (255, 214, 64), 1.0)),
    "white": dict(fill=(255, 255, 255), strokes=((25, 22, 18, 9),), shadow=(6, 8, (0, 0, 0), 0.45)),
    "black": dict(fill=(30, 27, 22), strokes=((255, 255, 255, 8),), shadow=(6, 8, (0, 0, 0), 0.35)),
    "red": dict(fill=(255, 235, 220), fill2=(255, 60, 50), strokes=((255, 255, 255, 5), (50, 10, 10, 9)), shadow=(7, 9, (30, 20, 20), 0.9)),
    "purple": dict(fill=(240, 225, 255), fill2=(160, 110, 255), strokes=((255, 255, 255, 5), (40, 20, 70, 9)), shadow=(7, 9, (255, 214, 64), 1.0)),
}


def huazi(text, size, style="yellow", fnt="bold", **kw):
    st = dict(HUAZI[style])
    k = size / 100.0
    st["strokes"] = tuple((r, g, b, max(1, int(round(w * k * 1.1)))) for r, g, b, w in st["strokes"])
    if st.get("shadow"):
        dx, dy, c, a = st["shadow"]
        st["shadow"] = (int(dx * k), int(dy * k), c, a)
    st.update(kw)
    return text_sprite(text, size, fnt, **st)


# ----------------------------------------------------------- backgrounds
_grid = {}
_YX = None


def yx():
    global _YX
    if _YX is None:
        _YX = np.mgrid[0:H, 0:W].astype(np.float32)
    return _YX


def grid(cx=W / 2, cy=H / 2):
    key = (round(cx), round(cy))
    if key not in _grid:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dx, dy = xx - cx, yy - cy
        _grid[key] = (np.sqrt(dx * dx + dy * dy), np.arctan2(dy, dx))
        if len(_grid) > 6:
            _grid.pop(next(iter(_grid)))
    return _grid[key]


def col(hexs):
    hexs = hexs.lstrip("#")
    return np.array([int(hexs[i : i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def fill(cv, c):
    cv[:] = c


def vgrad(cv, top, bot):
    y = np.linspace(0, 1, cv.shape[0], dtype=np.float32)[:, None, None]
    cv[:] = top * (1 - y) + bot * y


def sunburst(cv, c1, c2, t, n=18, speed=12.0, cx=W / 2, cy=H / 2, center_glow=None):
    r, ang = grid(cx, cy)
    a = (np.degrees(ang) + t * speed) % (360.0 / n) / (360.0 / n)
    # soft edge
    m = np.clip((np.abs(a - 0.5) - 0.25) * 40 + 0.5, 0, 1)[..., None]
    cv[:] = c1 * (1 - m) + c2 * m
    if center_glow is not None:
        g = np.exp(-((r / 520) ** 2))[..., None]
        cv[:] = cv * (1 - g) + center_glow * g


def rings(cv, t, speed=420.0, width=90.0, sat=0.85, val=1.0, cx=W / 2, cy=H / 2, hue_shift=0.0):
    r, ang = grid(cx, cy)
    h = ((r - t * speed) / width / 6 + hue_shift + ang / (2 * np.pi) * 0.0) % 1.0
    hsv = np.stack([h * 180, np.full_like(h, sat * 255), np.full_like(h, val * 255)], -1).astype(np.uint8)
    rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB).astype(np.float32) / 255
    stripe = (np.sin((r - t * speed) / width * np.pi) > 0)[..., None]
    cv[:] = rgb * np.where(stripe, 1.0, 0.78)


def halftone(cv, base, dot, t=0.0, spacing=46, rad=9, speed=(30, 18), angle=0.0):
    yy, xx = yx()
    ox, oy = t * speed[0], t * speed[1]
    u = (xx + ox) % spacing - spacing / 2
    v = (yy + oy) % spacing - spacing / 2
    d = np.sqrt(u * u + v * v)
    m = np.clip(rad - d + 0.5, 0, 1)[..., None]
    cv[:] = base * (1 - m) + dot * m


def checker(cv, c1, c2, t=0.0, size=120, speed=(60, 40), rot=0.0):
    yy, xx = yx()
    if rot:
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        xx, yy = xx * c - yy * s, xx * s + yy * c
    a = np.floor((xx + t * speed[0]) / size) + np.floor((yy + t * speed[1]) / size)
    m = (a % 2)[..., None]
    cv[:] = c1 * (1 - m) + c2 * m


def stripes(cv, c1, c2, t=0.0, width=70, speed=120, angle=35):
    yy, xx = yx()
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    u = xx * c + yy * s + t * speed
    m = np.clip((np.abs((u / width) % 2 - 1) - 0.5) * 30 + 0.5, 0, 1)[..., None]
    cv[:] = c1 * (1 - m) + c2 * m


def speedlines(cv, t, color=(1, 1, 1), n=90, cx=W / 2, cy=H / 2, inner=330, alpha=0.8, seed=0):
    r, ang = grid(cx, cy)
    fr = int(t * 30 / 2)
    g = rnd((seed, fr))
    angs = g.uniform(-np.pi, np.pi, n)
    widths = g.uniform(0.004, 0.016, n)
    m = np.zeros(r.shape, np.float32)
    for a0, w in zip(angs, widths):
        d = np.abs((ang - a0 + np.pi) % (2 * np.pi) - np.pi)
        m = np.maximum(m, np.clip((w - d) / w * 2, 0, 1))
    m *= np.clip((r - inner) / 260, 0, 1)
    m = (m * alpha)[..., None]
    cv[:] = cv * (1 - m) + np.array(color, np.float32) * m


# ---------------------------------------------------------- post effects
_vig = None


def vignette(cv, strength=0.35):
    global _vig
    if _vig is None:
        r, _ = grid()
        _vig = (1 - np.clip((r / 1100) ** 2.2, 0, 1))[..., None].astype(np.float32)
    cv *= 1 - strength + strength * _vig


def chroma(cv, px):
    px = int(round(px))
    if px <= 0:
        return
    r = cv[..., 0].copy()
    b = cv[..., 2].copy()
    cv[:, px:, 0] = r[:, :-px]
    cv[:, :-px, 2] = b[:, px:]


def camera(cv, zoom=1.0, rot=0.0, dx=0.0, dy=0.0):
    if abs(zoom - 1) < 1e-4 and abs(rot) < 1e-3 and abs(dx) < 0.05 and abs(dy) < 0.05:
        return cv
    Mx = M(W / 2 + dx, H / 2 + dy, zoom, rot, ax=W / 2, ay=H / 2)
    return cv2.warpAffine(cv, Mx[:2], (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def flash(cv, a, color=(1, 1, 1)):
    if a > 0:
        cv[:] = cv * (1 - a) + np.array(color, np.float32) * a


def invert(cv):
    cv[:] = 1 - np.clip(cv, 0, 1)


def hue_rotate(cv, deg):
    u8 = (np.clip(cv, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV)
    hsv[..., 0] = ((hsv[..., 0].astype(np.int32) + int(deg / 2)) % 180).astype(np.uint8)
    cv[:] = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB).astype(np.float32) / 255


def deepfry(cv, amount=1.0, seed=0):
    u8 = (np.clip(cv, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * (1 + 1.6 * amount), 0, 255)
    u8 = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    f = u8.astype(np.float32) / 255
    f = np.clip((f - 0.5) * (1 + 0.6 * amount) + 0.5 + 0.04 * amount, 0, 1)
    k = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], np.float32)
    f = cv2.filter2D(f, -1, k * amount + np.array([[0, 0, 0], [0, 1, 0], [0, 0, 0]], np.float32) * (1 - amount))
    u8 = (np.clip(f, 0, 1) * 255).astype(np.uint8)
    q = int(max(4, 30 - 24 * amount))
    ok, enc = cv2.imencode(".jpg", cv2.cvtColor(u8, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
    u8 = cv2.cvtColor(cv2.imdecode(enc, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    cv[:] = u8.astype(np.float32) / 255


def glitch_slices(cv, t, amount=1.0, seed=0):
    g = rnd((seed, int(t * 30)))
    n = int(6 + 10 * amount)
    for _ in range(n):
        y0 = int(g.uniform(0, H - 10))
        h = int(g.uniform(6, 60 * amount + 8))
        dx = int(g.uniform(-120, 120) * amount)
        sl = cv[y0 : y0 + h].copy()
        cv[y0 : y0 + h] = np.roll(sl, dx, axis=1)
        if g.random() < 0.4:
            ch = g.integers(0, 3)
            cv[y0 : y0 + h, :, ch] = np.roll(sl[..., ch], dx // 2 + 8, axis=1)


def kaleido(cv):
    h2, w2 = H // 2, W // 2
    q = cv[:h2, :w2].copy()
    cv[:h2, w2 : w2 * 2] = q[:, ::-1]
    cv[h2 : h2 * 2, :w2] = q[::-1]
    cv[h2 : h2 * 2, w2 : w2 * 2] = q[::-1, ::-1]


def scanlines(cv, alpha=0.15, t=0.0):
    y = np.arange(H)
    m = (((y + int(t * 60)) // 3) % 2 == 0).astype(np.float32)[:, None, None]
    cv *= 1 - alpha * m


def to_u8(cv):
    return (np.clip(cv, 0, 1) * 255 + 0.5).astype(np.uint8)


# ------------------------------------------------------------- shapes
def rounded_rect(w, h, r, fill_rgba, border=None, shadow=None, ss=2):
    """PIL RGBA image of a rounded rectangle (supersampled)."""
    pad = 0
    if shadow:
        pad = int(shadow[2] * 3 + max(abs(shadow[0]), abs(shadow[1])))
    im = Image.new("RGBA", ((w + 2 * pad) * ss, (h + 2 * pad) * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = [pad * ss, pad * ss, (pad + w) * ss - 1, (pad + h) * ss - 1]
    if border:
        d.rounded_rectangle(box, r * ss, fill=fill_rgba, outline=border[0], width=border[1] * ss)
    else:
        d.rounded_rectangle(box, r * ss, fill=fill_rgba)
    im = im.resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS)
    if shadow:
        a = np.asarray(im, np.float32)[..., 3] / 255
        sh = cv2.GaussianBlur(a, (0, 0), shadow[2])
        sh = cv2.warpAffine(sh, np.float32([[1, 0, shadow[0]], [0, 1, shadow[1]]]), (a.shape[1], a.shape[0]))
        base = np.zeros(a.shape + (4,), np.float32)
        base[..., 3] = sh * shadow[3]
        top = np.asarray(im, np.float32) / 255
        ta = top[..., 3:4]
        base[..., :3] = top[..., :3] * ta
        base[..., 3:4] = ta + base[..., 3:4] * (1 - ta)
        base[..., :3] = top[..., :3] * ta  # shadow is black
        return base, pad
    a = np.asarray(im, np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    return a, pad
