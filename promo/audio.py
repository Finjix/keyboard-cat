"""Synthesise the promo soundtrack: an original 150 BPM phonk-ish track
(cowbell, distorted 808, hard kicks) with the app's own CC0 meow / animal
samples chopped onto the beat, plus every sound effect, mixed and limited.

Writes work/mix.wav (48 kHz stereo, 16-bit).
"""

import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
from score import (  # noqa: E402
    ANIMAL_SEQ,
    BAR,
    BEAT,
    CLICKS,
    DURATION,
    FRENZY,
    FRENZY_RETURN,
    FRENZY_START,
    PET_MEOW_CLICKS,
    PHONK,
    CHILL,
    SR,
    STEP,
    TYPING,
    T,
)

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
SND = os.path.join(WORK, "snd")
N = int((DURATION + 0.5) * SR)
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ helpers
def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    return r.standard_normal(int(d * SR))


def sos(kind, f, order=2):
    if kind == "bp":
        return signal.butter(order, f, "bandpass", fs=SR, output="sos")
    return signal.butter(order, f, kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def sweep_filter(x, f0, f1, kind="bp", q=0.35, block=256, curve=2.0):
    """Time-varying filter: centre/cutoff glides f0 -> f1 (exponential)."""
    out = np.zeros_like(x)
    nb = (len(x) + block - 1) // block
    zi = None
    for i in range(nb):
        p = (i / max(1, nb - 1)) ** curve if curve != 1 else i / max(1, nb - 1)
        f = f0 * (f1 / f0) ** p
        if kind == "bp":
            lo, hi = f * (1 - q), min(f * (1 + q), SR / 2 - 100)
            s = signal.butter(2, [lo, hi], "bandpass", fs=SR, output="sos")
        else:
            s = signal.butter(2, min(f, SR / 2 - 100), kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((s.shape[0], 2))
        seg = x[i * block : (i + 1) * block]
        y, zi = signal.sosfilt(s, seg, zi=zi)
        out[i * block : i * block + len(seg)] = y
    return out


def band_square(f, t, nh=None):
    """Band-limited square wave."""
    x = np.zeros_like(t)
    k = 1
    while k * f < 14000 and (nh is None or k <= nh):
        x += np.sin(2 * np.pi * k * f * t) / k
        k += 2
    return x * 4 / np.pi


def saw(f, t):
    x = np.zeros_like(t)
    k = 1
    while k * f < 12000:
        x += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * f * t) / k
        k += 1
    return x * 2 / np.pi


def note(name):
    names = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
    p, o = name[:-1], int(name[-1])
    m = 12 * (o + 1) + names[p]
    return 440.0 * 2 ** ((m - 69) / 12)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, t0, sig, gain=1.0, pan=0.0):
        i = int(round(t0 * SR))
        if sig.ndim == 1:
            a = np.pi / 4 * (pan + 1)
            st = np.stack([sig * np.cos(a), sig * np.sin(a)], 1) * np.sqrt(2)
        else:
            st = sig
        if i < 0:
            st = st[-i:]
            i = 0
        j = min(N, i + len(st))
        if j > i:
            self.x[i:j] += st[: j - i] * gain


def reverb_ir(d=1.6, decay=0.45, lp=6000, seed=3):
    r = np.random.default_rng(seed)
    t = tt(d)
    irs = []
    for c in range(2):
        n = r.standard_normal(len(t)) * np.exp(-t / decay)
        n = filt(n, "low", lp)
        n[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(n / np.sqrt(np.sum(n**2)))
    return irs


IR = reverb_ir()
IR_SHORT = reverb_ir(0.7, 0.16, 7000, 5)


def reverb(stereo, ir=IR):
    out = np.zeros_like(stereo)
    for c in range(2):
        out[:, c] = signal.fftconvolve(stereo[:, c], ir[c])[: len(stereo)]
    return out


# ---------------------------------------------------------------- samples
def load(name):
    sr, x = wavfile.read(os.path.join(SND, name + ".wav"))
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(1)
    x /= 32768.0
    return x


def chop(name, length=0.42, pre=0.008, thresh=0.12, fout=0.06, start_skip=0.0):
    """Trim to the first strong onset and keep `length` seconds."""
    x = load(name)
    x = x - np.mean(x)
    x = filt(x, "high", 70)
    env = np.convolve(np.abs(x), np.ones(240) / 240, "same")
    on = np.argmax(env > thresh * env.max())
    i0 = max(0, on - int(pre * SR)) + int(start_skip * SR)
    seg = x[i0 : i0 + int(length * SR)]
    seg = fade(seg, 0.003, min(fout, len(seg) / SR / 2))
    pk = np.max(np.abs(seg)) + 1e-9
    return seg / pk


def resample_pitch(x, semis):
    r = 2 ** (semis / 12)
    n = int(len(x) / r)
    return np.interp(np.arange(n) * r, np.arange(len(x)), x)


# ------------------------------------------------------------- instruments
def kick(kind="phonk"):
    if kind == "hard":
        t = tt(0.55)
        f = 52 + 320 * np.exp(-t / 0.012) + 70 * np.exp(-t / 0.07)
        amp = np.exp(-t / 0.32)
        drive = 5.0
    elif kind == "soft":
        t = tt(0.4)
        f = 50 + 120 * np.exp(-t / 0.03)
        amp = np.exp(-t / 0.2)
        drive = 1.4
    else:
        t = tt(0.5)
        f = 47 + 190 * np.exp(-t / 0.022) + 40 * np.exp(-t / 0.1)
        amp = np.exp(-t / 0.27)
        drive = 2.6
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * amp
    click = filt(noise(0.006, 11), "high", 2500) * np.exp(-tt(0.006) / 0.0015) * 0.8
    body[: len(click)] += click
    knock = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.018) * 0.5
    body += knock
    x = np.tanh(drive * body) / np.tanh(drive)
    if kind == "soft":
        x = filt(x, "low", 900)
    return fade(x, 0.0005, 0.03)


def clap(seed=1, bright=1.0):
    t = tt(0.4)
    n = np.random.default_rng(seed).standard_normal(len(t))
    env = np.zeros_like(t)
    for k, d in enumerate([0.0, 0.009, 0.018]):
        m = t >= d
        env[m] += np.exp(-(t[m] - d) / (0.006 if k < 2 else 0.11))
    x = filt(n * env, "bp", [900, 6500 * bright])
    body = np.sin(2 * np.pi * 195 * t) * np.exp(-t / 0.05) * 0.5
    return fade(x * 0.9 + body, 0.0005, 0.04)


def rim():
    t = tt(0.12)
    x = np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.012) + filt(noise(0.12, 4), "bp", [1500, 5000]) * np.exp(-t / 0.01) * 0.6
    return fade(x, 0.0003, 0.02)


HAT_METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(open_=False, seed=0):
    d = 0.32 if open_ else 0.07
    t = tt(d)
    m = sum(band_square(f * 2.0, t, nh=5) for f in HAT_METAL)
    n = np.random.default_rng(100 + seed).standard_normal(len(t))
    x = filt(m * 0.25 + n, "high", 7500)
    x *= np.exp(-t / (0.11 if open_ else 0.016))
    return fade(x, 0.0003, 0.01)


def cowbell(f, d=0.32):
    t = tt(d)
    x = band_square(f, t, nh=9) + 0.8 * band_square(f * 1.4395, t, nh=7)
    x = filt(x, "bp", [max(200, f * 0.7), min(9000, f * 4.5)])
    env = 0.65 * np.exp(-t / 0.05) + 0.35 * np.exp(-t / 0.2)
    return fade(x * env, 0.0005, 0.02)


def bass808(f, d, glide_from=None, drive=3.0):
    t = tt(d + 0.02)
    if glide_from:
        freq = f + (glide_from - f) * np.exp(-t / 0.05)
    else:
        freq = f * (1 + 0.6 * np.exp(-t / 0.008))
    ph = 2 * np.pi * np.cumsum(freq) / SR
    amp = (1 - np.exp(-t / 0.002)) * np.exp(-t / 1.4)
    x = np.sin(ph) * amp
    x = np.tanh(drive * x) / np.tanh(drive)
    x = filt(x, "low", 1100)
    return fade(x, 0.001, 0.03)


def ep_note(f, d, bright=1.0):
    """FM electric piano with a cheesy tremolo."""
    t = tt(d + 0.5)
    idx = (1.6 * np.exp(-t / 0.3) + 0.25) * bright
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    x += 0.12 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.015)
    amp = np.exp(-t / 1.1) * (1 + 0.18 * np.sin(2 * np.pi * 5.2 * t))
    rel = np.ones_like(t)
    k = int(d * SR)
    rel[k:] = np.exp(-(t[k:] - d) / 0.12)
    return fade(x * amp * rel, 0.003, 0.05)


def vibe(f, d):
    t = tt(d + 0.6)
    x = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.1)
    x *= np.exp(-t / 0.9) * (1 + 0.35 * np.sin(2 * np.pi * 6 * t))
    return fade(x, 0.002, 0.05)


def tick(hi=True):
    t = tt(0.05)
    f = 3200 if hi else 2400
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004) + filt(noise(0.05, 9), "bp", [2000, 6000]) * np.exp(-t / 0.002) * 0.4
    return fade(x, 0.0002, 0.01)


def keyclick(seed):
    r = np.random.default_rng(seed)
    t = tt(0.07)
    x = filt(r.standard_normal(len(t)), "bp", [1800, 7000]) * np.exp(-t / 0.0035)
    f = 170 + r.uniform(-20, 40)
    x += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.014) * 0.7
    x += np.sin(2 * np.pi * (1100 + r.uniform(-150, 150)) * t) * np.exp(-t / 0.006) * 0.25
    # bottom-out
    d = int(0.011 * SR)
    x[d:] += 0.5 * filt(r.standard_normal(len(t) - d), "bp", [2500, 8000]) * np.exp(-t[: len(t) - d] / 0.002)
    return fade(x, 0.0002, 0.01)


def mouseclick(seed=0):
    r = np.random.default_rng(50 + seed)
    out = np.zeros(int(0.11 * SR))
    for off, g in [(0.0, 1.0), (0.075, 0.55)]:
        t = tt(0.02)
        c = filt(r.standard_normal(len(t)), "bp", [2500, 9000]) * np.exp(-t / 0.0012)
        c += np.sin(2 * np.pi * 4200 * t) * np.exp(-t / 0.002) * 0.6
        i = int(off * SR)
        out[i : i + len(c)] += c * g
    return out


def pop(f0=320, f1=1300, d=0.09):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)
    return fade(x, 0.001, 0.01)


def ding(f=1318.5, d=1.6):
    t = tt(d)
    x = np.zeros_like(t)
    for m, a, dec in [(1, 1, 1.0), (2.76, 0.45, 0.45), (5.4, 0.22, 0.2), (8.93, 0.1, 0.08)]:
        x += a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / dec)
    return fade(x, 0.001, 0.05)


def sparkle(base=2093):
    out = np.zeros(int(0.35 * SR))
    for i, m in enumerate([1, 1.26, 1.5, 2.0]):
        s = ding(base * m, 0.22) * 0.5
        j = int(i * 0.035 * SR)
        out[j : j + len(s)] += s[: len(out) - j]
    return out


def boing(d=0.45):
    t = tt(d)
    f = 150 + 260 * np.exp(-t / 0.07) + 30 * np.sin(2 * np.pi * 18 * t) * np.exp(-t / 0.2)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x = np.tanh(2 * x) * np.exp(-t / 0.18)
    return fade(x, 0.001, 0.03)


def whoosh(d=0.5, f0=300, f1=5000, seed=21, up=True):
    n = noise(d, seed)
    x = sweep_filter(n, f0, f1, "bp", 0.5, curve=1.0) if up else sweep_filter(n, f1, f0, "bp", 0.5, curve=1.0)
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    return fade(x * env, 0.002, 0.02)


def riser(d, f0=250, f1=9000, seed=31):
    n = noise(d, seed)
    x = sweep_filter(n, f0, f1, "bp", 0.4, curve=1.6)
    t = tt(d)
    x *= (t / d) ** 1.8
    # pitched layer
    f = 110 * (2 ** (3.5 * (t / d) ** 1.3))
    p = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(p) + 0.5 * np.sin(p * 1.01 + 1) + 0.3 * np.sin(2 * p)) * (t / d) ** 2
    return fade(x * 0.9 + tone * 0.25, 0.01, 0.01)


def crash(d=2.2, seed=41):
    t = tt(d)
    n = np.random.default_rng(seed).standard_normal(len(t))
    m = sum(band_square(f * 3.1, t, nh=3) for f in HAT_METAL)
    x = filt(n + 0.2 * m, "high", 3500) * (0.6 * np.exp(-t / 0.35) + 0.4 * np.exp(-t / 1.1))
    return fade(x, 0.0005, 0.1)


def boom(d=2.0, f0=70, f1=28):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.35)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    x = np.tanh(2.5 * x)
    thump = filt(noise(0.2, 61), "low", 600) * np.exp(-tt(0.2) / 0.04)
    x[: len(thump)] += thump * 0.6
    return fade(x, 0.0005, 0.1)


def stamp():
    t = tt(0.25)
    f = 60 + 90 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08)
    x += filt(noise(0.25, 71), "low", 1800) * np.exp(-t / 0.02) * 0.7
    return fade(np.tanh(1.8 * x), 0.0005, 0.02)


def siren(d=0.8):
    t = tt(d)
    f = np.where((t // 0.2) % 2 == 0, 760.0, 1010.0)
    f = filt(f, "low", 40)  # glide between tones
    p = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(p) + 0.3 * np.sin(2 * p) + 0.15 * np.sin(3 * p)
    return fade(x * 0.7, 0.01, 0.06)


def dizzy(d=0.8):
    t = tt(d)
    center = 900 * (0.35 ** (t / d))
    f = center + 160 * np.sin(2 * np.pi * 9 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.3 + 0.7 * np.exp(-t / 0.5))
    return fade(x, 0.005, 0.08)


def glitch(d=0.12, seed=81):
    r = np.random.default_rng(seed)
    out = []
    while sum(len(o) for o in out) < d * SR:
        seglen = int(r.uniform(0.006, 0.02) * SR)
        f = r.choice([180, 360, 720, 1440, 2880])
        tseg = tt(seglen / SR)
        out.append(np.sign(np.sin(2 * np.pi * f * tseg)) * r.uniform(0.3, 1))
    x = np.concatenate(out)[: int(d * SR)]
    return fade(x, 0.001, 0.01)


def rocket(d=0.8):
    t = tt(d)
    n = noise(d, 91)
    x = sweep_filter(n, 200, 6000, "bp", 0.6, curve=1.2) * np.minimum(1, t / 0.05) * np.exp(-t / 0.5)
    rum = filt(noise(d, 92), "low", 180) * np.exp(-t / 0.4) * 2.0
    return fade(x + rum, 0.002, 0.05)


def scratch(src, t0, d=0.34):
    """Record scratch: scrub a bit of `src` (mono) back and forth."""
    u = tt(d)
    pos = t0 * SR + (0.05 * SR) * np.sin(2 * np.pi * u / 0.17) * np.linspace(1.0, 0.6, len(u)) - 0.03 * SR * u / d
    y = np.interp(pos, np.arange(len(src)), src)
    y = filt(y, "high", 300) * 1.6 + filt(noise(d, 95), "bp", [800, 3000]) * 0.05
    env = np.ones_like(u)
    env[-int(0.06 * SR) :] = np.linspace(1, 0, int(0.06 * SR))
    return fade(y * env, 0.001, 0.02)


# ----------------------------------------------------------------- the song
music = Bus()  # melodic (ducked by kick)
bass = Bus()
drums = Bus()
sfx = Bus()
vox = Bus()  # animal / meow samples
send = Bus()  # reverb send

K_PHONK, K_HARD, K_SOFT = kick("phonk"), kick("hard"), kick("soft")
CLAPS = [clap(s) for s in range(4)]
HATS = [hat(False, s) for s in range(4)]
OHAT = hat(True, 9)
kick_times = []


def put_kick(t, kind="phonk", g=1.0):
    k = {"phonk": K_PHONK, "hard": K_HARD, "soft": K_SOFT}[kind]
    drums.add(t, k, 0.95 * g)
    kick_times.append((t, g))


def put_clap(t, g=1.0, i=0, wet=0.35):
    c = CLAPS[i % 4]
    drums.add(t, c, 0.72 * g)
    send.add(t, c, wet * g)


# --- 0-2: muzak (Ab major), clock ticks, scratch at bar 1 beat 3
muzak = Bus()
chords = [
    (["Ab3", "C4", "Eb4", "G4"], "Ab2"),
    (["F3", "Ab3", "C4", "Eb4"], "F2"),
    (["Bb3", "Db4", "F4", "Ab4"], "Bb2"),
    (["G3", "Bb3", "Db4", "Eb4"], "Eb2"),
]
for i, (ch, root) in enumerate(chords):
    t0 = T(0, 2 * i)
    for j, nn in enumerate(ch):
        muzak.add(t0 + 0.012 * j, ep_note(note(nn), 0.78), 0.10, pan=-0.3 + 0.2 * j)
    muzak.add(t0, ep_note(note(root), 0.7, 0.4), 0.16)
    muzak.add(t0 + BEAT, ep_note(note(root) * 1.5, 0.35, 0.4), 0.10)
for t0, nn in [(0.0, "C5"), (0.4, "Eb5"), (0.8, "C5"), (1.2, "Bb4"), (1.6, "Ab4"), (2.0, "F4"), (2.4, "G4")]:
    muzak.add(t0 + 0.2, vibe(note(nn), 0.35), 0.09, pan=0.25)
for b in range(7):
    sfx.add(T(0, b), tick(b % 2 == 0), 0.12, pan=0.4)
mz = muzak.x.copy()
cut = int(T(1, 3) * SR)
mz[cut:] = 0
mz[cut - 240 : cut] *= np.linspace(1, 0, 240)[:, None]
music.x += mz
sfx.add(T(1, 3), scratch(muzak.x.mean(1), T(1, 2, 2)), 0.9)
sfx.add(T(1, 3) + 0.02, glitch(0.06, 3), 0.08)

# --- 2-3: build
for b in range(4):
    drums.add(T(2, b), filt(K_PHONK, "low", 300), 0.8)
    put_clap(T(2, b), 0.35 + 0.08 * b, b, 0.15)
    sfx.add(T(2, b), stamp(), 0.5)
roll = [(s, 0.45) for s in [0, 2, 4, 6]] + [(s, 0.6) for s in [8, 9, 10, 11]]
for s, g in roll:
    put_clap(T(3, 0, s), g, s, 0.2)
sfx.add(T(2), riser(T(3, 3) - T(2)), 0.45)
rc = crash(1.0, 43)[::-1]
sfx.add(T(4) - len(rc) / SR, filt(rc, "high", 2000), 0.35)
# the "?" meow on the silent beat
MEOW_Q = chop("meow-19", 0.9, thresh=0.08, fout=0.2)
vox.add(T(3, 3), MEOW_Q, 0.55)
send.add(T(3, 3), MEOW_Q, 0.25)

# --- groove helpers
CHORD_ROOTS = ["F1", "F1", "Db2", "C2"]  # 4-bar loop over Fm Fm Db C
MELODY = [
    {0: "C6", 3: "C6", 6: "Ab5", 8: "F5", 10: "G5", 11: "Ab5", 14: "G5"},
    {0: "F5", 3: "F5", 6: "Ab5", 8: "C6", 10: "Eb6", 11: "Db6", 14: "C6"},
    {0: "Db6", 3: "Db6", 6: "C6", 8: "Ab5", 10: "F5", 11: "Ab5", 14: "C6"},
    {0: "Bb5", 3: "Bb5", 6: "G5", 8: "E5", 10: "G5", 11: "Bb5", 14: "C6"},
]


def groove_bar(bar, loop_i, pat=PHONK, alt=False, cow=True, cow_gain=0.16, hats16=False, kick_kind="phonk", bass_on=True, octave=0):
    ks = pat.get("kick_alt") if alt and "kick_alt" in pat else pat["kick"]
    for s in ks:
        put_kick(T(bar, 0, s), kick_kind, 1.0 if s == 0 else 0.85)
    for s in pat["snare"]:
        put_clap(T(bar, 0, s), 1.0, bar + s)
    for s in range(16):
        if hats16 or s % 2 == 0:
            g = 0.28 if s % 4 == 2 else 0.18
            if hats16 and s % 2 == 1:
                g = 0.12
            drums.add(T(bar, 0, s), HATS[s % 4], g, pan=0.25)
    if not hats16:
        for s in [7, 15] if alt else [15]:
            drums.add(T(bar, 0, s), HATS[1], 0.07, pan=0.25)
    if bass_on:
        root = note(CHORD_ROOTS[loop_i % 4])
        prev = note(CHORD_ROOTS[(loop_i - 1) % 4])
        for k, s in enumerate(ks):
            nxt = ks[k + 1] if k + 1 < len(ks) else 16
            d = (nxt - s) * STEP
            f = root * (2 if (s == 10 and loop_i % 2 == 1) else 1)
            glide = prev if (k == 0 and prev != root) else None
            bass.add(T(bar, 0, s), bass808(f, d, glide), 0.8)
    if cow:
        for s, nn in MELODY[loop_i % 4].items():
            c = cowbell(note(nn) * 2**octave)
            music.add(T(bar, 0, s), c, cow_gain, pan=0.15)
            send.add(T(bar, 0, s), c, cow_gain * 0.5)


# --- 4-12: drop A / typing / secret / pet
for i, bar in enumerate(range(4, 13)):
    groove_bar(bar, i, alt=(bar % 2 == 1), hats16=(bar >= 9), cow_gain=0.16 if bar < 9 else 0.13)
sfx.add(T(4), boom(), 0.7)
sfx.add(T(4), crash(), 0.35)
put_kick(T(4), "hard", 0.8)
# --- 13: mash (adds 16th hats, snare roll at the end)
groove_bar(13, 9, alt=True, hats16=True)
for s in [12, 13, 14, 15]:
    put_clap(T(13, 0, s), 0.45 + 0.1 * (s - 12), s, 0.1)
# --- 14: beats 2-3 back in, 15 count-in
put_kick(T(14, 2), "phonk", 1.0)
bass.add(T(14, 2), bass808(note("C2"), 0.8, note("F1")), 0.8)
put_clap(T(14, 3), 1.0, 2)
put_clap(T(14, 3, 2), 0.7, 3)
sfx.add(T(14, 2), stamp(), 0.6)
for b in range(4):
    put_kick(T(15, b), "phonk", 0.9)
    put_clap(T(15, b), 0.4 + 0.12 * b, b, 0.15)
    tone = pop(note(["C5", "E5", "G5", "C6"][b]) * 0.98, note(["C5", "E5", "G5", "C6"][b]) * 1.02, 0.25)
    sfx.add(T(15, b), tone, 0.35)
for s in [12, 13, 14, 15]:
    put_clap(T(15, 0, s), 0.5, s, 0.1)
sfx.add(T(15), riser(BAR - 0.05, 400, 10000, 33), 0.4)
rc = crash(0.8, 44)[::-1]
sfx.add(T(16) - len(rc) / SR, filt(rc, "high", 2000), 0.3)

# --- 16-21: FRENZY
for i, bar in enumerate(range(16, 22)):
    last = bar == 21
    pat = FRENZY
    ks = [0, 4] if last else pat["kick"]
    for s in ks:
        put_kick(T(bar, 0, s), "hard", 1.0)
    for s in ([4] if last else pat["snare"]):
        put_clap(T(bar, 0, s), 1.0, s, 0.3)
    if not last:
        for s in [2, 6, 10, 14]:
            drums.add(T(bar, 0, s), OHAT, 0.16, pan=-0.2)
        for s in range(16):
            drums.add(T(bar, 0, s), HATS[s % 4], 0.1 if s % 2 else 0.16, pan=0.3)
    root = note(CHORD_ROOTS[i % 4])
    for s in range(0, 8 if last else 16, 2):
        f = root * (2 if (s // 2) % 2 else 1)
        bass.add(T(bar, 0, s), bass808(f, 2 * STEP, None, 3.5), 0.7)
    if not last:
        for s, nn in MELODY[i % 4].items():
            c = cowbell(note(nn))
            music.add(T(bar, 0, s), np.tanh(2 * c), 0.13, pan=-0.15)
            send.add(T(bar, 0, s), c, 0.06)
sfx.add(T(16), boom(1.6, 80, 30), 0.65)
sfx.add(T(16), crash(), 0.35)
for k, (name, _) in enumerate(ANIMAL_SEQ):
    t0 = FRENZY_START + k * BEAT
    long_ = name.startswith("other-0") and name in ("other-02", "other-06", "other-03")
    s = chop(name, 0.62 if long_ else 0.42, thresh=0.1, fout=0.08)
    pan = [-0.5, 0.5][k % 2]
    vox.add(t0, s, 0.5 if name.startswith("meow") else 0.55, pan=pan * 0.6)
    send.add(t0, s, 0.12)
# return home: whoosh + reverse crash into the landing
sfx.add(FRENZY_RETURN, whoosh(0.8, 200, 7000, 22), 0.5)
rc = crash(0.8, 45)[::-1]
sfx.add(T(22) - len(rc) / SR, filt(rc, "high", 2500), 0.3)

# --- 22-25: chill (half-time lo-fi)
sfx.add(T(22), boom(1.2, 65, 35), 0.5)
put_kick(T(22), "soft", 1.0)
sfx.add(T(22, 0, 8), ding(1568, 1.8), 0.22)
lofi = Bus()
lofi_chords = [
    (["F3", "Ab3", "C4", "Eb4", "G4"], "F2"),
    (["Db3", "F3", "Ab3", "C4"], "Db2"),
    (["Bb2", "Db3", "F3", "Ab3", "C4"], "Bb1"),
    (["C3", "E3", "G3", "Bb3", "Db4"], "C2"),
]
for i, bar in enumerate(range(22, 26)):
    ch, root = lofi_chords[i]
    for j, nn in enumerate(ch):
        lofi.add(T(bar) + 0.015 * j, ep_note(note(nn), 1.5, 0.7), 0.075, pan=-0.3 + 0.15 * j)
    bass.add(T(bar), bass808(note(root) / 2 if note(root) > 60 else note(root), 1.5, None, 1.6), 0.55)
    if bar > 22:
        for s in CHILL["kick"]:
            put_kick(T(bar, 0, s), "soft", 0.9)
        drums.add(T(bar, 0, 8), rim(), 0.35)
        send.add(T(bar, 0, 8), rim(), 0.25)
    else:
        drums.add(T(bar, 0, 8), rim(), 0.3)
    for s in range(0, 16, 2):
        sw = 0.03 if (s // 2) % 2 else 0.0  # swing
        drums.add(T(bar, 0, s) + sw, filt(HATS[s % 4], "low", 9000), 0.06, pan=0.3)
lofi.x = np.stack([filt(lofi.x[:, c], "low", 2600) for c in range(2)], 1)
music.x += lofi.x
# vinyl crackle
crk = np.zeros(int(6.4 * SR))
cr = np.random.default_rng(97)
for p in cr.integers(0, len(crk) - 100, 900):
    crk[p : p + 30] += cr.uniform(-1, 1) * np.exp(-np.arange(30) / 4)
crk = filt(crk, "high", 1500)
sfx.add(T(22), fade(crk, 0.2, 0.3), 0.08)
for s in [12, 13, 14, 15]:
    put_clap(T(25, 0, s), 0.4 + 0.12 * (s - 12), s, 0.1)
sfx.add(T(25, 2), riser(0.8, 500, 9000, 34), 0.35)

# --- 26-31: drop again (specs, outro)
for i, bar in enumerate(range(26, 32)):
    groove_bar(bar, i, alt=(bar % 2 == 1), hats16=(bar >= 30), cow_gain=0.16)
for t0 in [T(26), T(30)]:
    sfx.add(t0, crash(), 0.3)
    sfx.add(t0, boom(1.2), 0.45)
# --- 32: final hit
put_kick(T(32), "hard", 1.0)
put_clap(T(32), 1.0, 1, 0.5)
sfx.add(T(32), boom(2.6, 75, 26), 0.75)
sfx.add(T(32), crash(2.8, 47), 0.4)
bass.add(T(32), bass808(note("F1"), 2.4, note("C2"), 3.0), 0.8)
for nn in ["F5", "C6"]:
    c = cowbell(note(nn), 0.6)
    music.add(T(32), c, 0.15)
    send.add(T(32), c, 0.25)

# ------------------------------------------------------------------- SFX
# typing
for i, (t0, key, kind) in enumerate(TYPING):
    g = 0.8 if kind != "mash" else 0.62
    sfx.add(t0, keyclick(i), g, pan=(-0.35 if key in "QWERTASDFGZXCV" or key in ("Esc", "Space") else 0.35))
# typing specials
sfx.add(T(7, 0), rocket(0.9), 0.5)
sfx.add(T(7, 1), pop(500, 220, 0.12), 0.3)
sfx.add(T(7, 2), whoosh(0.35, 400, 4000, 23), 0.45)
sfx.add(T(7, 2, 2), whoosh(0.3, 4000, 600, 24), 0.35)
sfx.add(T(7, 3), boing(), 0.3)
# ctrl+v clones: pops; ctrl+z: rewind
for k, t0 in enumerate([T(8, 1), T(8, 1, 2), T(8, 2)]):
    sfx.add(t0, pop(300 * 1.25**k, 1300 * 1.25**k, 0.1), 0.35)
# secret words
sfx.add(T(9, 2), siren(0.8), 0.22)
sfx.add(T(9, 2), sparkle(), 0.2)
for k in range(6):
    sfx.add(T(9, 2) + 0.13 * k, pop(260 + 40 * k, 900, 0.07), 0.12)
duck = chop("other-01", 1.2, thresh=0.1, fout=0.2)
vox.add(T(10, 2), duck, 0.5, pan=0.3)
sfx.add(T(10, 2), whoosh(0.5, 300, 3000, 25), 0.3)
# clicks
for k, t0 in enumerate(CLICKS):
    sfx.add(t0 - 0.01, mouseclick(k), 0.6, pan=0.2)
for k, t0 in enumerate([T(11, i) for i in range(8)]):
    sfx.add(t0 + 0.02, boing(0.3), 0.12)
    sfx.add(t0 + 0.04, sparkle(2093 * (1.06 ** (k % 4))), 0.08)
pet_meows = [chop("meow-05", 0.9, thresh=0.1, fout=0.2), chop("meow-23", 0.9, thresh=0.1, fout=0.2)]
for k, t0 in enumerate(PET_MEOW_CLICKS):
    vox.add(t0 + 0.05, pet_meows[k], 0.42, pan=-0.2)
    send.add(t0 + 0.05, pet_meows[k], 0.15)
# mash -> dizzy
sfx.add(T(14), dizzy(0.8), 0.25)
sfx.add(T(14), boing(0.5), 0.2)
dz = chop("meow-10", 1.0, thresh=0.1, fout=0.25)
vox.add(T(14) + 0.12, dz, 0.45)
send.add(T(14) + 0.12, dz, 0.2)
# rest: notification ding, then "我知道了" meow
sfx.add(T(23), ding(1046.5, 1.4), 0.2)
sfx.add(T(23) + 0.12, ding(1568, 1.4), 0.16)
# (meow on "我知道了" removed per script edit)
sfx.add(T(24) + 0.05, sparkle(2637), 0.12)
# panel look flips
for b in range(6):
    sfx.add(T(24, 2 + b), pop(600, 1500, 0.06), 0.1)
# specs: whoosh between cards
for k in range(8):
    sfx.add(T(26, 2 * k) - 0.12, whoosh(0.16, 800, 6000, 26 + k), 0.18)
# outro: "mengshu" answer
sfx.add(T(31), sparkle(2349), 0.18)
sfx.add(T(31, 2), stamp(), 0.4)
# post gag
# (post-gag meow removed per script edit)

# ---------------------------------------------------------------- editing
def replace(bus, t0, t1, seg):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    seg = seg[: i1 - i0]
    xf = 240
    bus.x[i0:i1] = 0
    seg = seg.copy()
    seg[:xf] *= np.linspace(0, 1, xf)[:, None]
    seg[-xf:] *= np.linspace(1, 0, xf)[:, None]
    bus.x[i0 : i0 + len(seg)] += seg


def warp(bus_x, t_src, speed):
    """Read bus_x from t_src with a time-varying playback speed array."""
    pos = t_src * SR + np.cumsum(speed)
    out = np.zeros((len(speed), 2))
    idx = np.arange(len(bus_x))
    for c in range(2):
        out[:, c] = np.interp(pos, idx, bus_x[:, c])
    return out


# Ctrl+Z at bar 8 beat 3: rewind the previous beat-and-a-half at 2.5x backwards.
for bus in (music, bass, drums):
    src = bus.x.copy()
    n = int(BEAT * SR)
    sp = -np.ones(n) * 2.5
    seg = warp(src, T(8, 3), sp)
    seg = np.stack([filt(seg[:, c], "high", 250) for c in range(2)], 1) * 0.9
    replace(bus, T(8, 3), T(9), seg)
# Dizzy: tape-stop bar 14 beats 0-1.
for bus in (music, bass, drums):
    src = bus.x.copy()
    n = int(2 * BEAT * SR)
    u = np.arange(n) / n
    sp = np.clip(1 - u / 0.7, 0, 1) ** 1.5
    seg = warp(src, T(14), sp)
    replace(bus, T(14), T(14, 2), seg)

# -------------------------------------------------------------------- mix
# kick sidechain on melodic and bass buses
duck_env = np.zeros(N)
for t0, g in kick_times:
    i = int(t0 * SR)
    L = int(0.25 * SR)
    j = min(N, i + L)
    e = np.exp(-np.arange(j - i) / (0.07 * SR)) * g
    duck_env[i:j] = np.maximum(duck_env[i:j], e)
bass.x *= (1 - 0.55 * duck_env)[:, None]
music.x *= (1 - 0.35 * duck_env)[:, None]

wet = reverb(send.x)

# Bus gains (set by measuring short-term loudness per section, see report).
G = dict(drums=0.32, bass=0.16, music=1.35, sfx=0.55, vox=0.95, wet=0.30)
master = drums.x * G["drums"] + bass.x * G["bass"] + music.x * G["music"] + sfx.x * G["sfx"] + vox.x * G["vox"] + wet * G["wet"]


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    z = kweight(x) ** 2
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([z[i : i + blk].mean(0).sum() for i in range(0, len(z) - blk, hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g = ms[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(g.mean())


def short_lufs(x, t0, t1):
    seg = x[int(t0 * SR) : int(t1 * SR)]
    z = kweight(seg) ** 2
    return -0.691 + 10 * np.log10(z.mean(0).sum() + 1e-12)


from scipy.ndimage import maximum_filter1d  # noqa: E402


def limiter(x, ceil=0.89, blk=32, rel=0.07):
    """Lookahead peak limiter: block-wise gain with instant attack (the
    block max is taken one block early) and exponential release."""
    a = np.max(np.abs(x), 1)
    nb = (len(a) + blk - 1) // blk
    pad = np.zeros(nb * blk)
    pad[: len(a)] = a
    bm = pad.reshape(nb, blk).max(1)
    bm = maximum_filter1d(bm, 3)  # one block of lookahead either side
    need = np.minimum(1.0, ceil / np.maximum(bm, 1e-9)).tolist()
    r = float(np.exp(-blk / (rel * SR)))
    out = [1.0] * nb
    cur = 1.0
    for k, gk in enumerate(need):
        cur = gk if gk < cur else gk + (cur - gk) * r
        out[k] = cur
    centers = (np.arange(nb) + 0.5) * blk
    g = np.interp(np.arange(len(a)), centers, np.array(out))
    g = np.minimum(g, np.minimum(1.0, ceil / np.maximum(a, 1e-9)) ** 0 * g)
    return x * g[:, None], g


TARGET = -10.5
pre = lufs(master)
master *= 10 ** ((TARGET - pre) / 20)
master, gr = limiter(master)
print(f"pre-gain loudness {pre:.1f} LUFS, max limiter reduction {-20*np.log10(gr.min()):.1f} dB, "
      f"time >3dB GR {np.mean(gr < 10**(-3/20))*100:.1f}%")
master = np.clip(master, -0.98, 0.98)
end = int(DURATION * SR)
master = master[:end]
master[-int(0.3 * SR) :] *= np.linspace(1, 0, int(0.3 * SR))[:, None]
print(f"final integrated {lufs(master):.1f} LUFS, peak {20*np.log10(np.abs(master).max()):.2f} dBFS")

os.makedirs(WORK, exist_ok=True)
wavfile.write(os.path.join(WORK, "mix.wav"), SR, (master * 32767).astype(np.int16))
for nm, b in [("drums", drums.x * G["drums"]), ("bass", bass.x * G["bass"]), ("music", music.x * G["music"]), ("sfx", sfx.x * G["sfx"]), ("vox", vox.x * G["vox"])]:
    np.save(os.path.join(WORK, f"bus_{nm}.npy"), b[:end].astype(np.float32))

if "--report" in sys.argv:
    from score import SECTIONS
    print("section     " + "  ".join(f"{n:>6s}" for n in ["drums", "bass", "music", "sfx", "vox", "MASTER"]))
    scale = 10 ** ((TARGET - pre) / 20)
    for name, b0, b1 in SECTIONS:
        t0, t1 = T(b0), min(T(b1), DURATION)
        vals = [short_lufs(bb * G[k] * scale, t0, t1) for k, bb in [("drums", drums.x), ("bass", bass.x), ("music", music.x), ("sfx", sfx.x), ("vox", vox.x)]]
        vals.append(short_lufs(master, t0, t1))
        print(f"{name:10s}  " + "  ".join(f"{v:6.1f}" for v in vals))

    seg = master[int(T(4) * SR) : int(T(6) * SR)].mean(1)
    f, P = signal.welch(seg, SR, nperseg=8192)
    bands = [(20, 100), (100, 500), (500, 2000), (2000, 6000), (6000, 20000)]
    tot = P.sum()
    print("logo spectrum share: " + "  ".join(f"{a}-{b}Hz {100*P[(f>=a)&(f<b)].sum()/tot:4.1f}%" for a, b in bands))
