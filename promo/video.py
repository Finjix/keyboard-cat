"""Render the promo picture, frame by frame, in sync with score.py.

python video.py --frames 100,200      # write preview PNGs to work/preview
python video.py --render              # render all frames (parallel) to work/chunks
"""

import math
import os
import subprocess
import sys
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app_scene as A  # noqa: E402
import gfx as G  # noqa: E402
from gfx import H, M, W, Sprite, blit, blit_at, clamp01, ease_back, ease_in, ease_io, ease_out, huazi, lerp  # noqa: E402
from score import (  # noqa: E402
    ANIMAL_SEQ,
    BAR,
    BEAT,
    CLICKS,
    FPS,
    FRENZY_LAND,
    FRENZY_RETURN,
    FRENZY_START,
    HITS,
    NFRAMES,
    PET_MEOW_CLICKS,
    STEP,
    TYPING,
    T,
    section_at,
)

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
C = G.col

# ------------------------------------------------------------------ hits
KICKS = [(t, s) for t, k, s in HITS if k == "kick"]
SNARES = [(t, s) for t, k, s in HITS if k == "snare"]


def env(t, hits, tau=0.09, look=0.6):
    v = 0.0
    for ti, s in hits:
        d = t - ti
        if 0 <= d < look:
            v += s * math.exp(-d / tau)
    return v


def last_hit(t, hits):
    best = None
    for i, (ti, s) in enumerate(hits):
        if ti <= t:
            best = (i, ti, s)
        else:
            break
    return best


def shake(t, hits, amp, tau=0.12, seed=0):
    h = last_hit(t, hits)
    if not h:
        return 0.0, 0.0, 0.0
    i, ti, s = h
    d = t - ti
    e = math.exp(-d / tau) * s * amp
    g = G.rnd((seed, i))
    a, b, c = g.uniform(-1, 1, 3)
    w = math.cos(d * 55)
    return a * e * w, b * e * w, c * e * w * 0.15


def appear(t, t0, dur=0.18):
    """Pop-in scale factor (0 -> overshoot -> 1)."""
    if t < t0:
        return 0.0
    return ease_back((t - t0) / dur, 2.2)


# --------------------------------------------------------------- props
@lru_cache(None)
def cursor_sprite(pressed=False):
    S = 3
    pts = [(0, 0), (0, 34), (9, 26.5), (15, 40), (21.5, 37.5), (15.5, 24.5), (27, 24.5)]
    im = Image.new("RGBA", (40 * S, 50 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    off = 4
    P = [((x + off) * S, (y + off) * S) for x, y in pts]
    d.polygon(P, fill=(255, 255, 255, 255) if not pressed else (255, 236, 170, 255), outline=(20, 20, 20, 255), width=int(2.4 * S))
    im = im.resize((40 * 2, 50 * 2), Image.LANCZOS)
    s = Sprite.from_pil(im)
    s.tip = (off * 2, off * 2)
    return s


def draw_cursor(cv, x, y, pressed=False, s=1.0):
    sp = cursor_sprite(pressed)
    blit(cv, sp, M(x, y, s * (0.9 if pressed else 1.0), 0, ax=sp.tip[0], ay=sp.tip[1]))


@lru_cache(None)
def ring_sprite():
    yy, xx = np.mgrid[0:200, 0:200].astype(np.float32)
    d = np.sqrt((xx - 99.5) ** 2 + (yy - 99.5) ** 2)
    a = np.clip(1 - np.abs(d - 88) / 7, 0, 1)
    out = np.zeros((200, 200, 4), np.float32)
    out[..., :3] = a[..., None]
    out[..., 3] = a
    return Sprite(out)


def click_ring(cv, x, y, age):
    if 0 <= age < 0.3:
        k = age / 0.3
        blit_at(cv, ring_sprite(), x, y, s=0.25 + 0.6 * ease_out(k), alpha=(1 - k) * 0.9)


@lru_cache(None)
def emoji(ch, size=120):
    return G.text_sprite(ch, size, "bold", strokes=())


@lru_cache(None)
def puff_sprite(r=60, color=(0.55, 0.55, 0.58)):
    yy, xx = np.mgrid[0 : 2 * r, 0 : 2 * r].astype(np.float32)
    d = np.sqrt((xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 0.8
    out = np.zeros((2 * r, 2 * r, 4), np.float32)
    out[..., :3] = np.array(color, np.float32) * a[..., None]
    out[..., 3] = a
    return Sprite(out)


@lru_cache(None)
def desktop_image():
    """A deliberately boring desktop (generic icons, no real OS branding)."""
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(92 - 30 * k), int(106 - 30 * k), int(124 - 28 * k)))
    # soft hills
    blob = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-300, 640, 1300, 1500], fill=60)
    bd.ellipse([800, 720, 2400, 1600], fill=40)
    from PIL import ImageFilter

    blob = blob.filter(ImageFilter.GaussianBlur(60))
    im = Image.composite(Image.new("RGB", (W, H), (150, 165, 180)), im, blob)
    d = ImageDraw.Draw(im)
    icons = [("folder", "新建文件夹"), ("folder", "新建文件夹 (2)"), ("doc", "周报_最终版_真的最终版.docx"), ("doc", "需求_v38.docx"), ("bin", "回收站"), ("pc", "此电脑")]
    f = G.font("reg", 20)
    for i, (kind, label) in enumerate(icons):
        x, y = 60, 40 + i * 150
        if kind == "folder":
            d.rounded_rectangle([x + 8, y + 14, x + 40, y + 26], 4, fill=(232, 182, 64))
            d.rounded_rectangle([x + 8, y + 22, x + 88, y + 84], 6, fill=(250, 204, 92))
        elif kind == "doc":
            d.rounded_rectangle([x + 18, y + 6, x + 78, y + 86], 4, fill=(245, 246, 250))
            d.rectangle([x + 18, y + 6, x + 78, y + 26], fill=(70, 110, 190))
            for k in range(4):
                d.line([(x + 26, y + 38 + k * 11), (x + 70, y + 38 + k * 11)], fill=(170, 175, 190), width=3)
        elif kind == "bin":
            d.rounded_rectangle([x + 24, y + 22, x + 72, y + 86], 6, fill=(200, 208, 220))
            d.rectangle([x + 18, y + 12, x + 78, y + 22], fill=(170, 180, 196))
        else:
            d.rounded_rectangle([x + 10, y + 14, x + 86, y + 64], 5, fill=(60, 70, 90), outline=(200, 210, 225), width=4)
            d.rectangle([x + 38, y + 64, x + 58, y + 78], fill=(200, 210, 225))
        lines = G.wrap(label, "reg", 20, 150)
        for li, l in enumerate(lines[:2]):
            d.text((x + 48 + 1, y + 110 + li * 26 + 1), l, font=f, fill=(0, 0, 0), anchor="mm")
            d.text((x + 48, y + 110 + li * 26), l, font=f, fill=(255, 255, 255), anchor="mm")
    # taskbar
    d.rectangle([0, H - 64, W, H], fill=(32, 36, 44))
    for k in range(6):
        x = W / 2 - 200 + k * 70
        d.rounded_rectangle([x, H - 50, x + 40, H - 14], 8, fill=[(90, 150, 230), (230, 180, 70), (110, 200, 140), (210, 90, 90), (150, 120, 220), (200, 200, 210)][k])
    d.text((W - 90, H - 44), "15:00", font=G.font("reg", 20), fill=(235, 235, 240), anchor="mm")
    d.text((W - 90, H - 20), "2026/11/10", font=G.font("reg", 16), fill=(200, 200, 210), anchor="mm")
    a = np.asarray(im, np.float32) / 255
    return a


@lru_cache(None)
def desktop_icons_sprite():
    """Just the icon column (for drawing icons ON TOP of the cat)."""
    full = desktop_image()
    bg = Image.new("RGB", (W, H))
    # re-draw icons onto transparent
    im = Image.new("RGBA", (260, H), (0, 0, 0, 0))
    src = (full[:, :260] * 255).astype(np.uint8)
    # alpha: where icon pixels differ strongly from the wallpaper gradient
    wall = np.zeros_like(full[:, :260])
    for y in range(H):
        k = y / H
        wall[y] = np.array([92 - 30 * k, 106 - 30 * k, 124 - 28 * k]) / 255
    diff = np.abs(full[:, :260] - wall).max(-1)
    a = np.clip((diff - 0.08) * 6, 0, 1)
    a[H - 64 :] = 0
    out = np.zeros((H, 260, 4), np.float32)
    out[..., :3] = full[:, :260] * a[..., None]
    out[..., 3] = a
    del im, bg, src
    return Sprite(out)


@lru_cache(None)
def cat_head_sticker():
    a = A._load()["cat"].levels[1]  # half res
    h = int(a.shape[0] * 0.66)
    crop = a[:h, : int(a.shape[1] * 0.78)].copy()
    al = crop[..., 3]
    import cv2

    pad = 14
    al = np.pad(al, pad)
    rgb = np.pad(crop[..., :3], ((pad, pad), (pad, pad), (0, 0)))
    ring = cv2.dilate(al, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * 9 + 1, 2 * 9 + 1)))
    out = np.zeros(al.shape + (4,), np.float32)
    out[..., :3] = ring[..., None]
    out[..., 3] = ring
    ia = al[..., None]
    out[..., :3] = out[..., :3] * (1 - ia) + rgb
    out[..., 3:4] = out[..., 3:4] * (1 - ia) + ia
    return Sprite(out)


# ------------------------------------------------------------ scene bits
PAWS = {s: A.PawTrack([(t, k) for t, k, _ in TYPING], s) for s in ("L", "R")}
POP_WORDS = ["啪", "哒", "咚", "嗒", "噗", "叮", "乓", "啵", "咻", "咕噜", "噼啪", "喵呜", "呼噜", "踩踩", "爪！", "喵！", "好耶", "丝滑", "好手速", "稳了", "啪嗒", "哒哒哒", "噼里啪啦", "叮咚", "好薯", "咔哒", "扑通", "嘿咻", "蹭蹭", "肉垫"]
SPECIAL_TEXT = {"Enter": "发射！", "Backspace": "后悔药", "Esc": "溜了溜了", "Space": "懵薯！"}


def _make_pops():
    pops = []
    ctrl_text = {"C": "复制！", "V": "贴贴", "Z": "时光倒流"}
    for i, (t, key, kind) in enumerate(TYPING):
        g = G.rnd(("pop", i))
        x, y = A.key_center(key)
        motion = ["rise", "hop", "wobble"][int(g.integers(0, 3))]
        if kind == "special":
            txt, k = SPECIAL_TEXT[key], "special"
        elif kind == "ctrl":
            txt, k = ctrl_text[key], "shortcut"
        else:
            txt, k = POP_WORDS[int(g.integers(0, len(POP_WORDS)))], "plain"
        pops.append(dict(t=t, x=x, y=y - 10, text=txt, kind=k, motion=motion, dx=float(g.uniform(-40, 40)), spin=float(g.uniform(-12, 12)), life=0.9 if k != "plain" else 0.75))
    return pops


POPS = _make_pops()


def draw_pops(cv, cam, t, t_from, t_to, scale=1.0, size=46):
    for p in POPS:
        if not (t_from <= p["t"] < t_to):
            continue
        mo = A.pop_motion(p["motion"], t - p["t"], p["life"], p["dx"], p["spin"])
        if not mo:
            continue
        oy, ox, s, rot, al = mo
        sp = A.pop_sprite(p["text"], p["kind"], size)
        x, y = G.apply(cam, p["x"] + ox * 1.6, p["y"] + oy * 1.6)
        blit_at(cv, sp, x, y, s=s * scale, rot=rot, alpha=al)


def paw_state(t):
    st = {}
    for side in ("L", "R"):
        pos, pr, lift = PAWS[side].state(t)
        st["paw" + side] = dict(x=pos[0], y=pos[1], pressed=pr, lift=lift)
    return st


def pressed_keys(t, t_from, t_to):
    out = []
    for tk, key, _ in TYPING:
        if t_from <= tk <= t < tk + 0.16:
            out.append((key, 1 - (t - tk) / 0.16))
    return out


def scene_cam(cx, cy, z, sx=W / 2, sy=H / 2, rot=0.0):
    return M(sx, sy, z, rot, ax=cx, ay=cy)


def cat_hop(t, times, height=26.0):
    dy, sy = 0.0, 1.0
    for tc in times:
        k = t - tc
        if 0 <= k < 0.45:
            if k < 0.26:
                dy = -height * math.sin(math.pi * k / 0.26)
                sy = 1 + 0.03 * math.sin(math.pi * k / 0.26)
            else:
                sy = 1 - 0.05 * math.exp(-(k - 0.26) / 0.05) * math.cos((k - 0.26) * 30)
    return dy, sy


def caption(cv, text, x, y, size, style, t, t0, t1=None, rot=0.0, fnt="bold", alpha=1.0, pulse=0.0, **kw):
    if t < t0 or (t1 is not None and t >= t1):
        return
    s = appear(t, t0)
    if t1 is not None and t > t1 - 0.08:
        s *= max(0.0, (t1 - t) / 0.08)
    s *= 1 + pulse * env(t, KICKS, 0.08)
    sp = huazi(text, size, style, fnt, **kw)
    blit_at(cv, sp, x, y, s=s, rot=rot, alpha=alpha)


def vlog_caption(cv, text, y, t, t0, t1, size=62):
    if t0 <= t < t1:
        sp = G.text_sprite(text, size, "bold", fill=(255, 255, 255), strokes=((20, 20, 20, 7),), shadow=(0, 5, (0, 0, 0), 0.5))
        k = clamp01((t - t0) / 0.06)
        blit_at(cv, sp, W / 2, y + (1 - k) * 12, alpha=k)


# =============================================================== sections
def s_cold(cv, t, lt, P):
    frozen = t >= T(1, 3)
    tz = min(t, T(1, 3))
    z = 1.0 + 0.05 * tz / T(1, 3)
    d = desktop_image()
    m = M(W / 2, H / 2, z, ax=W / 2, ay=H / 2)
    import cv2

    cv[:] = cv2.warpAffine(d, m[:2], (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # desaturate (boring!)
    lum = cv.mean(-1, keepdims=True)
    cv[:] = lum + (cv - lum) * 0.55
    # sad idle cursor
    cx = 1180 + 160 * math.sin(tz * 0.9) + 40 * math.sin(tz * 2.3)
    cy = 520 + 60 * math.sin(tz * 1.3)
    draw_cursor(cv, cx, cy)
    lines = [(0.0, "上班第 6 小时……"), (T(0, 2), "桌面：空空如也"), (T(1), "你：好想薯"), (T(1, 2), "此时你需要——")]
    for i, (t0, txt) in enumerate(lines):
        t1 = lines[i + 1][0] if i + 1 < len(lines) else T(1, 3)
        vlog_caption(cv, txt, 900, t, t0, t1)
    # little clock-tick pulse on the beat
    if not frozen:
        P["zoom"] *= 1 + 0.006 * env(t, [(T(0, b), 1) for b in range(7)], 0.06)
    else:
        k = t - T(1, 3)
        cv[:] = cv * np.array([1.0, 0.82, 0.82], np.float32)
        caption(cv, "停！", W / 2, H / 2 - 20, 300, "red", t, T(1, 3), rot=-6)
        dx, dy, r = shake(t, [(T(1, 3), 1.0)], 30, 0.1, 3)
        P["dx"] += dx
        P["dy"] += dy
        P["rot"] += r
        P["chroma"] += 8 * math.exp(-k / 0.1)
        if k < 0.07:
            P["glitch"] = 0.8


def s_build(cv, t, lt, P):
    d = desktop_image()
    prog = clamp01(lt / (2 * BAR - BEAT))
    dark = 1 - 0.75 * prog
    cv[:] = d * dark
    lum = cv.mean(-1, keepdims=True)
    cv[:] = lum + (cv - lum) * 0.4
    if t >= T(3, 3):
        cv[:] = 0.02
    # word slams on bar 2
    words = [(T(2, 0), "你的桌面", 140, 300, "white"), (T(2, 1), "缺", 220, 520, "yellow"), (T(2, 2), "一只", 220, 520, "yellow"), (T(2, 3), "……", 220, 520, "white")]
    if t < T(3):
        caption(cv, "你的桌面", W / 2, 300, 150, "white", t, T(2, 0))
        parts = [("缺", "yellow", T(2, 1), -4), ("一只", "pink", T(2, 2), 3), ("……？", "white", T(2, 3), -2)]
        sps = [huazi(p_[0], 220, p_[1]) for p_ in parts]
        widths = [sp.w * 0.86 for sp in sps]
        x = W / 2 - sum(widths) / 2
        for (txt, sty, t0, rot), wd in zip(parts, widths):
            caption(cv, txt, x + wd / 2, 560, 220, sty, t, t0, rot=rot)
            x += wd
    elif t < T(3, 3):
        # words shrink to the top while the cat rises
        k = ease_io((t - T(3)) / 0.3)
        sp = huazi("你的桌面缺一只……", 110, "white")
        blit_at(cv, sp, W / 2, lerp(420, 130, k), s=lerp(1.2, 0.8, k))
    del words
    # cat rises from below in 8th/16th steps
    steps = [T(3, 0, s) for s in [0, 2, 4, 6, 8, 9, 10, 11]]
    n = sum(1 for s in steps if s <= t)
    if n:
        frac = n / len(steps)
        k_in = ease_out((t - steps[n - 1]) / 0.07)
        prev = (n - 1) / len(steps)
        f = lerp(prev, frac, k_in)
        a = A._load()["cat"]
        z = 1.45
        top_y = lerp(H + 10, 300, f)  # y of the cat's head top (sprite top)
        cam = M(W / 2, top_y, z * A.CAT_K, ax=a.w * 0.48, ay=0)
        if t >= T(3, 3):
            k = t - T(3, 3)
            zz = 1 + 0.12 * ease_out(k / 0.4)
            cam = M(W / 2, 300, z * A.CAT_K * zz, ax=a.w * 0.48, ay=0) @ M(0, 0)
            # spotlight
            r, _ = G.grid(W / 2, 560)
            spot = np.exp(-((r / 620) ** 2))[..., None]
            cv[:] = cv * 0 + np.array([0.11, 0.09, 0.14], np.float32) * spot
        blit(cv, a, cam)
        if t >= T(3, 3):
            caption(cv, "喵？", 1500, 420, 190, "white", t, T(3, 3) + 0.03, rot=8)
    if T(3, 2) <= t < T(3, 3):
        caption(cv, "？", 1350, 520, 150, "yellow", t, T(3, 2), rot=12)
        caption(cv, "？", 560, 600, 110, "yellow", t, T(3, 2, 2), rot=-14)
    # beat punches
    P["zoom"] *= 1 + 0.035 * env(t, SNARES, 0.07)
    dx, dy, r = shake(t, SNARES, 10, 0.08, 4)
    P["dx"] += dx
    P["dy"] += dy


def std_punch(P, t, z=0.04, sh=12, chroma=4):
    P["zoom"] *= 1 + z * env(t, KICKS, 0.085)
    dx, dy, r = shake(t, SNARES, sh, 0.1, 7)
    P["dx"] += dx
    P["dy"] += dy
    P["rot"] += r
    P["chroma"] += chroma * env(t, SNARES, 0.07)


def s_logo(cv, t, lt, P):
    G.sunburst(cv, C("#FFE7A3"), C("#FFD46E"), t, n=20, speed=14, cx=700, cy=520, center_glow=C("#FFF8E6"))
    k = t - T(4)
    zin = 1.02 * (1 + 0.6 * math.exp(-k / 0.09) * math.cos(k * 18))
    cam = scene_cam(560, 500, zin, 720, 570, rot=-8 * math.exp(-k / 0.12))
    st = paw_state(t)
    dy, sy = cat_hop(t, [T(4), T(4, 2), T(5), T(5, 2)], 14)
    st.update(cat_dy=dy, cat_sy=sy)
    # paws tap on kicks
    for side in ("L", "R"):
        e = env(t, KICKS, 0.05)
        st["paw" + side]["lift"] = 0
        st["paw" + side]["y"] -= 10 * math.sin(min(1, e) * math.pi) * 0.5
        st["paw" + side]["pressed"] = e > 0.5
    A.draw_scene(cv, cam, st)
    # logo
    for i, (ch, t0) in enumerate([("懵", T(4)), ("薯", T(4, 0, 6))]):
        if t >= t0:
            kk = t - t0
            s = 1 + 1.4 * math.exp(-kk / 0.06)
            sp = huazi(ch, 300, "green")
            blit_at(cv, sp, 1355 + i * 290, 290, s=s * (1 + 0.04 * env(t, KICKS, 0.08)), rot=(-6 if i == 0 else 5), alpha=clamp01(kk / 0.04))
    caption(cv, "一只住在桌面上的猫", 1500, 610, 76, "white", t, T(4, 0, 8))
    caption(cv, "你的猫猫", 330, 170, 84, "pink", t, T(5), rot=-10, pulse=0.05)
    caption(cv, "陪你敲键盘", 1500, 790, 92, "blue", t, T(5, 0, 8), rot=4, pulse=0.05)
    if k < 0.12:
        G.flash(cv, (1 - k / 0.12) * 0.4)
    std_punch(P, t, 0.035, 10, 4)
    P["vig"] = 0.25


def s_typing(cv, t, lt, P):
    G.halftone(cv, C("#D7E8BC"), C("#C3DCA0"), t, spacing=52, rad=10)
    base = scene_cam(560, 600, 1.3, 960, 560)
    st = paw_state(t)
    st["flash_keys"] = pressed_keys(t, T(6), T(9))
    dy, sy = cat_hop(t, [T(7, 3)], 20)
    st.update(cat_dy=dy, cat_sy=sy)
    # Esc: paws dash off and back
    te = T(7, 2)
    if te + 0.04 <= t < te + 0.36:
        k = (t - te - 0.04) / 0.32
        off = -1100 * math.sin(math.pi * k) ** 0.6
        for side in ("L", "R"):
            st["paw" + side + "_dx"] = off
    # clones (ctrl+v x3) and rewind (ctrl+z)
    tv = [T(8, 1), T(8, 1, 2), T(8, 2)]
    tz = T(8, 3)
    n = 1
    for i, tt_ in enumerate(tv):
        if t >= tt_:
            n = [2, 4, 9][i]
    rewinding = t >= tz
    if rewinding:
        k = (t - tz) / BEAT
        n = [9, 4, 2, 1][min(3, int(k * 4))]
    if n == 1:
        A.draw_scene(cv, base, st)
        draw_pops(cv, base, t, T(6), T(9), size=60)
    else:
        cols = {2: 2, 4: 2, 9: 3}[n]
        rows = n // cols
        cellw, cellh = W / cols, H / rows
        z = min(cellw / 1000, cellh / 960) * 1.02
        last_t = max([x for x in tv if x <= t] or [tv[0]])
        for i in range(n):
            r_, c_ = divmod(i, cols)
            cx, cy = cellw * (c_ + 0.5), cellh * (r_ + 0.5)
            newest = (not rewinding) and i >= {2: 1, 4: 2, 9: 4}[n]
            s = appear(t, last_t, 0.16) if newest else 1.0
            cam = scene_cam(560, 500, z * s, cx, cy, rot=(G.hash01("rot", i) - 0.5) * 8)
            A.draw_scene(cv, cam, st)
            draw_pops(cv, cam, t, T(8), T(9), scale=z / 1.3 * 1.6)
        if not rewinding:
            caption(cv, f"Ctrl+V ×{n}", W / 2, H / 2, 150, "pink", t, last_t, rot=-5)
    if rewinding:
        G.scanlines(cv, 0.12, 0.0)
        P["chroma"] += 3
        sp = G.text_sprite("◀◀ 倒带中", 64, "bold", fill=(255, 255, 255), strokes=((0, 0, 0, 4),))
        blit_at(cv, sp, 230, 90)
    # gags
    tr = T(7, 0)
    if tr <= t < tr + 0.8:
        k = (t - tr) / 0.8
        x0, y0 = G.apply(base, *A.key_center("Enter"))
        x, y = x0 + 900 * ease_in(k, 2), y0 - 1100 * ease_in(k, 1.6)
        for j in range(8):
            kk = k - j * 0.03
            if kk > 0:
                px, py = x0 + 900 * ease_in(kk, 2), y0 - 1100 * ease_in(kk, 1.6)
                blit_at(cv, puff_sprite(), px, py + 40, s=0.4 + j * 0.12, alpha=0.5 * (1 - k))
        blit_at(cv, emoji("🚀", 150), x, y, rot=0)
    tb = T(7, 1)
    if tb <= t < tb + 0.4:
        x0, y0 = G.apply(base, *A.key_center("Backspace"))
        k = (t - tb) / 0.4
        blit_at(cv, emoji("💊", 110), x0 + 80 * k, y0 - 260 * ease_out(k), rot=360 * k, s=appear(t, tb, 0.12), alpha=1 - ease_in(k, 4))
    if te <= t < te + 0.4:
        x0, y0 = G.apply(base, *A.key_center("Esc"))
        blit_at(cv, emoji("💨", 130), x0 - 60, y0 - 120, s=appear(t, te, 0.1), alpha=1 - (t - te) / 0.4)
    tc = T(8, 0)
    if tc <= t < T(8, 1):
        # marching-ants selection around the cat
        x0, y0 = G.apply(base, 175, 60)
        x1, y1 = G.apply(base, 1000, 950)
        dash_rect(cv, x0, y0, x1, y1, t)
    # right-hand captions
    if n == 1 and not rewinding:
        if t < T(7):
            caption(cv, "你敲一下", 1660, 200, 100, "yellow", t, T(6), rot=-3)
            caption(cv, "它拍一下", 1660, 350, 100, "green", t, T(6, 1), rot=3)
    std_punch(P, t, 0.03, 8, 3)


def dash_rect(cv, x0, y0, x1, y1, t, dash=26, w=6):
    per = 2 * ((x1 - x0) + (y1 - y0))
    off = (t * 300) % (2 * dash)
    pts = []
    s = -off
    while s < per:
        pts.append(s)
        s += 2 * dash
    import cv2

    def at(u):
        u %= per
        if u < x1 - x0:
            return x0 + u, y0
        u -= x1 - x0
        if u < y1 - y0:
            return x1, y0 + u
        u -= y1 - y0
        if u < x1 - x0:
            return x1 - u, y1
        u -= x1 - x0
        return x0, y1 - u

    for s in pts:
        a, b = at(max(0, s)), at(min(per, s + dash))
        cv2.line(cv, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), (0.1, 0.1, 0.1), w + 4, cv2.LINE_AA)
        cv2.line(cv, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), (1, 1, 1), w, cv2.LINE_AA)


def input_box(cv, x, y, w, text, t, label=None, ime=None, ime_t=None):
    """Fake text field with caret (+ optional IME candidate bar)."""
    arr, pad = G.rounded_rect(int(w), 96, 22, (255, 255, 255, 245), border=((60, 70, 60, 255), 4))
    spr = box_cache(int(w))
    blit_at(cv, spr, x, y)
    del arr, pad
    if text:
        ts = G.text_sprite(text, 60, "arial", fill=(40, 46, 40), strokes=())
        blit_at(cv, ts, x - w / 2 + 30, y + 2, ax=0, ay=0.5)
        cx = x - w / 2 + 30 + ts.w - 2 * int(60 * 0.25) + 6
    else:
        cx = x - w / 2 + 34
    if int(t * 3) % 2 == 0:
        import cv2

        cv2.line(cv, (int(cx), int(y - 30)), (int(cx), int(y + 30)), (0.2, 0.25, 0.2), 4)
    if ime and ime_t is not None and t >= ime_t:
        s = appear(t, ime_t, 0.12)
        sp = ime_sprite(ime)
        blit_at(cv, sp, x - w / 2, y + 62, s=s, ax=0, ay=0)


@lru_cache(None)
def box_cache(w):
    arr, pad = G.rounded_rect(w, 96, 22, (255, 255, 255, 245), border=((60, 70, 60, 255), 4))
    return Sprite(arr)


@lru_cache(None)
def ime_sprite(cands):
    im = Image.new("RGBA", (900, 90), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    parts = cands.split("|")
    f = G.font("reg", 40)
    x = 24
    widths = []
    for i, p in enumerate(parts):
        s = f"{i+1}.{p}"
        widths.append(f.getlength(s) + 44)
    tw = sum(widths) + 24
    d.rounded_rectangle([0, 0, tw, 76], 14, fill=(248, 250, 255, 250), outline=(120, 130, 160, 255), width=3)
    for i, p in enumerate(parts):
        s = f"{i+1}.{p}"
        if i == 0:
            d.rounded_rectangle([x - 10, 10, x + widths[i] - 34, 66], 10, fill=(70, 120, 230, 255))
        d.text((x, 38), s, font=f, fill=(255, 255, 255) if i == 0 else (40, 40, 60), anchor="lm")
        x += widths[i]
    return Sprite.from_pil(im.crop((0, 0, int(tw) + 4, 80)))


def word_pop(cv, text, x, y, t, t0, size=64, life=1.4):
    if t0 <= t < t0 + life:
        k = t - t0
        s = appear(t, t0, 0.2)
        sp = A.pop_sprite(text, "word", size)
        al = 1 - ease_in(clamp01((k - life + 0.25) / 0.25), 2)
        blit_at(cv, sp, x, y - 30 * ease_out(k / life), s=s, rot=-3 + 3 * math.sin(k * 6), alpha=al)


def s_secret(cv, t, lt, P):
    G.halftone(cv, C("#D6EBF7"), C("#BFDDF2"), t, spacing=52, rad=10, speed=(-30, 18))
    cam = scene_cam(560, 520, 1.0, 600, 560)
    st = paw_state(t)
    st["flash_keys"] = pressed_keys(t, T(9), T(11))
    tw1, tw2 = T(9, 2), T(10, 2)
    if tw1 <= t < tw1 + 0.5 or tw2 <= t < tw2 + 0.5:
        st.update(dict(zip(("cat_dy", "cat_sy"), cat_hop(t, [tw1, tw2], 18))))
    A.draw_scene(cv, cam, st)
    draw_pops(cv, cam, t, T(9), T(11), size=56)
    caption(cv, "打出暗号", 1480, 110, 92, "yellow", t, T(9), rot=-2)
    # typed text
    if t < T(10):
        typed = "".join(ch for tk, ch, k in TYPING if k == "letter" and T(9) <= tk <= t).lower()
        input_box(cv, 1480, 250, 700, typed, t, ime="摸鱼|墨鱼|魔芋", ime_t=T(9, 1, 2))
    else:
        typed = "".join(ch for tk, ch, k in TYPING if k == "letter" and T(10) <= tk <= t).lower()
        input_box(cv, 1480, 250, 700, typed, t, ime="下班|瞎扮|虾搬", ime_t=T(10, 1, 2))
    # 摸鱼 alarm
    if tw1 <= t < T(10):
        k = t - tw1
        # siren edge glow
        r, _ = G.grid()
        pulse = 0.5 - 0.5 * math.cos(2 * math.pi * k / 0.8)
        edge = np.clip((r - 700) / 500, 0, 1)[..., None] * 0.25 * pulse
        c = C("#FF7A88")
        cv[:] = cv * (1 - edge) + c * edge
        # fish rain
        for j in range(16):
            g = G.rnd(("fish", j))
            x0 = g.uniform(80, W - 80)
            d0 = g.uniform(0, 0.25)
            kk = k - d0
            if kk > 0:
                y = -100 + 1500 * kk * kk + 500 * kk
                blit_at(cv, emoji("🐟", 96), x0, y, rot=g.uniform(-40, 40) + 200 * kk, s=g.uniform(0.7, 1.2))
        tape(cv, "⚠ 摸鱼警报 ⚠ 摸鱼警报 ⚠ 摸鱼警报 ⚠ 摸鱼警报 ⚠", 640, -8, t, tw1)
        word_pop(cv, "摸鱼被懵薯发现了 🐟", 1480, 470, t, tw1, 70, 0.8)
    if tw2 <= t:
        k = t - tw2
        word_pop(cv, "下班！冲鸭！", 1480, 470, t, tw2, 84, 0.9)
        for j in range(7):
            x = -200 + (W + 400) * ((k * 1.25) - j * 0.09)
            yb = 980 - abs(math.sin((k * 10 + j) * 1.7)) * 40
            blit_at(cv, emoji("🦆", 190), x, yb - 20, rot=math.sin(k * 20 + j) * 10)
        if k < 0.1:
            G.flash(cv, (1 - k / 0.1) * 0.2, (1, 0.95, 0.6))
    std_punch(P, t, 0.03, 8, 3)


@lru_cache(None)
def tape_sprite(text):
    ts = G.text_sprite(text, 64, "bold", fill=(25, 22, 18), strokes=())
    w, h = ts.w + 200, ts.h + 30
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    m = (((xx + yy) // 40) % 2)[..., None]
    out = np.zeros((h, w, 4), np.float32)
    out[..., :3] = np.where(m > 0, np.array([1.0, 0.85, 0.1]), np.array([0.1, 0.09, 0.08]))
    out[..., 3] = 1
    band = out[22 : h - 22]
    band[..., :3] = np.array([1.0, 0.86, 0.12])
    ty = (h - ts.h) // 2
    tx = 100
    reg = out[ty : ty + ts.h, tx : tx + ts.w]
    a = ts.levels[0][..., 3:4]
    reg[:] = reg * (1 - a) + ts.levels[0]
    return Sprite(out)


def tape(cv, text, y, rot, t, t0):
    k = t - t0
    sp = tape_sprite(text)
    x = W / 2 + 300 - 900 * ease_out(min(1, k / 0.25)) + 200 * k
    blit_at(cv, sp, x, y, rot=rot)


PET_LINES = [
    "这么会摸，是不是背着我练了。(=^･ω･^=)",
    "会议纪要：全票同意再摸一次。(≧▽≦)",
    "不是哥们，你怎么这么会摸。(｡･ω･｡)ﾉ",
    "键帽挺多，怎么没有开罐头键。(=･ω･=)",
    "本猫的高冷，在你手里撑不过一秒。(￣▽￣)ノ",
    "这桌面没有冷场，本猫包暖场。(｡･∀･)ﾉﾞ",
    "今日交付：一只不催进度的猫。(=^･ω･^=)",
    "人在工位，猫在心里，配置拉满。(≧▽≦)",
]
BUBBLE_ANCHOR = (620, 345)


@lru_cache(None)
def bubble(text, rest=False, pressed=False, size=44, maxw=600):
    return A.bubble_sprite(text, size, maxw, rest, pressed)


def draw_bubble(cv, cam, text, t, t0, rest=False, pressed=False, out_t=None, anchor=BUBBLE_ANCHOR, size=44):
    if t < t0:
        return None
    sp = bubble(text, rest, pressed, size)
    s = appear(t, t0, 0.16)
    if out_t is not None and t >= out_t:
        s *= max(0, 1 - (t - out_t) / 0.12)
        if s <= 0:
            return None
    x, y = G.apply(cam, *anchor)
    m = M(x, y, s, 0, ax=sp.tail[0], ay=sp.tail[1])
    blit(cv, sp, m)
    if sp.button:
        return G.apply(m, *sp.button)
    return None


def s_pet(cv, t, lt, P):
    G.halftone(cv, C("#FFE4EC"), C("#FFD0DE"), t, spacing=52, rad=10, speed=(26, -16))
    cam = scene_cam(560, 480, 1.05, 700, 560)
    clicks = [T(11, i) for i in range(8)]
    st = paw_state(t)
    dy, sy = cat_hop(t, clicks, 24)
    st.update(cat_dy=dy, cat_sy=sy)
    A.draw_scene(cv, cam, st)
    # cursor & hearts
    i_last = max([i for i, c in enumerate(clicks) if c <= t] or [0])
    g = G.rnd(("pet", i_last))
    hx, hy = A.HEAD[0] + g.uniform(-70, 70), A.HEAD[1] + g.uniform(-90, 10)
    sx, sy_ = G.apply(cam, hx, hy)
    tc = clicks[i_last]
    nxt = clicks[i_last + 1] if i_last + 1 < len(clicks) else tc + 10
    # glide to the next spot just before the next click
    if t > nxt - 0.12:
        g2 = G.rnd(("pet", i_last + 1))
        nx, ny = G.apply(cam, A.HEAD[0] + g2.uniform(-70, 70), A.HEAD[1] + g2.uniform(-90, 10))
        k = ease_io((t - (nxt - 0.12)) / 0.12)
        sx, sy_ = lerp(sx, nx, k), lerp(sy_, ny, k)
    for j in range(4):
        g3 = G.rnd(("heart", i_last, j))
        age = t - tc - j * 0.03
        mo = A.pop_motion("rise", age, 0.7, g3.uniform(-60, 60), g3.uniform(-15, 15))
        if mo:
            oy, ox, s, rot, al = mo
            hx0, hy0 = G.apply(cam, hx, hy)
            blit_at(cv, A.pop_sprite("♥", "heart", 54), hx0 + ox * 1.6, hy0 + oy * 1.8, s=s, rot=rot, alpha=al)
    click_ring(cv, sx, sy_, t - tc)
    if t >= clicks[0]:
        draw_bubble(cv, cam, PET_LINES[i_last], t, tc)
    if t >= clicks[0] - 0.3:
        draw_cursor(cv, sx, sy_, pressed=(0 <= t - tc < 0.08))
    # captions
    caption(cv, "戳它一下", 1530, 820, 140, "pink", t, T(11), rot=-4, pulse=0.05)
    std_punch(P, t, 0.03, 8, 3)


def s_mash(cv, t, lt, P):
    t_dizzy, t_back = T(14), T(14, 2)
    if t < t_dizzy:
        vg = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
        cv[:] = C("#FF9A3D") * (1 - vg) + C("#FF4E3A") * vg
        G.speedlines(cv, 0.0, (1, 0.9, 0.75), n=60, cx=960, cy=560, inner=380, alpha=0.3)
        cam = scene_cam(560, 720, 1.45, 960, 600)
        st = paw_state(t)
        st["flash_keys"] = pressed_keys(t, T(13), T(14))
        jit = env(t, [(tk, 1) for tk, _, k in TYPING if k == "mash"], 0.05)
        st["kb_dx"] = math.sin(t * 90) * 5 * jit
        st["kb_rot"] = math.sin(t * 70) * 0.8 * jit
        A.draw_scene(cv, cam, st)
        draw_pops(cv, cam, t, T(13), T(14), size=66)
        # smoke + fire
        if t >= T(13, 2):
            for j in range(14):
                g = G.rnd(("smoke", j))
                t0 = T(13, 2) + g.uniform(0, 0.7)
                age = t - t0
                if 0 <= age < 0.9:
                    x, y = G.apply(cam, g.uniform(150, 980), 650)
                    blit_at(cv, puff_sprite(70, (0.93, 0.93, 0.96)), x + age * g.uniform(-60, 60), y - 60 - age * 420, s=0.7 + age * 1.8, alpha=0.85 * (1 - age / 0.9))
        if t >= T(13, 3):
            for j in range(9):
                g = G.rnd(("fire", j))
                t0 = T(13, 3) + j * 0.03
                x, y = G.apply(cam, 160 + j * 100, 640)
                s = appear(t, t0, 0.12) * (1 + 0.15 * math.sin(t * 40 + j))
                blit_at(cv, emoji("🔥", 120), x, y - 20, s=s)
        caption(cv, "键盘：我冒烟了", W / 2, 130, 110, "yellow", t, T(13, 2), rot=-2)
        dx, dy, r = shake(t, [(tk, 1) for tk, _, k in TYPING if k == "mash"], 9, 0.06, 9)
        P["dx"] += dx
        P["dy"] += dy
        P["zoom"] *= 1.02
        P["chroma"] += 3
    elif t < t_back:
        k = t - t_dizzy
        G.sunburst(cv, C("#E9E0FF"), C("#D7CBFF"), t * 0.6, n=16, speed=-60, cx=760, cy=420)
        wob = math.exp(-k / 0.7)
        cam = scene_cam(450, 360, 1.55, 760, 560, rot=6 * math.sin(k * 9) * wob)
        st = {"cat_rot": 5 * math.sin(k * 7) * wob}
        A.draw_scene(cv, cam, st)
        hx, hy = G.apply(cam, A.HEAD[0], A.HEAD[1] - 150)
        for j in range(4):
            ang = k * 7 + j * math.pi / 2
            x, y = hx + math.cos(ang) * 320, hy + math.sin(ang) * 80
            blit_at(cv, emoji("⭐" if j % 2 else "💫", 100), x, y, s=0.9 + 0.2 * math.sin(ang))
        draw_bubble(cv, cam, "敲慢一点，我要晕薯了~ (｡･ω･｡)", t, t_dizzy + 0.05, size=48)
        P["rot"] += 2.5 * math.sin(k * 6) * wob
        P["hue"] = 20 * math.sin(k * 8) * wob
    else:
        k = t - t_back
        G.stripes(cv, C("#F6B93B"), C("#FFD266"), t, width=90, speed=60, angle=-30)
        caption(cv, "还没完——", W / 2, H / 2, 230, "red", t, t_back, rot=-4)
        std_punch(P, t, 0.05, 18, 6)


NUM_COLORS = ["#4F8FB3", "#8A74C9", "#D0675F", "#E8885A", "#C06B9B"]


def s_count(cv, t, lt, P):
    b = min(3, int(lt / BEAT))
    G.sunburst(cv, C("#7FA8D6"), C("#8DB3DC"), t, n=14, speed=12, cx=700, cy=560)
    z = [0.95, 1.05, 1.15, 1.27][b] * (1 + 0.05 * math.exp(-(lt - b * BEAT) / 0.08))
    cam = scene_cam(560, 470, z, 720, 600)
    clicks = [T(15, i) for i in range(4)]
    st = paw_state(t)
    dy, sy = cat_hop(t, clicks, 22 + 8 * b)
    st.update(cat_dy=dy, cat_sy=sy)
    A.draw_scene(cv, cam, st)
    hx, hy = G.apply(cam, A.HEAD[0] + 20, A.HEAD[1] - 40)
    tc = clicks[b]
    click_ring(cv, hx, hy, t - tc)
    draw_cursor(cv, hx, hy, pressed=(0 <= t - tc < 0.08), s=1.1)
    for j in range(3):
        g3 = G.rnd(("cheart", b, j))
        mo = A.pop_motion("rise", t - tc - j * 0.04, 0.6, g3.uniform(-60, 60), g3.uniform(-15, 15))
        if mo:
            oy, ox, s, rot, al = mo
            blit_at(cv, A.pop_sprite("♥", "heart", 54), hx + ox * 1.6, hy + oy * 1.8, s=s, rot=rot, alpha=al)
    caption(cv, "我戳我戳……", W / 2, 105, 90, "white", t, T(15))
    k = t - tc
    sp = G.text_sprite(str(b + 1), 520, "impact", fill=(255, 255, 255), strokes=((30, 27, 22, 16),), shadow=(14, 18, (255, 214, 64), 1.0))
    s = 1 + 1.3 * math.exp(-k / 0.05)
    blit_at(cv, sp, 1530, 600, s=s, rot=[-8, 6, -4, 10][b], alpha=clamp01(k / 0.03))
    P["zoom"] *= 1 + 0.06 * math.exp(-k / 0.08)
    dx, dy, r = shake(t, [(c, 1) for c in clicks], 14 + 6 * b, 0.1, 11)
    P["dx"] += dx
    P["dy"] += dy
    P["rot"] += r



# ------------------------------------------------------------------ frenzy
ELEMS = ["cat", "kb", "pawL", "pawR"]
HOME_CAM = scene_cam(560, 500, 1.0, 960, 560)


def home_pose(name):
    a = A._load()
    if name == "cat":
        x, y = A.CAT_CX, A.CAT_CY
    elif name == "kb":
        x, y = A.KV["left"] + A.KV["width"] / 2, A.KV["top"] + A.KV["height"] / 2
    else:
        side = name[-1]
        rx, ry = A.key_center(A.REST[side])
        x, y = rx, ry - 244 * 0.5
    sx, sy = G.apply(HOME_CAM, x, y)
    del a
    return sx, sy


@lru_cache(None)
def frenzy_path(name):
    g = G.rnd(("path", name))
    pts, rots, scs = [], [], []
    hx, hy = home_pose(name)
    rot = 0.0
    nbeats = int(round((FRENZY_RETURN - FRENZY_START) / BEAT)) + 2
    for i in range(nbeats):
        if i == 0:
            pts.append((hx, hy))
            rots.append(0.0)
            scs.append(1.0)
            continue
        pts.append((g.uniform(250, W - 250), g.uniform(200, H - 180)))
        rot += g.choice([-360, 360]) if g.random() < 0.3 else g.uniform(-120, 120)
        rots.append(rot)
        scs.append(g.uniform(0.55, 1.15) if name in ("cat", "kb") else g.uniform(0.9, 1.8))
    return pts, rots, scs


def catmull(p0, p1, p2, p3, u):
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


def frenzy_pose(name, t):
    pts, rots, scs = frenzy_path(name)
    u = (t - FRENZY_START) / BEAT
    i = int(math.floor(u))
    f = u - i
    f = ease_io(f) * 0.6 + f * 0.4  # snap a little toward each beat
    i = max(0, min(i, len(pts) - 3))
    P0 = np.array(pts[max(0, i - 1)])
    P1, P2, P3 = np.array(pts[i]), np.array(pts[i + 1]), np.array(pts[min(len(pts) - 1, i + 2)])
    x, y = catmull(P0, P1, P2, P3, f)
    rot = lerp(rots[i], rots[i + 1], ease_io(f))
    s = lerp(scs[i], scs[i + 1], ease_io(f))
    return x, y, rot, s


def elem_draw(cv, name, x, y, rot, s, alpha=1.0, zoom=1.0):
    a = A._load()
    if name == "cat":
        sp = a["cat"]
        blit(cv, sp, M(x, y, A.CAT_K * s * zoom, rot, ax=sp.w / 2, ay=sp.h / 2), alpha)
    elif name == "kb":
        sp = a["kb"]
        blit(cv, sp, M(x, y, A.KB_K * s * zoom, rot, ax=sp.w / 2, ay=sp.h / 2), alpha)
    else:
        side = name[-1]
        sp = a["paw" + side]
        dw, dh = a["paw" + side + "_size"]
        blit(cv, sp, M(x, y, s * zoom, rot + (5 if side == "L" else -5), sx=dw / sp.w, sy=dh / sp.h, ax=sp.w / 2, ay=sp.h / 2), alpha)


ANIMAL_EMOJI = {"meow": "🐱", "dog-01": "🐶", "other-01": "🦆", "other-02": "🐔", "other-03": "🐮", "other-04": "🐑", "other-05": "🐷", "other-06": "🐴", "other-07": "🐦", "other-08": "🙀", "other-09": "🐭"}
STYLES = ["yellow", "pink", "green", "blue", "purple", "red"]


DOODLES = ["🐾", "❤", "⭐", "🐟", "🎵", "✨", "🐱", "🐾", "💕", "🌟"]


def frenzy_doodles(cv, t):
    """Slowly drifting stickers behind the flying cat (smooth motion only)."""
    k = t - FRENZY_START
    for j in range(34):
        g = G.rnd(("doodle", j))
        size = int(g.choice([70, 90, 110]))
        spd = g.uniform(50, 120)
        x0 = g.uniform(0, W)
        y = (g.uniform(0, H + 300) - k * spd) % (H + 300) - 150
        x = x0 + 40 * math.sin(k * g.uniform(0.6, 1.2) + j)
        rot = g.uniform(-30, 30) + k * g.uniform(-25, 25)
        ch = DOODLES[j % len(DOODLES)]
        blit_at(cv, emoji(ch, size), x, y, rot=rot, alpha=0.7)


def s_frenzy(cv, t, lt, P):
    bar = int(lt / BAR)
    ret = t >= FRENZY_RETURN
    # backgrounds per 2 bars
    # Lively but photosensitivity-safe: bright colours that only ever glide
    # (several seconds per change), slow rays, drifting doodles. No strobe/cuts.
    pal = [("#FF8FC0", "#FFA9CF"), ("#9C8CFF", "#B3A6FF"), ("#4FCFE0", "#72DBE8"), ("#FFC85C", "#FFD67F")]
    u = clamp01((t - FRENZY_START) / (FRENZY_LAND - FRENZY_START)) * (len(pal) - 1)
    i0 = min(int(u), len(pal) - 2)
    f = ease_io(u - i0)
    c1 = C(pal[i0][0]) * (1 - f) + C(pal[i0 + 1][0]) * f
    c2 = C(pal[i0][1]) * (1 - f) + C(pal[i0 + 1][1]) * f
    G.sunburst(cv, c1, c2, t, n=18, speed=14, center_glow=C("#FFF6FB"))
    frenzy_doodles(cv, t)
    # clone ring
    if 2 <= bar < 4 and not ret:
        k = lt - 2 * BAR
        for j in range(12):
            ang = j / 12 * 2 * math.pi + k * 0.7
            x, y = W / 2 + math.cos(ang) * 760, H / 2 + math.sin(ang) * 420
            s = 0.32 * appear(t, T(18) + j * 0.025, 0.2) * (1 + 0.15 * env(t, KICKS, 0.08))
            elem_draw(cv, "cat", x, y, ang * 57 + 90, s)
    # flying elements with ghost trails
    order = ["kb", "cat", "pawL", "pawR"]
    for name in order:
        for gi, (dt, al) in enumerate([(0.1, 0.18), (0.066, 0.28), (0.033, 0.4), (0.0, 1.0)]):
            tt_ = t - dt
            if tt_ < FRENZY_START:
                continue
            if tt_ >= FRENZY_RETURN:
                x0, y0, r0, s0 = frenzy_pose(name, FRENZY_RETURN)
                hx, hy = home_pose(name)
                k = ease_io((tt_ - FRENZY_RETURN) / (FRENZY_LAND - FRENZY_RETURN - 0.05))
                r_end = round(r0 / 360) * 360
                x, y, r, s = lerp(x0, hx, k), lerp(y0, hy, k), lerp(r0, r_end, k), lerp(s0, 1.0, k)
            else:
                x, y, r, s = frenzy_pose(name, tt_)
            # start: shake in place first (like the app), then take off
            if tt_ - FRENZY_START < 0.25:
                hx, hy = home_pose(name)
                kk = (tt_ - FRENZY_START) / 0.25
                x, y = lerp(hx, x, ease_in(kk, 2)) + math.sin(tt_ * 120) * 10 * (1 - kk), lerp(hy, y, ease_in(kk, 2))
            elem_draw(cv, name, x, y, r, s, al * (0.8 if gi < 3 else 1.0))
    # animal captions on every beat
    bi = int((t - FRENZY_START) / BEAT)
    if not ret and bi < len(ANIMAL_SEQ):
        for j in (bi - 1, bi):
            if j < 0 or j >= len(ANIMAL_SEQ):
                continue
            t0 = FRENZY_START + j * BEAT
            age = t - t0
            if not (0 <= age < 0.5):
                continue
            nm, label = ANIMAL_SEQ[j]
            g = G.rnd(("animal", j))
            x, y = g.uniform(380, W - 380), g.uniform(260, H - 300)
            style = STYLES[j % len(STYLES)]
            sp = huazi(label, 150 if len(label) <= 4 else 96, style)
            al = 1 - ease_in(clamp01((age - 0.3) / 0.2), 2)
            s = appear(t, t0, 0.12)
            rot = g.uniform(-14, 14)
            blit_at(cv, sp, x, y, s=s, rot=rot, alpha=al)
            em = ANIMAL_EMOJI["meow" if nm.startswith("meow") else nm]
            blit_at(cv, emoji(em, 150), x - sp.w / 2 - 40, y - 60, s=s, rot=-rot, alpha=al)
    # bottom subtitle
    subs = [(T(16), "猫、键盘、爪子 满屏乱飞"), (T(18), "边飞边叫 一声接一声"), (T(20), "猫狗鸭鸡牛羊猪驴鸟鼠 全员到齐"), (FRENZY_RETURN, "最后——全部归位")]
    for i, (t0, txt) in enumerate(subs):
        t1 = subs[i + 1][0] if i + 1 < len(subs) else FRENZY_LAND
        if t0 <= t < t1:
            sp = G.text_sprite(txt, 64, "bold", fill=(255, 255, 255), strokes=((20, 20, 20, 8),), shadow=(0, 6, (0, 0, 0), 0.5))
            sc = appear(t, t0, 0.12)
            del sp, sc  # bottom subtitles removed per script
    # post
    if not ret:
        P["zoom"] *= 1 + 0.03 * env(t, KICKS, 0.08)
        dx, dy, r = shake(t, SNARES, 10, 0.1, 13)
        P["dx"] += dx
        P["dy"] += dy
        P["rot"] += r


REST_LINE = "别只给客户画饼，给自己吃点真饭。(=^･ω･^=)"


def s_rest(cv, t, lt, P):
    G.halftone(cv, C("#FFF5E1"), C("#FCE8C2"), t, spacing=70, rad=16, speed=(12, 8))
    t_panel = T(24, 2)
    full = scene_cam(560, 480, 1.05, 700, 560)
    if t < t_panel:
        cam = full
    else:
        px, py, pw, ph = A.PANEL
        tgt = scene_cam(px + pw / 2, py + ph / 2 + 4, 4.6, W / 2, 560)
        k = ease_io((t - t_panel) / 0.35)
        cam = full * (1 - k) + tgt * k
    st = {}
    k_land = t - T(22)
    if k_land < 0.5:
        st["cat_sy"] = 1 - 0.08 * math.exp(-k_land / 0.08) * math.cos(k_land * 25)
    # panel look
    if t >= t_panel:
        b = int((t - t_panel) / BEAT)
        looks = ["normal", "neon", "matrix", "sunset", "candy", "lcd"]
        look = looks[min(b, 5)]
        n = int(lerp(9999, 13140, clamp01((t - t_panel) / (T(26) - t_panel))))
        st["panel"] = A.panel_drawer(panel_cached(f"{n:,} 次", "5 时 20 分", look, round(t * 10) / 10 if look in ("matrix", "neon", "candy") else 0))
    else:
        st["panel"] = A.panel_drawer(panel_cached("9,999 次", "5 时 20 分", "normal", 0))
    A.draw_scene(cv, cam, st)
    if t < t_panel:
        # captions + alarm
        caption(cv, "玩归玩 闹归闹", 1500, 170, 92, "black", t, T(22), T(23), rot=-2)
        caption(cv, "到点还得歇一歇", 1500, 300, 92, "black", t, T(22, 2), T(23), rot=2)
        if T(22, 2) <= t < T(23):
            k = t - T(22, 2)
            blit_at(cv, emoji("⏰", 300), 1500, 590, s=appear(t, T(22, 2)), rot=12 * math.sin(k * 60))
            caption(cv, "连续工作满 1 小时", 1500, 800, 70, "white", t, T(22, 3))
        if t >= T(23):
            caption(cv, "每小时一次", 1560, 130, 92, "black", t, T(23), rot=-2)
        btn = draw_bubble(cv, cam, REST_LINE, t, T(23), rest=True, pressed=(T(24) <= t < T(24) + 0.12), out_t=T(24) + 0.12, size=44)
        if t >= T(23, 2) and t < T(24, 2):
            caption(cv, "休息提醒", 1560, 860, 130, "green", t, T(23, 2), rot=-4, pulse=0.05)
        # cursor to the button
        if t >= T(23, 2):
            bx, by = btn if btn else G.apply(cam, 900, 460)
            k = ease_io((t - T(23, 2)) / (T(24) - T(23, 2) - 0.05))
            cx, cy = lerp(1800, bx, k), lerp(900, by, k)
            if btn is None:
                cx, cy = bx, by
            draw_cursor(cv, cx, cy, pressed=(T(24) <= t < T(24) + 0.1))
            click_ring(cv, cx, cy, t - T(24))
        if t >= T(24):
            k = t - T(24)
            for j in range(5):
                g3 = G.rnd(("rheart", j))
                mo = A.pop_motion("rise", k - j * 0.03, 0.7, g3.uniform(-70, 70), g3.uniform(-15, 15))
                if mo:
                    oy, ox, s, rot, al = mo
                    x, y = G.apply(cam, *A.NOSE)
                    blit_at(cv, A.pop_sprite("♥", "heart", 60), x + ox * 1.8, y - 60 + oy * 2, s=s, rot=rot, alpha=al)
    else:
        caption(cv, "键盘上的小屏幕", W / 2, 130, 96, "yellow", t, t_panel + 0.1, rot=-2)
        if T(25, 3) <= t:
            P["zoom"] *= 1 + 0.4 * ease_in((t - T(25, 3)) / BEAT, 3)
            G.flash(cv, ease_in((t - T(25, 3)) / BEAT, 4) * 0.4)
    if k_land < 0.1:
        G.flash(cv, (1 - k_land / 0.1) * 0.3)
    P["zoom"] *= 1 + 0.015 * env(t, KICKS, 0.1)


@lru_cache(maxsize=64)
def panel_cached(a, b, look, tt_):
    return A.panel_sprite(a, b, look, tt_)


# ------------------------------------------------------------------- specs
# Plain-language selling points (no tech specs: the audience is everyday users).
SPECS = [
    ("上班不孤单", "桌面上多了个猫搭子", "#4F8FB3", "buddy"),
    ("安安静静陪着你", "待在桌面上 不打扰你干活", "#8A74C9", "desk"),
    ("打字变好玩", "每敲一下 都有回应", "#C06B9B", "pops"),
    ("摸鱼有猫陪", "摸鱼搭子 已上线", "#2F7FA0", "fish"),
    ("帮你数着", "今天敲了多少下 它都记着", "#2F4A2A", "count"),
    ("累了提醒你", "喝口水 · 起来走走", "#D0675F", "rest"),
    ("专治班味", "看一眼 班味淡三分", "#E8885A", "cure"),
    ("陪你到下班", "下班！冲鸭！", "#6F9A4F", "home"),
]


def mini_desktop(cv, cx, cy, w, h, t, window=False, k_card=0.0):
    import cv2

    d = desktop_image()
    small = cv2.resize(d, (int(w), int(h)), interpolation=cv2.INTER_AREA)
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    sub = cv[y0 : y0 + small.shape[0], x0 : x0 + small.shape[1]]
    sub[:] = small[: sub.shape[0], : sub.shape[1]]
    z = w / W
    cam = M(x0, y0, z) @ scene_cam(560, 500, 1.12, 640, 590)
    sub_cv = cv  # draw directly, clip by drawing a frame afterwards
    A.draw_scene(sub_cv, cam, paw_state(t))
    icons = desktop_icons_sprite()
    blit(cv, icons, M(x0, y0, z))
    if window:
        k = ease_out(k_card / 0.25)
        wx = lerp(x0 + w + 40, x0 + w * 0.42, k)
        win, _ = G.rounded_rect(int(w * 0.5), int(h * 0.72), 14, (250, 250, 252, 255))
        blit(cv, Sprite(win), M(wx, y0 + h * 0.1))
        bar, _ = G.rounded_rect(int(w * 0.5), 40, 14, (70, 110, 190, 255))
        blit(cv, Sprite(bar), M(wx, y0 + h * 0.1))
        ts = G.text_sprite("周报_最终版.docx", 26, "reg", fill=(255, 255, 255), strokes=())
        blit_at(cv, ts, wx + 20, y0 + h * 0.1 + 20, ax=0, ay=0.5)
        for li in range(7):
            cv2.line(cv, (int(wx + 30), int(y0 + h * 0.1 + 80 + li * 34)), (int(wx + w * 0.5 - 40 - (li % 3) * 50), int(y0 + h * 0.1 + 80 + li * 34)), (0.75, 0.77, 0.82), 8)
        if k > 0.9:
            blit_at(cv, emoji("💤", 90), wx - 60, y0 + h * 0.3 + 10 * math.sin(t * 8))
    # frame
    cv2.rectangle(cv, (x0 - 6, y0 - 6), (x0 + int(w) + 6, y0 + int(h) + 6), (1, 1, 1), 12)
    cv2.rectangle(cv, (x0 - 12, y0 - 12), (x0 + int(w) + 12, y0 + int(h) + 12), (0.1, 0.1, 0.1), 3)


def s_specs(cv, t, lt, P):
    i = min(7, int(lt / (2 * BEAT)))
    t0 = T(26) + i * 2 * BEAT
    k = t - t0
    title, sub, colr, kind = SPECS[i]
    base = C(colr)
    G.stripes(cv, base, base * 0.85 + 0.03, t, width=60, speed=200, angle=-35 if i % 2 else 35)
    # prop
    if kind == "desk":
        mini_desktop(cv, W / 2, 610, 1000, 562, t)
    elif kind == "buddy":
        cam = scene_cam(560, 500, 0.62, W / 2, 640)
        A.draw_scene(cv, cam, paw_state(t))
        for j in range(8):
            g3 = G.rnd(("bheart", j))
            mo = A.pop_motion("rise", (k - j * 0.06) % 0.8, 0.8, g3.uniform(-60, 60), g3.uniform(-15, 15))
            if mo and k >= j * 0.06:
                oy, ox, s_, rot, al = mo
                x0 = W / 2 + g3.uniform(-420, 420)
                blit_at(cv, A.pop_sprite("♥", "heart", 70), x0 + ox * 2, 560 + oy * 3, s=s_, rot=rot, alpha=al)
    elif kind == "pops":
        for j, w_ in enumerate(["啪", "哒", "咕噜", "喵呜"]):
            g = G.rnd(("priv", j))
            x = W / 2 - 480 + j * 320
            sp = A.pop_sprite(w_, "plain", 120, A.POP_COLORS[j])
            blit_at(cv, sp, x, 600 - 40 * abs(math.sin(k * 7 + j)), s=appear(t, t0 + j * 0.05, 0.14), rot=g.uniform(-10, 10))
        blit_at(cv, A.pop_sprite("发射！", "special", 90), W / 2 - 250, 800, s=appear(t, t0 + 0.25, 0.14), rot=-6)
        blit_at(cv, A.pop_sprite("贴贴", "shortcut", 90), W / 2 + 250, 800, s=appear(t, t0 + 0.3, 0.14), rot=5)
    elif kind == "fish":
        blit_at(cv, emoji("🐟", 300), W / 2 - 230, 620 + 25 * math.sin(k * 9), rot=-15 + 10 * math.sin(k * 6))
        blit_at(cv, cat_head_sticker(), W / 2 + 260, 640, s=0.62 * appear(t, t0 + 0.08), rot=8)
    elif kind == "count":
        n = int(13140 * ease_out(clamp01(k / 0.55), 3))
        sp = G.text_sprite(f"{n:,}", 330, "impact", fill=(182, 255, 59), strokes=((20, 30, 20, 14),), shadow=(12, 16, (0, 0, 0), 0.5))
        blit_at(cv, sp, W / 2 - 70, 590, s=1 + 0.3 * math.exp(-k / 0.06))
        caption(cv, "下", W / 2 + sp.w / 2 - 20, 650, 150, "white", t, t0 + 0.4)
        blit_at(cv, cat_head_sticker(), 260, 780, s=0.42 * (1 + 0.05 * env(t, KICKS, 0.08)), rot=-8)
    elif kind == "rest":
        blit_at(cv, emoji("⏰", 300), W / 2 - 220, 610, rot=12 * math.sin(k * 60) * math.exp(-k / 0.5))
        blit_at(cv, emoji("💧", 230), W / 2 + 220, 600 - 30 * abs(math.sin(k * 8)), s=appear(t, t0 + 0.1))
    elif kind == "cure":
        blit_at(cv, cat_head_sticker(), W / 2, 620, s=0.8 * (1 + 0.06 * env(t, KICKS, 0.08)) * appear(t, t0, 0.2), rot=-4)
        for j, (dx_, dy_) in enumerate([(-420, -120), (430, -60), (-360, 180), (380, 200)]):
            blit_at(cv, emoji("✨", 120), W / 2 + dx_, 620 + dy_, s=appear(t, t0 + 0.05 * j, 0.12) * (0.8 + 0.3 * math.sin(k * 12 + j)))
    else:  # home
        cam = scene_cam(560, 500, 0.5, W / 2, 650)
        A.draw_scene(cv, cam, paw_state(t))
        for j in range(5):
            x = -200 + (W + 400) * ((k * 1.1) - j * 0.1)
            blit_at(cv, emoji("🦆", 150), x, 900 - abs(math.sin((k * 10 + j) * 1.7)) * 30)
        blit_at(cv, emoji("🎉", 160), W / 2 + 520, 470, s=appear(t, t0 + 0.1), rot=10)
    # title & sub
    tsize = 150 if len(title) <= 5 else 130
    style = ["yellow", "pink", "green", "yellow", "blue", "yellow", "pink", "green"][i]
    caption(cv, title, W / 2, 180, tsize, style, t, t0, rot=-3 if i % 2 else 3)
    del sub  # no bottom subtitles after 40 s
    # progress dots
    for j in range(8):
        import cv2

        cx = W / 2 - 7 * 22 + j * 44
        cv2.circle(cv, (int(cx), 1050), 9 if j == i else 6, (1, 1, 1) if j <= i else (0.5, 0.5, 0.5), -1, cv2.LINE_AA)
    std_punch(P, t, 0.04, 10, 4)


# ------------------------------------------------------------------- outro
def s_outro(cv, t, lt, P):
    G.sunburst(cv, C("#BFD58F"), C("#D5E6A8"), t, n=20, speed=16, cx=700, cy=520, center_glow=C("#F7FBE8"))
    cam = scene_cam(560, 500, 1.02, 700, 570)
    st = paw_state(t)
    st["flash_keys"] = pressed_keys(t, T(30), T(32))
    t_ans = T(31)
    dy, sy = cat_hop(t, [t_ans], 26)
    st.update(cat_dy=dy, cat_sy=sy)
    A.draw_scene(cv, cam, st)
    draw_pops(cv, cam, t, T(30), T(32), size=56)
    if t < T(31, 2):
        caption(cv, "喊它的名字", 1480, 130, 96, "yellow", t, T(30), rot=-2)
        typed = "".join(ch for tk, ch, k in TYPING if k == "letter" and T(30) <= tk <= t).lower()
        input_box(cv, 1480, 280, 700, typed, t)
        if t >= t_ans:
            word_pop(cv, "在呢在呢！", 1480, 520, t, t_ans, 90, 2.0)
            for j in range(6):
                g3 = G.rnd(("oheart", j))
                mo = A.pop_motion("rise", t - t_ans - j * 0.03, 0.8, g3.uniform(-80, 80), g3.uniform(-15, 15))
                if mo:
                    oy, ox, s, rot, al = mo
                    x, y = G.apply(cam, *A.HEAD)
                    blit_at(cv, A.pop_sprite("♥", "heart", 64), x + ox * 2, y + oy * 2, s=s, rot=rot, alpha=al)
            caption(cv, "它会答应", 1480, 700, 110, "pink", t, t_ans + BEAT, rot=3)
    else:
        logo_block(cv, t, T(31, 2))
    std_punch(P, t, 0.035, 10, 4)
    if t - T(30) < 0.1:
        G.flash(cv, (1 - (t - T(30)) / 0.1) * 0.35)


def logo_block(cv, t, t0, alpha=1.0):
    for i, ch in enumerate("懵薯"):
        tt0 = t0 + i * 0.1
        if t >= tt0:
            kk = t - tt0
            s = 1 + 1.4 * math.exp(-kk / 0.06)
            sp = huazi(ch, 300, "green")
            blit_at(cv, sp, 1355 + i * 290, 290, s=s * (1 + 0.04 * env(t, KICKS, 0.08)), rot=(-6 if i == 0 else 5), alpha=clamp01(kk / 0.04) * alpha)
    if t >= t0 + 0.2:
        sp = huazi("陪你敲键盘", 84, "white")
        blit_at(cv, sp, 1500, 620, s=appear(t, t0 + 0.2), alpha=alpha)
    if t >= t0 + 0.3:
        sp = huazi("也记得提醒你休息", 70, "white")
        blit_at(cv, sp, 1500, 730, s=appear(t, t0 + 0.3), alpha=alpha)


def s_end(cv, t, lt, P):
    t_black, t_gag = T(33), T(33, 2)
    if t < t_black:
        G.sunburst(cv, C("#BFD58F"), C("#D5E6A8"), t, n=20, speed=16, cx=700, cy=520, center_glow=C("#F7FBE8"))
        cam = scene_cam(560, 500, 1.02, 700, 570)
        A.draw_scene(cv, cam, paw_state(t))
        fade_txt = 1 - clamp01((t - T(32, 2)) / 0.4)
        logo_block(cv, t, T(31, 2), alpha=fade_txt)
        if fade_txt > 0:
            pass  # bottom tagline removed (no bottom subtitles after 40 s)
        # confetti
        k = t - T(32)
        if k < 1.6:
            for j in range(70):
                g = G.rnd(("conf", j))
                ang = g.uniform(0, 2 * math.pi)
                sp_ = g.uniform(500, 1300)
                x = 960 + math.cos(ang) * sp_ * k
                y = 520 + math.sin(ang) * sp_ * k + 900 * k * k
                if j % 3 == 0:
                    blit_at(cv, A.pop_sprite("♥", "heart", 50), x, y, rot=g.uniform(-30, 30) + 300 * k, alpha=1 - k / 1.6)
                else:
                    import cv2

                    c = G.col(A.POP_COLORS[j % 7])
                    w2, h2 = 14, 26
                    rr = ((x, y), (w2, h2), g.uniform(0, 180) + 600 * k)
                    box = cv2.boxPoints(rr).astype(np.int32)
                    cv2.fillPoly(cv, [box], tuple(float(v) for v in c), cv2.LINE_AA)
        if k < 0.12:
            G.flash(cv, (1 - k / 0.12) * 0.4)
        # push in to the eyes
        if t >= T(32, 2):
            kk = ease_in((t - T(32, 2)) / (t_black - T(32, 2)), 2.2)
            ex, ey = G.apply(cam, (A.EYES[0][0] + A.EYES[1][0]) / 2, (A.EYES[0][1] + A.EYES[1][1]) / 2)
            P["zoom"] *= 1 + 2.2 * kk
            P["dx"] += (W / 2 - ex) * (1 + 2.2 * kk) * min(1, kk * 2)
            P["dy"] += (H / 2 - ey) * (1 + 2.2 * kk) * min(1, kk * 2)
            P["fade"] = kk * 0.6 if kk > 0.6 else 0
        else:
            P["zoom"] *= 1 + 0.05 * env(t, KICKS, 0.1)
    else:
        cv[:] = 0.0
        if t >= t_gag:
            k = t - t_gag
            a = A._load()["cat"]
            rise = ease_out(k / 0.25)
            blit(cv, a, M(W - 260, H + 30 - 300 * rise, 0.38, -18, ax=a.w * 0.5, ay=a.h * 0.25))
            sp = G.text_sprite("（它会一直在桌面上看着你）", 52, "bold", fill=(255, 255, 255), strokes=())
            blit_at(cv, sp, W / 2 - 120, H / 2, alpha=clamp01((k - 0.15) / 0.2))
            sp2 = G.text_sprite("懵薯", 40, "bold", fill=(190, 210, 150), strokes=())
            blit_at(cv, sp2, W / 2 - 120, H / 2 + 80, alpha=clamp01((k - 0.4) / 0.2))
        fo = clamp01((t - 55.0) / 0.5)
        if fo > 0:
            P["fade"] = fo


SECTION_FUNCS = dict(cold=s_cold, build=s_build, logo=s_logo, typing=s_typing, secret=s_secret, pet=s_pet, mash=s_mash, count=s_count, frenzy=s_frenzy, rest=s_rest, specs=s_specs, outro=s_outro, end=s_end)


# ------------------------------------------------------------------ frame
def render(fi):
    t = fi / FPS
    cv = np.zeros((H, W, 3), np.float32)
    P = dict(zoom=1.0, rot=0.0, dx=0.0, dy=0.0, chroma=0.0, glitch=0.0, hue=0.0, deepfry=0.0, kaleido=False, invert=False, vig=0.22, fade=0.0, overlay=[])
    name, lt = section_at(t)
    SECTION_FUNCS[name](cv, t, lt, P)
    if P["deepfry"]:
        G.deepfry(cv, P["deepfry"], fi)
    if P["hue"]:
        G.hue_rotate(cv, P["hue"])
    if P["kaleido"]:
        G.kaleido(cv)
    if P["invert"]:
        G.invert(cv)
    if P["glitch"]:
        G.glitch_slices(cv, t, P["glitch"], fi)
    # camera: keep a hair of overscan so shakes never show edges
    over = 1.0 + (0.03 if (abs(P["dx"]) + abs(P["dy"]) + abs(P["rot"]) > 0.5) else 0)
    cv = G.camera(cv, P["zoom"] * over, P["rot"], P["dx"], P["dy"])
    if P["chroma"] > 0.5:
        G.chroma(cv, min(P["chroma"], 18))
    G.vignette(cv, P["vig"])
    for fn in P["overlay"]:
        fn(cv)
    if P["fade"]:
        cv *= 1 - P["fade"]
    return G.to_u8(cv)


# --------------------------------------------------------------- drivers
def preview(frames):
    out = os.path.join(WORK, "preview")
    os.makedirs(out, exist_ok=True)
    for fi in frames:
        img = render(fi)
        Image.fromarray(img).save(os.path.join(out, f"f{fi:04d}.jpg"), quality=88)
        print("wrote", fi, round(fi / FPS, 2), section_at(fi / FPS)[0], flush=True)


def worker(args):
    idx, f0, f1 = args
    path = os.path.join(WORK, "chunks", f"c{idx:03d}.mkv")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "ffv1", "-level", "3", "-threads", "1", path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fi in range(f0, f1):
        p.stdin.write(render(fi).tobytes())
    p.stdin.close()
    p.wait()
    return idx, f1 - f0


def render_all(procs=18, chunk=24):
    import multiprocessing as mp

    os.makedirs(os.path.join(WORK, "chunks"), exist_ok=True)
    jobs = [(i, f0, min(NFRAMES, f0 + chunk)) for i, f0 in enumerate(range(0, NFRAMES, chunk))]
    with mp.Pool(procs) as pool:
        done = 0
        for idx, n in pool.imap_unordered(worker, jobs):
            done += n
            print(f"\r{done}/{NFRAMES} frames", end="", flush=True)
    print()
    with open(os.path.join(WORK, "chunks", "list.txt"), "w") as f:
        for i, _, _ in jobs:
            f.write(f"file 'c{i:03d}.mkv'\n")
    return len(jobs)


if __name__ == "__main__":
    if "--frames" in sys.argv:
        spec = sys.argv[sys.argv.index("--frames") + 1]
        fr = []
        for part in spec.split(","):
            if ":" in part:
                a, b, s = (part.split(":") + ["1"])[:3]
                fr += list(range(int(a), int(b), int(s)))
            elif "s" in part:
                fr.append(int(round(float(part.rstrip("s")) * FPS)))
            else:
                fr.append(int(part))
        preview(fr)
    elif "--render" in sys.argv:
        render_all()
