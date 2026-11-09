"""Place generated fur-edge brush stamps under the original photograph.

The user authorized adding a fur effect after the original-pixel silhouette was
too hard. Only the outer fringe gains new color pixels; the opaque photograph,
especially its face, is composited on top and remains exact.
"""
from pathlib import Path
import json, math, runpy
import numpy as np
import cv2
from PIL import Image, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT/'scripts/refine-head-fur.py'),run_name='__main__')
meta=json.loads((ROOT/'docs/cat-source-region.json').read_text(encoding='utf-8'))
original=Image.open(ROOT/'docs/reference.jpg').convert('RGB')
base=original.convert('RGBA');base.putalpha(Image.new('L',original.size))
old=Image.open(ROOT/'src/renderer/assets/cat.png').convert('RGBA')
base.paste(old,tuple(meta['crop'][:2]))
before=base.copy()
base_array=np.array(base)
edge_field=cv2.GaussianBlur(base_array[:,:,3].astype(float),(0,0),2)
spec=json.loads((ROOT/'scripts/cat-outline.json').read_text(encoding='utf-8'))
brush=Image.open(ROOT/'src/renderer/assets/fur-fringe.png').convert('RGBA')
S=3
fringe=Image.new('RGBA',(original.width*S,original.height*S))
rng=np.random.default_rng(46)
stamps=0
for name,anchors in spec['sections'].items():
    if name=='bottom_visible_fur':continue
    anchors=np.array(anchors,dtype=float)
    for j in range(len(anchors)-1):
        a,b=anchors[j:j+2]
        tangent=b-a;length=np.linalg.norm(tangent)
        if length<1:continue
        n=np.array([tangent[1],-tangent[0]])/length
        for t in np.linspace(0,1,max(1,int(length/16)),endpoint=False):
            p=a+(b-a)*t
            # Align to the recovered fur roots, not the old smooth vector cut.
            roots=[]
            for offset in np.linspace(-12,36,49):
                probe=np.round(p+n*offset).astype(int)
                if 0<=probe[0]<original.width and 0<=probe[1]<original.height and edge_field[probe[1],probe[0]]>140:roots.append(offset)
            if roots:p=p+n*max(roots)
            if name=='forehead':h=float(rng.uniform(24,32))
            elif 'ear' in name:h=float(rng.uniform(14,20))
            elif 'cheek' in name or name=='right_neck':h=float(rng.uniform(20,27))
            else:h=float(rng.uniform(10,16))
            w=float(rng.uniform(35,51))
            # Sample the original coat well inside the manual contour.
            q=np.round(p-n*13).astype(int)
            q[0]=np.clip(q[0],3,original.width-4);q[1]=np.clip(q[1],3,original.height-4)
            color=np.median(base_array[q[1]-2:q[1]+3,q[0]-2:q[0]+3,:3].reshape(-1,3),axis=0)
            phase=int(rng.integers(200,brush.width-500))
            stamp=brush.crop((phase,430,phase+330,640)).resize((round(w*S),round(h*S)),Image.Resampling.LANCZOS)
            data=np.array(stamp,dtype=float)
            luminance=data[:,:,:3].mean(axis=2)
            texture=np.clip((luminance/185)**.7,.5,1.15)
            data[:,:,:3]=np.clip(color[None,None,:]*texture[:,:,None],0,255)
            data[:,:,3]=np.clip((data[:,:,3]-6)/247,0,1)**.65*255
            edge=np.sin(np.linspace(0,np.pi,stamp.width))**.8
            data[:,:,3]*=edge[None,:]*float(rng.uniform(.62,.82))
            stamp=Image.fromarray(np.uint8(data)).rotate(math.degrees(math.atan2(-n[0],-n[1])),Image.Resampling.BICUBIC,expand=True)
            # The lower dense base tucks under the photographed body.
            center=(p-n*1.5)*S
            fringe.alpha_composite(stamp,(round(center[0]-stamp.width/2),round(center[1]-stamp.height/2)))
            stamps+=1
fringe=fringe.resize(original.size,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.22))
# Soften only subpixel hard steps. The added fringe fills this tiny inward blend;
# the facial interior and the overall hand-traced silhouette are not blurred.
edge_alpha=np.minimum(base_array[:,:,3],np.array(base.getchannel('A').filter(ImageFilter.GaussianBlur(.4))))
base.putalpha(Image.fromarray(edge_alpha))
result=Image.alpha_composite(fringe,base)
data=np.array(result)
# Alpha composition already preserves opaque pixels; explicitly lock the whole
# inner silhouette, retaining the original face RGB and alpha byte for byte.
inner=cv2.distanceTransform((base_array[:,:,3]>220).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)>6
data[inner]=base_array[inner]
assert np.array_equal(data[400:800,530:1080],base_array[400:800,530:1080])
result=Image.fromarray(data)
crop=result.getchannel('A').getbbox()
result.crop(crop).save(ROOT/'src/renderer/assets/cat.png')
meta.update(crop=crop,rgb_identical_to_source_region=False,face_rgb_identical_to_source=True,alpha='original head fur alpha plus generated fine fur brush stamps under original opaque subject',fur_brush='src/renderer/assets/fur-fringe.png',fur_stamps=stamps)
(ROOT/'docs/cat-source-region.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
for name,color in [('light','#eeeee5'),('dark','#202626')]:
    bg=Image.new('RGBA',original.size,color);bg.alpha_composite(result)
    bg.convert('RGB').save(ROOT/f'docs/edge-review/fringe-{name}.jpg',quality=95)
    bg.crop((390,140,1200,440)).save(ROOT/f'docs/edge-review/fringe-head-{name}.png')
    old_bg=Image.new('RGBA',original.size,color);old_bg.alpha_composite(before)
    compare=Image.new('RGB',(810,600),color)
    compare.paste(old_bg.crop((390,140,1200,440)).convert('RGB'),(0,0))
    compare.paste(bg.crop((390,140,1200,440)).convert('RGB'),(0,300))
    compare.save(ROOT/f'docs/edge-review/edge-fur-effect-comparison-{name}.png')
print(f'Added {stamps} fine fur brush stamps; original opaque face unchanged',flush=True)
