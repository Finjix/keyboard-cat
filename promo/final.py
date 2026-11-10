"""Append the real screen recording to the rendered promo and encode the final MP4.

python final.py "D:/屏幕录制 2026-11-10 161341.mp4"

Needs work/chunks (video.py --render) and work/mix.wav (audio.py).
Output: out/懵薯宣传片_1080p30.mp4 (1080p30, H.264 20 Mbps CBR, AAC 320k).
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx as G  # noqa: E402
from score import DURATION, SR  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
OUT = "D:/懵薯宣传片_1080p30.mp4"
REC = sys.argv[1] if len(sys.argv) > 1 else "D:/屏幕录制 2026-11-10 161341.mp4"
FADE_IN, FADE_OUT = 0.25, 0.8


def probe_duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.decode().strip())


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    z = kweight(x) ** 2
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([z[i : i + blk].mean(0).sum() for i in range(0, max(1, len(z) - blk), hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g = ms[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(g.mean())


def ep_note(f, d):
    t = np.arange(int((d + 0.6) * SR)) / SR
    idx = 1.0 * np.exp(-t / 0.3) + 0.2
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t / 1.4)
    rel = np.ones_like(t)
    k = int(d * SR)
    rel[k:] = np.exp(-(t[k:] - d) / 0.2)
    x *= rel
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return x


def note(name):
    names = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
    p, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((12 * (o + 1) + names[p] - 69) / 12)


def music_bed(d):
    """Quiet lo-fi chords under the real recording (same key as the song)."""
    n = int(d * SR)
    bed = np.zeros((n, 2))
    chords = [["F3", "Ab3", "C4", "Eb4", "G4"], ["Db3", "F3", "Ab3", "C4"], ["Bb2", "Db3", "F3", "Ab3", "C4"], ["C3", "E3", "G3", "Bb3"]]
    bar = 1.6
    t0, i = 0.0, 0
    while t0 < d:
        for j, nn in enumerate(chords[i % 4]):
            s = ep_note(note(nn), bar) * 0.1
            a = int((t0 + 0.015 * j) * SR)
            b = min(n, a + len(s))
            pan = -0.3 + 0.15 * j
            bed[a:b, 0] += s[: b - a] * (1 - pan) / 2 * 2 ** 0.5
            bed[a:b, 1] += s[: b - a] * (1 + pan) / 2 * 2 ** 0.5
        t0 += bar
        i += 1
    sos = signal.butter(2, 2400, "low", fs=SR, output="sos")
    return signal.sosfilt(sos, bed, axis=0)


def tag_png(path):
    txt = "▶ 真实使用画面"
    f = G.font("bold", 40)
    tw = int(sum(G.font(G.pick_font("bold", ch), 40).getlength(ch) for ch in txt))
    w, h = tw + 56, 72
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], 36, fill=(255, 255, 255, 230))
    x = 28
    for ch in txt:
        fn = G.pick_font("bold", ch)
        ff = G.font(fn, 40)
        d.text((x, h / 2), ch, font=ff, fill=(214, 92, 130), anchor="lm")
        x += ff.getlength(ch)
    del f
    im.save(path)
    return w


def main():
    rec_d = probe_duration(REC)
    # ---- audio: promo mix + recording (loudness-matched) + soft bed
    sr, mix = wavfile.read(os.path.join(WORK, "mix.wav"))
    mix = mix.astype(np.float64) / 32768
    rec_wav = os.path.join(WORK, "rec_audio.wav")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", REC, "-vn", "-ac", "2", "-ar", str(SR), rec_wav])
    _, rec = wavfile.read(rec_wav)
    rec = rec.astype(np.float64) / 32768
    rec = rec[: int(rec_d * SR)]
    rec *= 10 ** ((-14.5 - lufs(rec)) / 20)
    bed = music_bed(rec_d)
    bed *= 10 ** ((-27 - lufs(bed)) / 20)
    tail = np.zeros((int(rec_d * SR), 2))
    tail[: len(rec)] += rec
    tail[: len(bed)] += bed[: len(tail)]
    fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
    tail[:fi] *= np.linspace(0, 1, fi)[:, None]
    tail[-fo:] *= np.linspace(1, 0, fo)[:, None]
    tail = np.tanh(tail * 1.05) / 1.05
    peak = np.abs(tail).max()
    if peak > 0.89:
        tail *= 0.89 / peak
    full = np.concatenate([mix[: int(DURATION * SR)], tail])
    wavfile.write(os.path.join(WORK, "final_mix.wav"), SR, (np.clip(full, -1, 1) * 32767).astype(np.int16))
    # ---- picture
    fc = (
        "[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setsar=1[a];"
        f"[1:v]scale=1920:1080:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709,fps=30,format=yuv420p,setsar=1,"
        f"trim=duration={rec_d:.3f},setpts=PTS-STARTPTS,"
        f"fade=t=in:st=0:d={FADE_IN},fade=t=out:st={rec_d - FADE_OUT:.3f}:d={FADE_OUT}[rt];"
        "[a][rt]concat=n=2:v=1:a=0[v]"
    )
    cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", os.path.join(WORK, "chunks", "list.txt"),
        "-i", REC, "-i", os.path.join(WORK, "final_mix.wav"),
        "-filter_complex", fc, "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level", "4.2", "-r", "30", "-g", "60", "-bf", "2",
        "-b:v", "20M", "-minrate", "20M", "-maxrate", "20M", "-bufsize", "20M", "-x264-params", "nal-hrd=cbr:force-cfr=1",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "320k", "-ar", str(SR), "-movflags", "+faststart", "-shortest", OUT,
    ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    subprocess.check_call(cmd)
    print("wrote", OUT, "duration", DURATION + rec_d)


if __name__ == "__main__":
    main()
