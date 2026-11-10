"""Add short, tapered side hairs beneath the original cat cutout (no AI).

Use the recorded original asset so repeated runs do not accumulate hairs.
Retouch ear color, add side fur, and gently feather the silhouette perimeter.
"""
from pathlib import Path
import io
import json
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
raw = subprocess.check_output(
    ['git', 'show', '0fb7215:src/renderer/assets/cat.png'], cwd=ROOT)
base = Image.open(io.BytesIO(raw)).convert('RGBA')

# Restore the original photographed crown without remapping its texture.
crown_before = base.copy()
width, height = base.size

# Neutralize the warm background spill beside the screen-right ear before
# sampling coat colors for the fringe. Keep luminance, texture and alpha.
coat = np.array(base)
rgb = coat[:, :, :3].astype(float)
yy, xx = np.ogrid[:base.height, :base.width]
region = np.clip((1 - ((xx-753)/62)**2 - ((yy-348)/108)**2)*4, 0, 1)
warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2] - 3)/9, 0, 1)
weight = region * warm * (coat[:, :, 3] > 0)
luma = rgb @ np.array([.2126, .7152, .0722])
neutral = np.stack([luma, luma, luma], axis=2)
coat[:, :, :3] = np.rint(rgb*(1-weight[:, :, None]) +
                        neutral*weight[:, :, None]).astype(np.uint8)
base = Image.fromarray(coat)
data = np.array(base)
alpha = data[:, :, 3]
field = cv2.GaussianBlur(alpha.astype(float), (0, 0), 3)
gy, gx = np.gradient(field)
shoulder_field = cv2.GaussianBlur(alpha.astype(float), (0, 0), 11)
shoulder_gy, shoulder_gx = np.gradient(shoulder_field)
contours, _ = cv2.findContours((alpha > 127).astype(np.uint8),
                              cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
rng = np.random.default_rng(11010)
scale = 3
layer = Image.new('RGBA', (base.width * scale, base.height * scale))
draw = ImageDraw.Draw(layer)
count = 0
for x, y in max(contours, key=cv2.contourArea)[:, 0]:
    if y >= base.height - 65:
        continue
    if not ((x < 210 and y > 490) or (x > 710 and y > 330)):
        continue
    if rng.random() < .06:
        continue
    normal = -np.array([gx[y, x], gy[y, x]])
    norm = np.linalg.norm(normal)
    if norm < 1:
        continue
    normal /= norm
    shoulder = float(np.exp(-((x-890)/190)**2 - ((y-765)/135)**2)) if x > 710 else 0
    # Average the direction across the neck-to-back bend for a continuous flow.
    smooth_normal = -np.array([shoulder_gx[y, x], shoulder_gy[y, x]])
    smooth_normal /= max(np.linalg.norm(smooth_normal), 1e-6)
    normal = normal * (1-shoulder*.75) + smooth_normal * shoulder*.75
    normal /= np.linalg.norm(normal)
    tangent = np.array([-normal[1], normal[0]])
    sample = np.rint(np.array([x, y]) - normal * 7).astype(int)
    sx, sy = sample
    color = np.median(data[sy-2:sy+3, sx-2:sx+3, :3].reshape(-1, 3), axis=0)
    color = np.clip(color * rng.uniform(.96, 1.20), 0, 255).astype(int)
    direction = normal + tangent * rng.uniform(-.8, .8) + np.array([0, .48])
    direction /= np.linalg.norm(direction)
    # Visible at desktop scale: dense short coat plus scattered longer tufts.
    tuft = .8 + .3 * np.sin(y * .13 + x * .09)
    length = rng.uniform(12, 25) * tuft * (1.35 if rng.random() < .12 else 1)
    left_side = x < 210
    length *= .78 if left_side else .95
    length *= 1 + shoulder * .48
    cheek = float(np.exp(-((x-753)/65)**2 - ((y-395)/110)**2)) if x > 710 else 0
    length *= 1 - cheek * .52
    root = np.array([x, y]) - normal * 2
    opacity = int(rng.uniform(205, 255))
    opacity = round(opacity * (.80 if left_side else .92))
    opacity = min(255, round(opacity * (1 + shoulder * .12)))
    opacity = round(opacity * (1 - cheek * .28))
    # Layer each hair under the photo, with a fine translucent tapered tip.
    for strand in range(2 if shoulder > .25 else 1):
        for step in range(8):
            t0, t1 = step / 8, (step + 1) / 8
            def point(t):
                offset = tangent * strand * 1.6
                p = root + offset + direction * length * t * (1-strand*.24)
                p += tangent * (t*t) * (2 + shoulder*3 + strand*2)
                return tuple(p * scale)
            draw.line([point(t0), point(t1)],
                      fill=(*map(int, color), int(opacity * (1 - t0) ** .65)),
                      width=max(1, round(scale * 1.25 * (1 - t0))))
    count += 1
# A separate deterministic pass keeps the approved body fur unchanged.
ear_rng = np.random.default_rng(11011)
ear_count = 0
for x, y in max(contours, key=cv2.contourArea)[::2, 0]:
    if not ((x < 200 and y < 335) or (x > 535 and y < 305)):
        continue
    normal = -np.array([gx[y, x], gy[y, x]])
    norm = np.linalg.norm(normal)
    if norm < 1:
        continue
    normal /= norm
    tangent = np.array([-normal[1], normal[0]])
    sx, sy = np.rint(np.array([x, y])-normal*6).astype(int)
    sx, sy = np.clip(sx, 2, width-3), np.clip(sy, 2, height-3)
    color = np.median(data[sy-2:sy+3, sx-2:sx+3, :3].reshape(-1, 3), axis=0)
    color = np.clip(color*ear_rng.uniform(.98, 1.13), 0, 255).astype(int)
    direction = normal + tangent*ear_rng.uniform(-.55, .55)
    direction /= np.linalg.norm(direction)
    length = ear_rng.uniform(6, 12)
    root = np.array([x, y])-normal*1.8
    for step in range(8):
        t0, t1 = step/8, (step+1)/8
        def ear_point(t):
            return tuple((root + direction*length*t + tangent*t*t*.8)*scale)
        draw.line([ear_point(t0), ear_point(t1)],
                  fill=(*map(int, color), int(215*(1-t0)**.7)),
                  width=max(1, round(scale*.95*(1-t0))))
    ear_count += 1
crown_rng = np.random.default_rng(11012)
crown_count = 0
for x, y in max(contours, key=cv2.contourArea)[::2, 0]:
    if not (215 < x < 525 and 110 < y < 205):
        continue
    normal = -np.array([gx[y, x], gy[y, x]])
    norm = np.linalg.norm(normal)
    if norm < 1:
        continue
    normal /= norm
    if normal[1] > -.3:
        continue
    tangent = np.array([-normal[1], normal[0]])
    sx, sy = np.rint(np.array([x, y])-normal*8).astype(int)
    color = np.median(data[sy-2:sy+3, sx-2:sx+3, :3].reshape(-1, 3), axis=0)
    color = np.clip(color*crown_rng.uniform(.95, 1.08), 0, 255).astype(int)
    direction = normal + tangent*crown_rng.uniform(-.6, .6)
    direction /= np.linalg.norm(direction)
    length = crown_rng.uniform(5, 12)
    root = np.array([x, y])-normal*2
    for step in range(8):
        t0, t1 = step/8, (step+1)/8
        def crown_point(t):
            return tuple((root + direction*length*t + tangent*t*t)*scale)
        draw.line([crown_point(t0), crown_point(t1)],
                  fill=(*map(int, color), int(205*(1-t0)**.7)),
                  width=max(1, round(scale*.9*(1-t0))))
    crown_count += 1
layer = layer.resize(base.size, Image.Resampling.LANCZOS)
layer = layer.filter(ImageFilter.GaussianBlur(.45))
result = Image.alpha_composite(layer, base)
opaque = alpha == 255
output = np.array(result)
preserve_head = (yy < 330) & ~(((xx < 215) & (yy < 350)) |
                                      ((xx > 520) & (yy < 320)) |
                                      ((xx > 205) & (xx < 535) & (yy > 95) & (yy < 215)))
output[preserve_head] = data[preserve_head]
output[opaque] = data[opaque]
result = Image.fromarray(output)
assert np.array_equal(np.array(result)[opaque], data[opaque])
assert np.array_equal(np.array(result)[preserve_head], data[preserve_head])
# Feather inward only: no colored halo from transparent RGB outside the image.
# The small subpixel transition softens the head, ears and body consistently.
edge_alpha = output[:, :, 3].astype(float)
soft_alpha = np.array(result.getchannel('A').filter(ImageFilter.GaussianBlur(.65)))
shoulder_weight = np.exp(-((xx-890)/190)**2 - ((yy-765)/135)**2)
rounder_alpha = np.array(result.getchannel('A').filter(ImageFilter.GaussianBlur(.95)))
soft_alpha = soft_alpha*(1-shoulder_weight) + rounder_alpha*shoulder_weight
cheek_weight = np.exp(-((xx-753)/65)**2 - ((yy-395)/110)**2)
cheek_alpha = np.array(result.getchannel('A').filter(ImageFilter.GaussianBlur(1.15)))
soft_alpha = soft_alpha*(1-cheek_weight) + cheek_alpha*cheek_weight
output[:, :, 3] = np.rint(edge_alpha * .35 +
                          np.minimum(edge_alpha, soft_alpha) * .65).astype(np.uint8)
interior = np.array(base.getchannel('A').filter(ImageFilter.MinFilter(7))) == 255
output[interior] = data[interior]
assert np.array_equal(output[interior], data[interior])
result = Image.fromarray(output)
result.save(ROOT / 'src/renderer/assets/cat.png')
meta_path = ROOT / 'docs/cat-source-region.json'
meta = json.loads(meta_path.read_text(encoding='utf-8'))
meta['ear_color_repair'] = 'localized neutral gray correction beside right ear; luminance and alpha preserved'
meta['crown_repair'] = {'method': 'original photographed contour and texture with short tapered fur tips',
                        'hair_count': crown_count, 'length_px': [5, 12]}
meta['ear_fur'] = {'method': 'short soft tapered hairs from nearby coat colors',
                   'hair_count': ear_count, 'length_px': [6, 12]}
meta['body_fur'] = {
    'method': 'sampled coat colors, tapered short hairs beneath original alpha',
    'script': 'scripts/soften-body-fur.py',
    'base_commit': '0fb7215',
    'hair_count': count,
    'interior_pixels_unchanged': True,
    'left_fur_length_scale': .78,
    'left_fur_opacity_scale': .80,
    'edge_feather_sigma': .65,
    'shoulder_fur': 'local extra strands, longer tips, smoothed flow and 0.95px feather',
    'right_ear_cheek': 'shorter softer fur tips and local 1.15px feather',
}
meta_path.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
review = ROOT / 'docs/edge-review'
comparison = Image.new('RGB', (840, 640), '#202626')
for row, image in enumerate([crown_before, result]):
    bg = Image.new('RGBA', image.size, '#202626')
    bg.alpha_composite(image)
    patch = bg.crop((165, 90, 585, 170+80)).resize((840, 320))
    comparison.paste(patch, (0, row*320))
comparison.save(review / 'natural-crown-fur-comparison.png')
for name, box in [('left-body', (65, 570, 225, 990)),
                  ('right-neck-body', (700, 350, 1170, 1000))]:
    w, h = box[2]-box[0], box[3]-box[1]
    canvas = Image.new('RGB', (w*2, h*2))
    for row, bg_color in enumerate(['#151919', '#eeeee5']):
        for col, image in enumerate([base, result]):
            bg = Image.new('RGBA', base.size, bg_color)
            bg.alpha_composite(image)
            canvas.paste(bg.crop(box).convert('RGB'), (col*w, row*h))
    canvas.save(review / f'{name}-soft-fur-comparison.png')
print(f'Added {count} tapered side hairs; left side reduced; perimeter feathered; interior verified')
