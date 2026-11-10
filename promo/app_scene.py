"""The 懵薯 desktop scene (cat, keyboard, paws, panel, bubbles, key pops),
rebuilt from the app's own assets and layout numbers (src/renderer/style.css,
src/shared/keyboard*.ts) so it looks like the real thing, then exaggerated."""

import math
import os

import cv2
import numpy as np
from PIL import Image

import gfx
from gfx import M, Sprite, blit, ease_out

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "renderer", "assets")

# ------------------------------------------------------------ keyboard map
KEYS = []


def _add(code, label, x, y, w=1, h=1):
    KEYS.append(dict(code=code, label=label, x=x, y=y, w=w, h=h))


def _row(codes, labels, y, start=0, widths=None):
    widths = widths or {}
    x = start
    for i, c in enumerate(codes):
        w = widths.get(i, 1)
        _add(c, labels[i], x, y, w)
        x += w


_add(1, "Esc", 0, 0)
for i in range(12):
    _add(59 + i if i < 10 else 87 + i - 10, f"F{i+1}", 2 + i + math.floor(i / 4) * 0.4, 0)
_row([41, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], ["~", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"], 1.4, 0, {13: 2})
_row([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 43], ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"], 2.4, 0, {0: 1.5, 13: 1.5})
_row([58, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 28], ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"], 3.4, 0, {0: 1.75, 12: 2.25})
_row([42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54], ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "RShift"], 4.4, 0, {0: 2.25, 11: 2.75})
_row([29, 3675, 56, 57, 3640, 3676, 3677, 3613], ["Ctrl", "Win", "Alt", "Space", "RAlt", "RWin", "Menu", "RCtrl"], 5.4, 0, {0: 1.25, 1: 1.25, 2: 1.25, 3: 6.25, 4: 1.25, 5: 1.25, 6: 1.25, 7: 1.25})
_row([3639, 70, 3653], ["PrtSc", "ScrLk", "Pause"], 0, 15.6)
_row([3666, 3655, 3657], ["Ins", "Home", "PgUp"], 1.4, 15.6)
_row([3667, 3663, 3665], ["Del", "End", "PgDn"], 2.4, 15.6)
_add(57416, "Up", 16.6, 4.4)
_row([57419, 57424, 57421], ["Left", "Down", "Right"], 5.4, 15.6)
_row([69, 3637, 55, 74], ["Num", "N/", "N*", "N-"], 1.4, 19.2)
_row([71, 72, 73], ["N7", "N8", "N9"], 2.4, 19.2)
_add(78, "N+", 22.2, 2.4, 1, 2)
_row([75, 76, 77], ["N4", "N5", "N6"], 3.4, 19.2)
_row([79, 80, 81], ["N1", "N2", "N3"], 4.4, 19.2)
_add(3612, "NEnter", 22.2, 4.4, 1, 2)
_add(82, "N0", 19.2, 5.4, 2)
_add(83, "N.", 21.2, 5.4)

KV = dict(left=94, top=630, width=930, height=310)  # keyboardView
SURF = {}


def _surface(code, x, y, w, h=54):
    SURF[code] = (x * KV["width"] / 2048, y * KV["height"] / 683, w * KV["width"] / 2048, h * KV["height"] / 683)


_cuts = [
    [105, 191, 278, 362, 448, 533, 617, 702, 787, 873, 957, 1040, 1125, 1208, 1378],
    [96, 230, 317, 404, 491, 576, 661, 746, 831, 917, 1002, 1088, 1173, 1258, 1384],
    [90, 250, 340, 428, 516, 604, 692, 780, 868, 955, 1042, 1131, 1204, 1387],
    [82, 299, 386, 473, 562, 649, 737, 824, 912, 999, 1087, 1172, 1391],
    [75, 196, 305, 427, 948, 1066, 1175, 1284, 1395],
]
_rowY = [170, 252, 330, 406, 482]
for _r, _xs in enumerate(_cuts):
    _ks = [k for k in KEYS if k["x"] < 15 and abs(k["y"] - (_r + 1.4)) < 0.01]
    for _i, _k in enumerate(_ks):
        _surface(_k["code"], _xs[_i] + 4, _rowY[_r] + 2, _xs[_i + 1] - _xs[_i] - 9)
_fx = [112, 282, 369, 455, 541, 659, 746, 831, 916, 1042, 1127, 1213, 1297]
for _i, _k in enumerate([k for k in KEYS if k["y"] == 0 and k["x"] < 15]):
    _surface(_k["code"], _fx[_i] + 4, 69, 86 if _i == 0 else 70, 56)
for _k in [k for k in KEYS if 15.6 <= k["x"] < 19]:
    _row_i = round(_k["y"] - 1.4)
    _x = 1399 if _k["y"] == 0 else (1408 if _row_i < 2 else 1418)
    _surface(_k["code"], _x + round(_k["x"] - 15.6) * 87 + 4, 69 if _k["y"] == 0 else _rowY[_row_i] + 2, 72, 54)
for _k in [k for k in KEYS if k["x"] >= 19.2]:
    _row_i = round(_k["y"] - 1.4)
    _x = [1675, 1677, 1681, 1688, 1695][_row_i]
    _col = round(_k["x"] - 19.2)
    _off = 140 if (_row_i == 4 and _col == 2) else _col * 78
    _w = 132 if (_row_i == 4 and _k["w"] == 2) else _k["w"] * 78 - 9
    _h = (_rowY[_row_i + 1] - _rowY[_row_i] + 54) if _k["h"] == 2 else 54
    _surface(_k["code"], _x + _off + 4, _rowY[_row_i] + 2, _w, _h)

BY_LABEL = {k["label"]: k for k in KEYS}


def key_center(label):
    k = BY_LABEL[label]
    x, y, w, h = SURF[k["code"]]
    return KV["left"] + x + w / 2, KV["top"] + y + h / 2


def key_rect(label):
    k = BY_LABEL[label]
    x, y, w, h = SURF[k["code"]]
    return KV["left"] + x, KV["top"] + y, w, h


def key_side(label):
    """'L' = screen-left paw (cat's right), as in src.tsx latest()."""
    return "L" if BY_LABEL[label]["x"] < 7.5 else "R"


REST = {"L": "R", "R": "="}

# ----------------------------------------------------------------- assets
_assets = {}


def _load():
    if _assets:
        return _assets
    cat = Image.open(os.path.join(ASSETS, "cat.png")).convert("RGBA")
    kb = Image.open(os.path.join(ASSETS, "keyboard.png")).convert("RGBA")
    _assets["cat"] = Sprite.from_pil(cat)
    _assets["kb"] = Sprite.from_pil(kb)
    for side, fn, dw in [("L", "paw-left.png", 156.62), ("R", "paw-right.png", 143.75)]:
        im = Image.open(os.path.join(ASSETS, fn)).convert("RGBA")
        a = np.asarray(im, np.float32) / 255
        h = a.shape[0]
        ramp = np.clip(np.linspace(0, 1, h) / 0.24, 0, 1)[:, None]
        a[..., 3] *= ramp
        if side == "L":  # filter: brightness(.84) saturate(.86)
            rgb = a[..., :3] * 0.84
            lum = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
            a[..., :3] = lum + (rgb - lum) * 0.86
        a[..., :3] *= a[..., 3:4]
        _assets["paw" + side] = Sprite(a)
        _assets["paw" + side + "_size"] = (dw, 244.0)
    # soft shadows (pre-blurred alpha)
    for name, blur, dark in [("cat", 10, 0.30), ("kb", 9, 0.35)]:
        s = _assets[name].levels[1]
        al = s[..., 3]
        pad = 40
        al = np.pad(al, pad)
        al = cv2.GaussianBlur(al, (0, 0), blur)
        sh = np.zeros(al.shape + (4,), np.float32)
        sh[..., 3] = al * dark
        sh[..., :3] = 0.06 * sh[..., 3:4]
        _assets[name + "_sh"] = (Sprite(sh), pad)
    return _assets


# Scene-space placements (CSS px in the 1440x960 scene).
CAT_K = min(790 / 1216, 760 / 1131)
CAT_X, CAT_Y = 170 + (790 - 1216 * CAT_K) / 2, 40 + (760 - 1131 * CAT_K) / 2
CAT_CX, CAT_CY = CAT_X + 1216 * CAT_K / 2, CAT_Y + 1131 * CAT_K / 2
CAT_BOTTOM = CAT_Y + 1131 * CAT_K
KB_K = KV["width"] / 2172
EYES = [(CAT_X + 230 * CAT_K, CAT_Y + 356 * CAT_K), (CAT_X + 524 * CAT_K, CAT_Y + 330 * CAT_K)]
HEAD = (CAT_X + 380 * CAT_K, CAT_Y + 330 * CAT_K)
NOSE = (CAT_X + 390 * CAT_K, CAT_Y + 440 * CAT_K)
PANEL = (KV["left"] + 0.814 * KV["width"], KV["top"] + 0.074 * KV["height"], 0.142 * KV["width"], 53)


# ------------------------------------------------------------- paw motion
class PawTrack:
    """Follows key presses like src.tsx: paw moves to the pressed key (CSS
    transition ~110ms ease-out), back to its rest key on release."""

    def __init__(self, events, side, hold=0.085, move=0.11):
        self.side = side
        rest = key_center(REST[side])
        self.segments = []  # (t_change, target_xy, pressed)
        self.segments.append((-10.0, rest, False))
        for t, label in events:
            if label not in BY_LABEL or key_side(label) != side:
                continue
            self.segments.append((t, key_center(label), True))
            self.segments.append((t + hold, rest, False))
        self.segments.sort(key=lambda s: s[0])
        self.move = move
        self.rest = rest

    def state(self, t):
        start, tgt, tc, pr = self.rest, self.rest, -10.0, False
        for tc2, tgt2, pr2 in self.segments[1:]:
            if tc2 > t:
                break
            k = ease_out((tc2 - tc) / self.move, 2)
            p = (start[0] + (tgt[0] - start[0]) * k, start[1] + (tgt[1] - start[1]) * k)
            start, tgt, tc, pr = p, tgt2, tc2, pr2
        u = (t - tc) / self.move
        k = ease_out(u, 2)
        pos = (start[0] + (tgt[0] - start[0]) * k, start[1] + (tgt[1] - start[1]) * k)
        dist = math.hypot(tgt[0] - start[0], tgt[1] - start[1])
        lift = math.sin(math.pi * min(1.0, u)) * min(30, dist * 0.35) if u < 1 else 0.0
        return pos, pr, lift


def paw_matrix(side, x, y, rest_xy, pressed, lift=0.0, extra_rot=0.0, scale=1.0):
    a = _load()
    spr = a["paw" + side]
    dw, dh = a["paw" + side + "_size"]
    reach = max(-7, min(7, (rest_xy[0] - x) * 0.022 + (y - rest_xy[1]) * 0.015))
    rot = (-5 if side == "R" else 5) + reach + extra_rot
    s = (0.96 if pressed else 1.0) * scale
    sx, sy = dw / spr.w, dh / spr.h
    # bottom-centre anchor sits 3% of the height below the key centre
    return M(x, y + 0.03 * dh - lift, s, rot, sx=sx, sy=sy, ax=spr.w / 2, ay=spr.h)


# -------------------------------------------------------------- drawing
def draw_scene(cv, cam, st=None):
    """cam: 3x3 scene->screen. st: dict of overrides:
    cat_dx, cat_dy, cat_rot, cat_s, cat_sy (squash), cat_alpha,
    kb_dx, kb_dy, kb_rot, kb_s,
    pawL / pawR: dict(x,y,pressed,lift) or dict(M=...) full override,
    hide: set of element names, panel: callable(cv, cam) or None,
    flash_keys: list of (label, amount)
    """
    st = st or {}
    a = _load()
    hide = st.get("hide", set())

    def el(name, cx, cy):
        dx, dy = st.get(name + "_dx", 0.0), st.get(name + "_dy", 0.0)
        rot, s = st.get(name + "_rot", 0.0), st.get(name + "_s", 1.0)
        sy = st.get(name + "_sy", 1.0)
        return M(cx + dx, cy + dy, s, rot, sx=1.0, sy=sy, ax=cx, ay=cy)

    # --- cat (behind keyboard)
    cat_pivot_y = CAT_BOTTOM - 40
    cm = el("cat", CAT_CX, cat_pivot_y) @ M(CAT_X, CAT_Y, CAT_K)
    if "cat" not in hide:
        sh, pad = a["cat_sh"]
        f = a["cat"].w / a["cat"].levels[1].shape[1]
        blit(cv, sh, cam @ cm @ M(-pad * f, -pad * f + 14, f), st.get("cat_alpha", 1.0) * 0.9)
        blit(cv, a["cat"], cam @ cm, st.get("cat_alpha", 1.0))
    # --- desk shadow + keyboard
    km = el("kb", KV["left"] + KV["width"] / 2, KV["top"] + KV["height"] / 2) @ M(KV["left"], KV["top"], KB_K)
    if "kb" not in hide:
        sh, pad = a["kb_sh"]
        f = a["kb"].w / a["kb"].levels[1].shape[1]
        blit(cv, sh, cam @ km @ M(-pad * f, -pad * f + 26, f), st.get("kb_alpha", 1.0))
        blit(cv, a["kb"], cam @ km, st.get("kb_alpha", 1.0))
        for label, amt in st.get("flash_keys", []):
            x, y, w, h = key_rect(label)
            glow = _key_glow()
            blit(cv, glow, cam @ km @ np.linalg.inv(M(KV["left"], KV["top"], KB_K)) @ M(x + w / 2, y + h / 2, 1.0, 0, sx=w / 60, sy=h / 40, ax=glow.w / 2, ay=glow.h / 2), amt, mode="add")
        if st.get("panel"):
            st["panel"](cv, cam @ km @ np.linalg.inv(M(KV["left"], KV["top"], KB_K)))
    # --- paws
    for side in ("L", "R"):
        if "paw" + side in hide:
            continue
        p = st.get("paw" + side)
        rest = key_center(REST[side])
        if p is None:
            pm = paw_matrix(side, rest[0], rest[1], rest, False)
        elif "M" in p:
            pm = p["M"]
        else:
            pm = paw_matrix(side, p["x"], p["y"], rest, p.get("pressed", False), p.get("lift", 0.0), p.get("rot", 0.0))
        pm = el("paw" + side, rest[0], rest[1] - 100) @ pm
        blit(cv, a["paw" + side], cam @ pm, st.get("paw_alpha", 1.0))
    return cm, km


_glow = None


def _key_glow():
    global _glow
    if _glow is None:
        yy, xx = np.mgrid[0:40, 0:60].astype(np.float32)
        d = np.maximum(np.abs(xx - 29.5) / 30, np.abs(yy - 19.5) / 20)
        a = np.clip(1.2 - d, 0, 1) ** 1.5 * 0.55
        g = np.zeros((40, 60, 4), np.float32)
        g[..., :3] = np.array([1.0, 0.95, 0.7]) * a[..., None]
        g[..., 3] = a
        _glow = Sprite(g)
    return _glow


# ------------------------------------------------------------ panel look
def panel_sprite(keys_text, time_text, look="normal", t=0.0):
    """Stats panel content at 4x (528x212)."""
    from PIL import ImageDraw

    S = 4
    w, h = int(132 * S), int(53 * S)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    looks = {
        "normal": ((229, 233, 207), (213, 221, 186), (121, 134, 93), (99, 112, 77), (53, 65, 62)),
        "neon": ((20, 10, 40), (40, 10, 70), (255, 60, 200), (120, 255, 240), (255, 120, 230)),
        "matrix": ((5, 20, 8), (0, 40, 10), (40, 200, 80), (80, 255, 120), (160, 255, 170)),
        "sunset": ((255, 190, 120), (255, 110, 140), (180, 60, 90), (110, 30, 60), (90, 20, 50)),
        "ocean": ((150, 220, 255), (60, 140, 230), (30, 80, 160), (20, 50, 110), (10, 30, 80)),
        "candy": ((255, 230, 245), (255, 190, 220), (230, 110, 170), (180, 60, 130), (140, 40, 100)),
        "lcd": ((170, 190, 120), (140, 160, 90), (60, 70, 40), (40, 50, 25), (30, 40, 20)),
        "rest": ((255, 243, 214), (255, 222, 170), (200, 140, 60), (150, 90, 30), (120, 70, 20)),
    }
    c1, c2, border, lab, val = looks.get(look, looks["normal"])
    grad = Image.new("RGBA", (w, h))
    gd = ImageDraw.Draw(grad)
    for y in range(h):
        k = y / (h - 1)
        gd.line([(0, y), (w, y)], fill=tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3)) + (255,))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], 7 * S, fill=255)
    im.paste(grad, (0, 0), mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], 7 * S, outline=border + (255,), width=S)
    f_lab = gfx.font("reg", 9 * S * 1.15)
    f_val = gfx.font("bold", 10 * S * 1.15)
    d.text((8 * S, 15 * S), "敲薯", font=f_lab, fill=lab + (255,), anchor="lm")
    d.text((w - 8 * S, 15 * S), keys_text, font=f_val, fill=val + (255,), anchor="rm")
    d.line([(8 * S, h // 2), (w - 8 * S, h // 2)], fill=border + (90,), width=S)
    d.text((8 * S, 39 * S), "今日工作", font=f_lab, fill=lab + (255,), anchor="lm")
    d.text((w - 8 * S, 39 * S), time_text, font=f_val, fill=val + (255,), anchor="rm")
    if look == "matrix":
        g = np.random.default_rng(int(t * 10))
        for _ in range(26):
            x, y = g.uniform(0, w), g.uniform(0, h)
            d.text((x, y), g.choice(list("01喵薯")), font=gfx.font("bold", 8 * S), fill=(60, 255, 120, 90), anchor="mm")
    if look in ("neon", "candy"):
        for k in range(8):
            ang = t * 3 + k * 0.785
            x, y = w / 2 + math.cos(ang) * w * 0.42, h / 2 + math.sin(ang) * h * 0.38
            d.text((x, y), "✦" if look == "neon" else "♥", font=gfx.font("sym" if look == "neon" else "bold", 9 * S), fill=border + (200,), anchor="mm")
    return Sprite.from_pil(im)


def panel_drawer(spr):
    """Callable for draw_scene(panel=...): maps the panel with the app's tilt
    (rotateX 27deg ~ vertical squash, skewX 6deg)."""
    px, py, pw, ph = PANEL

    def draw(cv, kbcam):
        cx, cy = px + pw / 2, py + ph / 2
        sk = math.tan(math.radians(6))
        A = np.array([[1, sk, 0], [0, math.cos(math.radians(27)), 0], [0, 0, 1.0]])
        m = M(cx, cy) @ A @ M(0, 0, pw / spr.w, ax=spr.w / 2, ay=spr.h / 2)
        blit(cv, spr, kbcam @ np.linalg.inv(M(0, 0)) @ m)

    return draw


# ---------------------------------------------------------------- bubble
def bubble_sprite(text, size=34, maxw=560, rest=False, button_pressed=False):
    """App-style speech bubble (cream, rounded, tail on the left)."""
    from PIL import ImageDraw

    lines = gfx.wrap(text, "reg", size, maxw)
    lh = size * 1.62
    tw = max(gfx.layout(l, "reg", size)[1] for l in lines)
    padx, pady = size * 1.2, size * 0.9
    foot = size * 2.4 if rest else 0
    bw = int(max(tw, size * 12 if rest else 0) + 2 * padx)
    bh = int(len(lines) * lh + 2 * pady + foot)
    tail = int(size * 0.7)
    pad = int(size * 0.8)
    S = 2
    W_, H_ = (bw + tail + 2 * pad) * S, (bh + 2 * pad) * S
    im = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0 = (pad + tail) * S, pad * S
    r = int(size * 1.15) * S
    # shadow
    sh = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + 10 * S, x0 + bw * S, y0 + bh * S + 10 * S], r, fill=(20, 41, 29, 60))
    arr = np.asarray(sh, np.float32)
    arr[..., 3] = cv2.GaussianBlur(arr[..., 3], (0, 0), 14 * S)
    im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    fillc = (255, 253, 240, 250)
    d.rounded_rectangle([x0, y0, x0 + bw * S, y0 + bh * S], r, fill=fillc)
    ty = y0 + int(size * 1.35) * S
    d.polygon([(x0 + 2, ty - int(size * 0.5) * S), (x0 - tail * S, ty), (x0 + 2, ty + int(size * 0.5) * S)], fill=fillc)
    f = gfx.font("reg", size * S)
    for i, l in enumerate(lines):
        runs, _ = gfx.layout(l, "reg", size * S)
        by = y0 + pady * S + i * lh * S + size * S * 0.95
        for x, ch, fn, sz in runs:
            ff = gfx.font(fn, sz)
            if fn == "emoji":
                d.text((x0 + padx * S + x, by), ch, font=ff, embedded_color=True, anchor="ls")
            else:
                d.text((x0 + padx * S + x, by), ch, font=ff, fill=(83, 97, 75, 255), anchor="ls")
    if rest:
        fy = y0 + (pady + len(lines) * lh + size * 1.1) * S
        d.text((x0 + padx * S, fy), "休息一下吧~", font=gfx.font("reg", size * 0.8 * S), fill=(83, 97, 75, 255), anchor="lm")
        bwid, bht = size * 4.6 * S, size * 1.6 * S
        bx1 = x0 + bw * S - padx * S
        bx0 = bx1 - bwid
        col = (205, 216, 188, 255) if button_pressed else (225, 230, 214, 255)
        d.rounded_rectangle([bx0, fy - bht / 2, bx1, fy + bht / 2], int(size * 0.45 * S), fill=col)
        d.text(((bx0 + bx1) / 2, fy), "我知道了", font=gfx.font("reg", size * 0.8 * S), fill=(69, 82, 61, 255), anchor="mm")
        button = ((bx0 + bx1) / 2 / S, fy / S)
    else:
        button = None
    im = im.resize((W_ // S, H_ // S), Image.LANCZOS)
    spr = Sprite.from_pil(im)
    spr.tail = (pad, (y0 / S + size * 1.35))  # tail tip in sprite px
    spr.button = button
    return spr


# -------------------------------------------------------------- key pops
POP_COLORS = ["#e8885a", "#d9a43a", "#6f9a4f", "#4f8fb3", "#c06b9b", "#8a74c9", "#d0675f"]


def pop_sprite(text, kind="plain", size=40, color=None):
    """key-pops.css styles, scaled up for video."""
    if kind in ("shortcut", "word"):
        fg = (47, 93, 58) if kind == "shortcut" else (106, 59, 18)
        bg = (219, 233, 200, 255) if kind == "shortcut" else (255, 227, 154, 255)
        fs = size * (0.9 if kind == "shortcut" else 1.1)
        ts = gfx.text_sprite(text, fs, "bold", fill=fg, strokes=())
        tw, th = ts.w - 2 * int(fs * 0.25), int(fs * 1.25)
        padx, pady = int(fs * 0.55), int(fs * 0.3)
        w, h = tw + 2 * padx, th + 2 * pady
        arr, _ = gfx.rounded_rect(w + 6, h + 8, int(fs * 0.6), (45, 42, 36, 255))
        inner, _ = gfx.rounded_rect(w - 2, h - 2, int(fs * 0.55), bg)
        base = np.zeros((h + 8, w + 6, 4), np.float32)
        base[:] = arr
        ih, iw = inner.shape[:2]
        reg = base[2 : 2 + ih, 3 : 3 + iw]
        ia = inner[..., 3:4]
        reg[:] = reg * (1 - ia) + inner
        spr = Sprite(base)
        out = np.zeros((max(spr.h, ts.h) + 8, max(spr.w, ts.w) + 8, 4), np.float32)
        oy, ox = (out.shape[0] - spr.h) // 2, (out.shape[1] - spr.w) // 2
        out[oy : oy + spr.h, ox : ox + spr.w] = spr.levels[0]
        ty, tx = max(0, (out.shape[0] - ts.h) // 2 - 3), max(0, (out.shape[1] - ts.w) // 2)
        reg = out[ty : ty + ts.h, tx : tx + ts.w]
        ta = ts.levels[0][..., 3:4]
        reg[:] = reg * (1 - ta) + ts.levels[0]
        return Sprite(out)
    if kind == "heart":
        return gfx.text_sprite("♥", size * 1.1, "bold", fill=(239, 111, 143), strokes=((255, 255, 255, 3),))
    c = color or POP_COLORS[gfx.stable_hash(text) % len(POP_COLORS)]
    rgb = tuple(int(c.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    if kind == "special":
        rgb = (238, 125, 63)
        size *= 1.1
    return gfx.text_sprite(text, size, "bold", fill=rgb, strokes=((45, 42, 36, max(2, int(size / 9))),), shadow=(0, max(2, int(size / 9)), (45, 42, 36), 1.0))


def pop_motion(kind, age, life, dx, spin):
    """(oy offset, ox offset, scale, rot, alpha) for pop-rise/hop/wobble."""
    p = age / life
    if p < 0 or p > 1:
        return None
    if kind == "hop":
        keys = [(0, 0, 0, 0.3, 0, 0), (0.25, 0.5, -64, 1.12, spin, 1), (0.55, 0.8, -40, 1.0, spin, 1), (1, 1, -70, 0.9, 0, 0)]
    elif kind == "wobble":
        keys = [(0, 0, 0, 0.3, 0, 0), (0.2, 0, -34, 1.15, -10, 1), (0.4, 0.4, -50, 1.0, 9, 1), (0.6, 0.7, -66, 1.0, -6, 1), (1, 1, -90, 0.9, 0, 0)]
    else:
        keys = [(0, 0, 0, 0.3, 0, 0), (0.18, 0.3, -30, 1.18, spin, 1), (0.7, 0.75, -75, 1.0, spin, 1), (1, 1, -92, 0.92, spin, 0)]
    for (p0, *a), (p1, *b) in zip(keys, keys[1:]):
        if p0 <= p <= p1:
            k = (p - p0) / (p1 - p0)
            k = 1 - (1 - k) ** 2.2  # cubic-bezier(.2,.9,.4,1)-ish
            vals = [x + (y - x) * k for x, y in zip(a, b)]
            fx, oy, s, rot, al = vals
            return oy, fx * dx, s, rot, al
    return None
