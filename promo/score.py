"""Shared timing for the promo: music and picture both read from here, so every
cut lands on the beat it was written for.

150 BPM: one beat = 0.4 s = 12 frames at 30 fps, one 16th = 3 frames.
"""

BPM = 150
BEAT = 60 / BPM  # 0.4 s
STEP = BEAT / 4  # 0.1 s
BAR = BEAT * 4  # 1.6 s
FPS = 30
SR = 48000


def T(bar, beat=0.0, step=0.0):
    return round(bar * BAR + beat * BEAT + step * STEP, 6)


DURATION = 55.6
NFRAMES = int(round(DURATION * FPS))

# Bars of each section (start inclusive, end exclusive).
SECTIONS = [
    ("cold", 0, 2),  # boring desktop
    ("build", 2, 4),  # word slams, cat peeks up
    ("logo", 4, 6),  # first drop: logo reveal
    ("typing", 6, 9),  # paws, key pops, specials, ctrl+v clones
    ("secret", 9, 11),  # moyu / xiaban easter eggs
    ("pet", 11, 13),  # click the cat: 520 lines
    ("mash", 13, 15),  # mash -> dizzy -> "not done yet"
    ("count", 15, 16),  # 1 2 3 4 clicks
    ("frenzy", 16, 22),  # 发癫
    ("rest", 22, 26),  # rest reminder + panel looks
    ("specs", 26, 30),  # feature speed-run
    ("outro", 30, 32),  # mengshu -> logo
    ("end", 32, 35),  # final hit, eye zoom, black, post-gag
]


def section_at(t):
    for name, b0, b1 in SECTIONS:
        if T(b0) <= t < T(b1):
            return name, t - T(b0)
    return SECTIONS[-1][0], t - T(SECTIONS[-1][1])


# ---------------------------------------------------------------- drum grid
# Per-bar patterns (16 steps). Visual hits read these too.
PHONK = dict(kick=[0, 6, 10], kick_alt=[0, 6, 10, 14], snare=[8])
FRENZY = dict(kick=[0, 4, 8, 12], snare=[4, 12])
CHILL = dict(kick=[0, 7, 10], snare=[8])


def drum_hits():
    """List of (time, kind, strength) for every kick/snare in the song."""
    hits = []

    def bar_pattern(bar, pat, alt=False):
        ks = pat.get("kick_alt") if alt and "kick_alt" in pat else pat["kick"]
        for s in ks:
            hits.append((T(bar, 0, s), "kick", 1.0 if s == 0 else 0.7))
        for s in pat["snare"]:
            hits.append((T(bar, 0, s), "snare", 1.0))

    # build: bar 2 quarters, bar 3 eighths then sixteenths
    for b in range(4):
        hits.append((T(2, b), "kick", 0.5))
        hits.append((T(2, b), "snare", 0.4 + 0.1 * b))
    for s in [0, 2, 4, 6]:
        hits.append((T(3, 0, s), "snare", 0.7))
    for s in [8, 9, 10, 11]:
        hits.append((T(3, 0, s), "snare", 0.8))
    for bar in range(4, 13):
        bar_pattern(bar, PHONK, alt=(bar % 2 == 1))
    bar_pattern(13, PHONK, alt=True)
    for s in [12, 13, 14, 15]:
        hits.append((T(13, 0, s), "snare", 0.6))
    # bar 14: tape stop on beats 0-1, back in on beat 2
    hits.append((T(14, 2), "kick", 1.0))
    hits.append((T(14, 3), "snare", 1.0))
    hits.append((T(14, 3, 2), "snare", 0.7))
    # bar 15: count-in
    for b in range(4):
        hits.append((T(15, b), "kick", 0.9))
        hits.append((T(15, b), "snare", 0.6))
    for bar in range(16, 21):
        bar_pattern(bar, FRENZY)
    for s in [0, 4]:
        hits.append((T(21, 0, s), "kick", 1.0))
    hits.append((T(21, 0, 4), "snare", 1.0))
    hits.append((T(22), "kick", 1.0))  # landing
    for bar in range(22, 26):
        if bar > 22:
            bar_pattern(bar, CHILL)
        else:
            hits.append((T(22, 0, 8), "snare", 0.6))
    for s in [12, 13, 14, 15]:
        hits.append((T(25, 0, s), "snare", 0.5 + 0.1 * (s - 12)))
    for bar in range(26, 32):
        bar_pattern(bar, PHONK, alt=(bar % 2 == 1))
    hits.append((T(32), "kick", 1.0))
    hits.append((T(32), "snare", 1.0))
    hits.sort()
    return hits


HITS = drum_hits()

# ------------------------------------------------------------- key presses
# (time, key label). Paw side follows the app: key.x < 7.5 is the screen-left paw.
LEFT_KEYS = list("QWERTASDFGZXCV")
RIGHT_KEYS = list("YUIOPHJKLNM")


def _typing():
    import random

    rnd = random.Random(42)
    ev = []
    # bar 6: eighth-note typing, alternating paws
    for i in range(8):
        ev.append((T(6, 0, 2 * i), rnd.choice(LEFT_KEYS if i % 2 == 0 else RIGHT_KEYS), "plain"))
    # bar 7: specials on beats, light taps on the offbeats
    specials = ["Enter", "Backspace", "Esc", "Space"]
    for b in range(4):
        ev.append((T(7, b), specials[b], "special"))
        ev.append((T(7, b, 2), rnd.choice(RIGHT_KEYS if b % 2 == 0 else LEFT_KEYS), "plain"))
    # bar 8: ctrl+c, ctrl+v x3, ctrl+z
    ev.append((T(8, 0), "C", "ctrl"))
    ev.append((T(8, 1), "V", "ctrl"))
    ev.append((T(8, 1, 2), "V", "ctrl"))
    ev.append((T(8, 2), "V", "ctrl"))
    ev.append((T(8, 3), "Z", "ctrl"))
    # secret words
    for i, ch in enumerate("MOYU"):
        ev.append((T(9, 0, 2 * i), ch, "letter"))
    for i, ch in enumerate("XIABAN"):
        ev.append((T(10, 0, i), ch, "letter"))
    # mash: sixteenths for a bar
    for i in range(16):
        ev.append((T(13, 0, i), rnd.choice(LEFT_KEYS if i % 2 == 0 else RIGHT_KEYS), "mash"))
    # outro: mengshu
    for i, ch in enumerate("MENGSHU"):
        ev.append((T(30, 0, 2 * i), ch, "letter"))
    ev.sort(key=lambda e: e[0])
    return ev


TYPING = _typing()

CLICKS = (
    [T(11, i * 1.0) for i in range(8)]  # pet: one per beat
    + [T(15, b) for b in range(4)]
    + [T(16)]  # 5th click = frenzy
    + [T(24)]  # rest "我知道了"
)
PET_MEOW_CLICKS = [T(11, 0), T(11, 4)]

# Frenzy: an animal on every beat, beats 0..21 of bars 16-21.
FRENZY_START = T(16)
FRENZY_RETURN = T(21, 2)
FRENZY_LAND = T(22)
ANIMAL_SEQ = [
    ("meow-14", "喵！"),
    ("dog-01", "汪汪！"),
    ("meow-24", "喵～"),
    ("other-01", "嘎嘎嘎！"),
    ("meow-15", "喵！"),
    ("other-02", "喔喔喔～"),
    ("meow-27", "喵嗷！"),
    ("other-03", "哞～～"),
    ("meow-14", "喵！"),
    ("other-04", "咩～"),
    ("meow-29", "喵呜～"),
    ("other-05", "哼哼！"),
    ("meow-24", "喵～"),
    ("other-06", "嗯啊～"),
    ("meow-15", "喵！"),
    ("other-07", "啾啾！"),
    ("meow-27", "喵嗷！"),
    ("other-09", "吱吱！"),
    ("meow-14", "喵！"),
    ("other-08", "喵？（人类学的）"),
    ("meow-29", "喵呜～"),
    ("dog-01", "汪！"),
]
