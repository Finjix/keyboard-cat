"""Recover original photographed hair detail inside hand-selected head edge bands.

The manual contour supplies the solid silhouette; local closed-form alpha matting
recovers photographed fur tips instead of adding noise or drawing replacement fur.
Dependencies: pillow, numpy, opencv-python, pymatting.
"""
from pathlib import Path
import json
import runpy
import numpy as np
import cv2
from PIL import Image, ImageDraw
from pymatting import estimate_alpha_cf

ROOT=Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT/'scripts/refine-cat-manual.py'),run_name='__main__')
metadata=json.loads((ROOT/'docs/cat-source-region.json').read_text(encoding='utf-8'))
source=Image.open(ROOT/'docs/reference.jpg').convert('RGB')
base=Image.new('L',source.size)
base.paste(Image.open(ROOT/'src/renderer/assets/cat.png').getchannel('A'),tuple(metadata['crop'][:2]))
alpha=np.array(base,dtype=np.float64)/255
before=alpha.copy()
box=(390,120,1200,540)
x0,y0,x1,y1=box
local=alpha[y0:y1,x0:x1]
solid=(local>.5).astype(np.uint8)
inward=cv2.distanceTransform(solid,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
outward=cv2.distanceTransform(1-solid,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
y,x=np.ogrid[y0:y1,x0:x1]
band=np.full(solid.shape,6.)
# These bands were chosen by inspecting the original crown and inner-ear crops.
# The broad crown band reaches the original 10–30px fine strands above the old cut.
band[(x>=600)&(x<=990)&(y>=250)&(y<=355)]=34
trimap=np.full(solid.shape,.5)
trimap[outward>=band]=0
trimap[inward>=5]=1
Image.fromarray(np.uint8(trimap*255)).save(ROOT/'docs/edge-review/head-fur-trimap.png')
print('Matting original crown and ear-edge pixels...',flush=True)
matte=estimate_alpha_cf(np.array(source.crop(box),dtype=np.float64)/255,trimap)
rgb=np.array(source.crop(box),dtype=np.float64)
# The cage behind the crown is pink/beige. Remove that contamination in the
# uncertain crown band while keeping the photographed cool-grey hair strands.
crown=(x>=600)&(x<=990)&(y>=250)&(y<=355)&(trimap!=1)
cool_hair=np.clip((rgb[:,:,2]-rgb[:,:,0]+15)/17,0,1)
matte[crown]*=cool_hair[crown]
# Far above the solid crown, retain strand contrast rather than a low-frequency
# veil from the old cage. Dense fur close to its roots is left untouched.
gray=cv2.cvtColor(np.uint8(rgb),cv2.COLOR_RGB2GRAY).astype(np.float64)
strand=np.clip((cv2.GaussianBlur(gray,(0,0),1.7)-gray-.3)/4,0,1)
far=crown&(outward>6)
matte[far]*=strand[far]
# Join to the existing lower-cheek contour without a seam. Never alter the RGB.
blend=np.clip((y1-1-y)/24,0,1)
alpha[y0:y1,x0:x1]=local*(1-blend)+matte*blend
# Restore fine short hairs on the cheeks too, rather than leaving a vector edge.
for region in [(430,450,555,850),(1120,455,1225,820)]:
    lx,ty,rx,by=region
    original=before[ty:by,lx:rx]
    binary=(original>.5).astype(np.uint8)
    inner=cv2.distanceTransform(binary,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    outer=cv2.distanceTransform(1-binary,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    guide=np.full(binary.shape,.5);guide[outer>=5]=0;guide[inner>=4]=1
    detail=estimate_alpha_cf(np.array(source.crop(region),dtype=np.float64)/255,guide)
    yy,xx=np.ogrid[ty:by,lx:rx]
    weight=np.minimum(np.minimum((yy-ty)/16,(by-1-yy)/16),np.minimum((xx-lx)/8,(rx-1-xx)/8))
    weight=np.clip(weight,0,1)
    alpha[ty:by,lx:rx]=alpha[ty:by,lx:rx]*(1-weight)+detail*weight
alpha[alpha<3/255]=0
alpha[alpha>252/255]=1
_,components=cv2.connectedComponents((alpha>8/255).astype(np.uint8),connectivity=8)
body=(components==components[600,780]).astype(np.uint8)
joined=cv2.dilate(body,np.ones((3,3),np.uint8))
alpha[joined==0]=0
mask=Image.fromarray(np.uint8(np.clip(alpha,0,1)*255))
crop=mask.getbbox()
rgba=source.convert('RGBA');rgba.putalpha(mask)
result=rgba.crop(crop)
assert np.array_equal(np.array(result)[:,:,:3],np.array(source.crop(crop)))
assert np.array(mask)[400:800,530:1080].min()==255
result.save(ROOT/'src/renderer/assets/cat.png')
metadata.update(crop=crop,alpha='manual regional contour plus original-image head fur alpha matting within manually selected bands; face RGB and opaque interior unchanged',head_fur_roi=box)
(ROOT/'docs/cat-source-region.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')

review=ROOT/'docs/edge-review'
for name,color in [('light','#eeeee5'),('dark','#202626')]:
    images=[]
    for index,a in enumerate([before,alpha]):
        layer=source.convert('RGBA');layer.putalpha(Image.fromarray(np.uint8(a*255)))
        bg=Image.new('RGBA',source.size,color);bg.alpha_composite(layer)
        images.append(bg.convert('RGB').crop((400,140,1165,390)))
        if index==1:bg.convert('RGB').save(review/f'fur-{name}.jpg',quality=95)
    sheet=Image.new('RGB',(765,540),color)
    sheet.paste(images[0],(0,20));sheet.paste(images[1],(0,290))
    draw=ImageDraw.Draw(sheet);draw.text((8,4),'1.0.3 - smooth contour',fill='#999999');draw.text((8,274),'1.0.4 - original fur recovered',fill='#999999')
    sheet.save(review/f'head-fur-comparison-{name}.png')
print('Saved original fur alpha; original RGB and opaque face verified',flush=True)
