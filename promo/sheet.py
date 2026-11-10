import sys, os
from PIL import Image, ImageDraw
files = sys.argv[2:]
out = sys.argv[1]
cols = 3
w, h = 640, 360
rows = (len(files) + cols - 1) // cols
S = Image.new("RGB", (cols * w, rows * h), (0, 0, 0))
d = ImageDraw.Draw(S)
for i, f in enumerate(files):
    im = Image.open(f).resize((w, h))
    S.paste(im, ((i % cols) * w, (i // cols) * h))
    d.text(((i % cols) * w + 6, (i // cols) * h + 4), os.path.basename(f), fill=(255, 0, 0))
S.save(out, quality=85)
