"""pv.py sheet.jpg 1.0 2.5 ...  -> render those times and tile them."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import video
out = sys.argv[1]
times = [float(x) for x in sys.argv[2:]]
cols = 3
w, h = 640, 360
rows = (len(times) + cols - 1) // cols
S = Image.new("RGB", (cols * w, rows * h))
d = ImageDraw.Draw(S)
os.makedirs(os.path.join(video.WORK, "preview"), exist_ok=True)
for i, t in enumerate(times):
    fi = int(round(t * video.FPS))
    im = Image.fromarray(video.render(fi))
    im.save(os.path.join(video.WORK, "preview", f"f{fi:04d}.jpg"), quality=90)
    S.paste(im.resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
    d.text(((i % cols) * w + 6, (i // cols) * h + 4), f"{t:.2f}s f{fi}", fill=(255, 0, 0))
S.save(os.path.join(video.WORK, out), quality=85)
