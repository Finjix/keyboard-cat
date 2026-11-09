"""Extract both forepaws from the user's new photograph.

Hand-selected masks, fine alpha matting, small reflected repair at the clipped
lower paw's photo edge, then rotation into the app's downward resting pose.
"""
from pathlib import Path
import json, math
import numpy as np
import cv2
from PIL import Image, ImageDraw
from pymatting import estimate_alpha_cf

ROOT=Path(__file__).resolve().parents[1]
source=Image.open(ROOT/'docs/paw-reference.jpg').convert('RGB')
pad=40
photo=Image.fromarray(np.pad(np.array(source),((pad,pad),(pad,pad),(0,0)),mode='reflect'))
specs=[
    ('left',[(201,143),(233,152),(272,169),(315,184),(360,198),(391,209),(379,235),(360,266),(338,296),(314,329),(283,360),(249,388),(215,405),(185,404),(155,390),(130,369),(114,345),(108,319),(113,292),(125,265),(144,237),(163,210),(180,181)],(280,185),(198,365)),
    ('right',[(222,556),(275,551),(327,560),(371,577),(379,597),(355,626),(328,659),(302,694),(277,732),(252,772),(226,811),(203,847),(176,878),(145,903),(112,924),(78,935),(43,931),(12,917),(-12,899),(-18,876),(-13,852),(9,820),(35,788),(61,753),(88,717),(116,680),(145,642),(177,605),(202,577)],(290,590),(82,865))
]
record=[]
for name,anchors,root,tip in specs:
    points=np.array(anchors,dtype=float)+pad
    line=[]
    for i in range(len(points)):
        p0,p1,p2,p3=(points[(i+j)%len(points)] for j in [-1,0,1,2])
        m1,m2=.36*(p2-p0),.36*(p3-p1)
        for t in np.linspace(0,1,max(8,int(np.linalg.norm(p2-p1))),endpoint=False):
            line.append((2*t**3-3*t**2+1)*p1+(t**3-2*t**2+t)*m1+(-2*t**3+3*t**2)*p2+(t**3-t**2)*m2)
    line=np.array(line)
    mask=Image.new('L',(photo.width*4,photo.height*4));ImageDraw.Draw(mask).polygon([tuple(p*4) for p in line],fill=255)
    mask=mask.resize(photo.size,Image.Resampling.LANCZOS)
    bounds=(math.floor(line[:,0].min()-10),math.floor(line[:,1].min()-10),math.ceil(line[:,0].max()+10),math.ceil(line[:,1].max()+10))
    region=photo.crop(bounds);binary=(np.array(mask.crop(bounds))>128).astype(np.uint8)
    inside=cv2.distanceTransform(binary,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    outside=cv2.distanceTransform(1-binary,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    guide=np.full(binary.shape,.5);guide[inside>4]=1;guide[outside>4]=0
    rgb=np.array(region,dtype=float)
    # Prevent the human hand and colored floor from leaking into the fur edge.
    guide[(rgb[:,:,0]-rgb[:,:,2]>18)|(np.max(rgb,axis=2)-np.min(rgb,axis=2)>40)]=0
    alpha=estimate_alpha_cf(rgb/255,guide)
    alpha[alpha<.025]=0;alpha[alpha>.98]=1
    patch=region.convert('RGBA');patch.putalpha(Image.fromarray(np.uint8(alpha*255)))
    # Normalize the photographed diagonal forearm to point down. No new paw is generated.
    vector=np.array(tip)-np.array(root)
    angle=math.degrees(math.atan2(vector[1],vector[0]))-90
    patch=patch.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    patch=patch.crop(patch.getchannel('A').getbbox())
    if name=='right':
        patch=patch.crop((0,max(0,patch.height-240),patch.width,patch.height))
    # Replace the photographed/rotated straight attachment cut with a rounded
    # shoulder cap and a smooth alpha ramp. Fur RGB and the toe area stay intact.
    yy,xx=np.ogrid[:patch.height,:patch.width]
    across=(xx-(patch.width-1)/2)/(patch.width/2)
    cap_top=(28 if name=='left' else 18)+(38 if name=='left' else 32)*np.abs(across)**2
    root=np.clip((yy-cap_top)/22,0,1)
    root=root*root*(3-2*root)
    alpha=np.array(patch.getchannel('A'),dtype=float)*root
    patch.putalpha(Image.fromarray(np.uint8(alpha)))
    # Leave a little breathing room for fur tips and soften only the attachment.
    canvas=Image.new('RGBA',(patch.width+20,patch.height+16));canvas.alpha_composite(patch,(10,8))
    canvas.save(ROOT/f'src/renderer/assets/paw-{name}.png')
    for label,color in [('light','#eeeee5'),('dark','#202626')]:
        bg=Image.new('RGBA',canvas.size,color);bg.alpha_composite(canvas);bg.convert('RGB').save(ROOT/f'docs/paw-review/{name}-{label}.jpg',quality=95)
    review=source.copy();d=ImageDraw.Draw(review);d.line([tuple(p-pad) for p in line]+[tuple(line[0]-pad)],fill='#00ddcc',width=2)
    review.save(ROOT/f'docs/paw-review/{name}-outline.jpg',quality=95)
    record.append({'asset':f'paw-{name}.png','source':'docs/paw-reference.jpg','anchors':anchors,'rotation_degrees':angle,'size':canvas.size,'distal_crop_height':240 if name=='right' else None,'rounded_root':True,'root_feather_px':22,'repair':'up to 18px reflected fur at cropped photo edge' if name=='right' else 'none'})
    print(name,canvas.size,'rotation',round(angle,2),flush=True)
(ROOT/'docs/paw-source-regions.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
