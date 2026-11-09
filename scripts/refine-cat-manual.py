"""Apply the hand-traced contour to original RGB; no generative or automatic segmentation.

Run: python scripts/refine-cat-manual.py
Dependencies: pillow, numpy, opencv-python.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / 'scripts/cat-outline.json').read_text(encoding='utf-8'))
source_path = ROOT / spec['source']
source = Image.open(source_path).convert('RGB')
points = np.array([p for section in spec['sections'].values() for p in section], dtype=float)

# Cardinal spline through manually selected anchors. No fitted segmentation mask.
curve = []
for i in range(len(points)):
    p0, p1, p2, p3 = (points[(i + j) % len(points)] for j in [-1, 0, 1, 2])
    m1, m2 = .38 * (p2 - p0), .38 * (p3 - p1)
    for t in np.linspace(0, 1, max(8, int(np.linalg.norm(p2-p1))), endpoint=False):
        curve.append((2*t**3-3*t**2+1)*p1+(t**3-2*t**2+t)*m1+(-2*t**3+3*t**2)*p2+(t**3-t**2)*m2)
curve = np.array(curve)
scale = 4
mask = Image.new('L', (source.width*scale, source.height*scale))
ImageDraw.Draw(mask).polygon([tuple(p*scale) for p in curve], fill=255)
mask = mask.resize(source.size, Image.Resampling.LANCZOS)
coverage = np.array(mask, dtype=np.float32) / 255
inside = (coverage >= .5).astype(np.uint8)
distance = cv2.distanceTransform(inside, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
y, x = np.ogrid[:source.height, :source.width]
width = np.full(source.size[::-1], 1.8, dtype=np.float32)
width[y[:,0] < 450] = 1.15
width[(x < 510) & (y > 460) & (y < 900)] = 2.1
transition = np.clip((distance-.35)/width, 0, 1)
transition = transition*transition*(3-2*transition)
alpha = np.round(coverage*transition*255).astype(np.uint8)
mask = Image.fromarray(alpha)
box = mask.getbbox()
rgba = source.convert('RGBA')
rgba.putalpha(mask)
result = rgba.crop(box)
assert np.array_equal(np.array(result)[:,:,:3], np.array(source.crop(box)))
result.save(ROOT/'src/renderer/assets/cat.png')
(ROOT/'docs/cat-source-region.json').write_text(json.dumps({
    'source':'reference.jpg','source_sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),
    'crop':box,'rgb_identical_to_source_region':True,
    'alpha':'hand-traced regional contour; 4x supersampling; local 1.15-2.1px inward feather',
    'contour':'scripts/cat-outline.json','anchor_count':len(points)
},indent=2),encoding='utf-8')

# Explicit visual review artifacts; these are not runtime assets.
out = ROOT/'docs/edge-review'
out.mkdir(exist_ok=True)
for name, color in [('light','#eeeee5'),('dark','#202626')]:
    bg=Image.new('RGBA',rgba.size,color);bg.alpha_composite(rgba)
    bg.convert('RGB').save(out/f'manual-{name}.jpg',quality=95)
preview=source.copy();d=ImageDraw.Draw(preview)
d.line([tuple(p) for p in curve]+[tuple(curve[0])],fill='#00ded0',width=2)
for p in points:
    px,py=p;d.ellipse((px-2,py-2,px+2,py+2),fill='#ff496a')
preview.save(out/'manual-contour-review.png')
for name,box in {'ears':(390,140,1170,470),'cheeks':(410,430,1225,890),'neck':(1110,650,1410,970),'body':(480,850,1650,1279)}.items():
    preview.crop(box).save(out/f'{name}-manual.png')
print(f'Manual mask: {len(points)} anchors; original RGB verified; crop {result.size}',flush=True)
