# 当前键盘：重新生成三维透视素材

`src/renderer/assets/keyboard.png` 已用内置 imagegen 重新生成（2172×724，透明背景），以旧图作为颜色和布局参考，重新绘制键帽正面、键间凹槽和底壳厚度；空格键无爪印。随后使用内置 imagegen 清理外轮廓背景。渲染直接按图片原始宽高比显示，已移除 CSS perspective/rotateX 和模拟底壳。`keyboard-art.ts` 按新图片重新测量键帽顶面供高亮和猫爪落点使用。

生成提示词：

> Use case: stylized-concept. Generate a NEW genuinely three-dimensional full-size 104-key keyboard sprite, using the attached keyboard ONLY as a palette, material and key-layout reference. Re-render the entire keyboard from a camera centered in front and ABOVE it, looking down at about 50 degrees elevation. The long front edge is horizontal, the back edge is narrower, left and right edges converge symmetrically; no yaw or diagonal rotation. Clearly visible sculpted tall individual keycaps with FRONT VERTICAL FACES and thickness, recessed key wells, ambient occlusion, a substantial rounded sage-green case with a visible front vertical wall. This must be a real 3D-render-style object with correct new surfaces and lighting, NOT a flat top-down image skewed into a trapezoid. Warm ivory alphanumeric keys, sage green modifiers and case, buttery yellow Esc and main Enter and numpad Enter. Same standard US ANSI 104-key arrangement as reference: F row, main typing block, navigation cluster with inverted T arrows, full numpad with double-height plus and enter. Clear accurate dark key legends. Completely BLANK cream spacebar. NO paw prints, logos, animals or decorations. Cozy polished soft matte plastic / clay 3D render, soft upper-left studio lighting, natural shadows between keys. Isolated actual transparent background, no floor, no scene, no text outside keys. Wide 3:1 transparent canvas, keyboard fills width with a small safe margin; full case visible, no cropping. Centered symmetric front-above view suitable for a cat sitting behind and typing.

清理提示词：

> Precise background cleanup of this keyboard render. Preserve the entire 3D keyboard, perspective, thick front faces of all keycaps, case, legends, geometry, colors and size EXACTLY. Remove ALL scattered white, yellow, green, grey speckles and ragged halo artifacts OUTSIDE the outer keyboard silhouette. Outside the continuous smooth rounded outer case outline must be completely empty transparent alpha. Clean antialiased outer edge. No floor, glow, haze, shadow cloud, checkerboard or extra pixels outside keyboard. Keep full keyboard within canvas with a small clear transparent margin. Do not change camera, layout or key positions. Return the clean transparent keyboard sprite.

以下为已替换的历史方案。

# 键盘去爪印与透视

`src/renderer/assets/keyboard.png` 使用内置 imagegen 局部编辑，去掉空格键爪印，保留透明背景与原尺寸 2172×724。运行时用 1100px 透视距离、35° X 轴倾角呈现前宽后窄的键盘，并增加底壳厚度与阴影。`src/shared/keyboard-view.ts` 统一键盘相机与猫爪落点投影；按键高亮随整个键盘平面变换。

原始编辑提示词（内置工具，未使用 CLI）：

> Edit target: provided full-size keyboard PNG asset. Precise object edit: remove only the green paw-print icon from the center of the cream spacebar. Fill the removed print seamlessly with the same smooth cream keycap surface and subtle shading, leaving the spacebar completely blank. Preserve EXACT keyboard geometry, straight top-down camera, key positions, layout, ALL legends, colors, outer margins and aspect ratio of the original image. Preserve transparent background. Do not crop, rotate, redesign or add anything. This image is used with coordinate-mapped key highlights, so exact geometry matters. Return the complete keyboard with the only change being removal of the paw icon.

# 1.0.8 爪子顶部修整

`src/renderer/assets/paw-left.png` 与 `paw-right.png` 在朝向归一化后增加圆弧型根部蒙版和 22 像素的平滑 alpha 过渡。改动仅在顶部连接区域；两张图尺寸、下方 120 行起的全部 RGBA 像素均与 1.0.7 校验一致。处理已写入 `scripts/extract-photo-paws.py`，可从原照片复现。

检查图：`docs/paw-review/photo-paws-preview.png`、`rounded-paw-tops.png` 与 `rounded-paws-dark.png`。

以下为历史版本记录。

# 1.0.7 照片前爪

当前手部已由此前 imagegen 前臂替换为真实照片抠图：

- `src/renderer/assets/paw-left.png`：新照片上方完整前爪，手描、局部 alpha matting 后旋转 24.49 度，246×289。
- `src/renderer/assets/paw-right.png`：新照片下方前爪，旋转 37.1 度并裁短前臂，200×256。照片左侧裁切位置仅用相邻毛纹反射修补，最大延伸 18 像素。
- 来源 `docs/paw-reference.jpg`，制作脚本 `scripts/extract-photo-paws.py`，记录 `docs/paw-source-regions.json`，深浅背景与描线检查图 `docs/paw-review`。

两张素材均来自用户照片，没有用生成模型替换爪子。渲染保持原有毛纹形状、原比例适配，连接处渐隐，左爪仅做轻微曝光/饱和度匹配。当前两爪按脚掌下端作为动画锚点。

以下为历史版本记录。

# 1.0.6 当前素材修订

- `src/renderer/assets/mouse.png`：内置 imagegen 局部编辑，删除掌托爪印，按钮/滚轮/材质/透视保留。
- `src/renderer/assets/fur-fringe.png`：内置 imagegen 以原猫照片为颜色参考生成的细毛笔刷，2172×724 RGBA。
- `scripts/add-fur-fringe.py`：在原图主体下方沿轮廓放置细毛笔刷，按附近原毛色匹配，并对极窄硬边做亚像素柔化；原图五官及主体内区逐字节保留。毛丝外沿有新增颜色，不能再声称整张 PNG 每一个像素都等于原照片。当前复现入口 `scripts/extract-cat.py`。

## 鼠标局部编辑原始提示词

Precise local edit: remove ONLY the small embossed green paw-print logo on the lower palm rest of this computer mouse. Fill that small area with perfectly continuous warm ivory ceramic/plastic matching the surrounding curved palm dome, same subtle texture, shading and highlights. Keep the mouse silhouette, dimensions, left and right buttons, sage green rim, scroll wheel, yellow wheel accent, perspective, lighting and transparent alpha EXACTLY unchanged. No logo, no text, no replacement decoration anywhere. This is the same mouse, just with a clean blank palm rest.

## 细毛笔刷原始提示词

Use the cat photo ONLY as a fur color and texture reference. Create a single seamless-looking horizontal EDGE FRINGE BRUSH SPRITE of this British blue shorthair cat's realistic fine short grey fur. Not a cat portrait, no face, no eyes, no body, no ears. Wide 3:1 transparent canvas. A narrow horizontal strip of densely packed soft cool grey and charcoal fur along the LOWER THIRD, fading away at its bottom and sides, with many very fine individually tapered short hairs extending UPWARD into transparent space, irregular lengths and tiny wispy clusters. Natural shorthair texture, not long wool, not grass, not spikes, not paint bristles. The upper two thirds are mostly transparent with separated fine hairs; there is no hard silhouette line or rectangular base. Realistic photo quality, soft lighting matching the cat reference. Grey fur, no colored background spill. This is a subtle fur-edge stamp for covering a cutout seam. Genuine transparent alpha background everywhere outside the fur, no fake checkerboard, no shadows, no text. Do not generate any part of a cat's face.

以下为历史版本记录。

# 1.0.5 卡通鼠标素材

工具：内置 imagegen（未使用 CLI/API fallback），以项目中的 `src/renderer/assets/keyboard.png` 为材质与风格参考，启用真正透明背景。最终素材保存在 `src/renderer/assets/mouse.png`，尺寸 1024×1536，RGBA alpha 范围 0–254。鼠标壳、按键、滚轮和爪印都来自 PNG；代码只叠加点击反馈。左右键与中键分别高亮，猫爪落点随按钮变化；移动和滚轮不会触发猫爪动作。

## 原始提示词

Use case: product-mockup / game prop sprite. The attached keyboard is a STYLE AND MATERIAL REFERENCE ONLY. Generate ONE isolated cartoon COMPUTER MOUSE which looks like the matching mouse from exactly the same premium cozy 3D clay keyboard set. No keyboard in output. A rounded chubby wireless desktop computer mouse, straight upright vertical orientation, viewed orthographically from directly above with a tiny front-facing thickness visible. Two clearly separated left and right click buttons at the TOP, one small recessed sage-green scroll wheel between them; big smooth rounded palm dome at bottom. Warm ivory ceramic/plastic shell, muted sage-green lower rim matching the reference keyboard, a very small tasteful embossed paw on the lower palm dome. Beautiful softly sculpted bevels, subtle ceramic sheen, polished animation-film quality, soft restrained ambient occlusion, warm soft studio lighting matching the keyboard. Tiny buttery-yellow accent on scroll wheel only. Keep it clean and exquisite, no face or animal ears, no cable, no mousepad, no text, no branding. The mouse fills 90% of height and 80% of width of a portrait 2:3 canvas, centered with full outline visible, actual true transparent alpha background, no checkerboard, no big cast shadow. Top button seam must be cleanly visible so left and right click feedback can be aligned. Output only the mouse sprite.

以下为此前版本记录。

# 1.0.4 当前毛发边缘

主体仍使用手工轮廓，`scripts/refine-head-fur.py` 在手选的头顶/耳缘和脸颊区域做局部 alpha matting，直接恢复原照片细毛的覆盖度；不添加随机毛刺、不重绘 RGB。仅在不确定的头顶区域抑制粉色/米色背景、保留真实细毛的局部对比，并去除不与主体相连的碎片。运行 `scripts/extract-cat.py` 会先重建手工主体，再恢复毛尖。脸部内区保持全不透明，RGB 逐像素与原照片一致。

对照：`docs/edge-review/head-fur-comparison-light.png` 和 `head-fur-comparison-dark.png`，上半为 1.0.3，下半为 1.0.4。

以下为历史记录。

# 1.0.3 当前手工蒙版

当前主体使用 `scripts/cat-outline.json` 中逐段放置、复查调整的 118 个锚点。`scripts/refine-cat-manual.py` 将手描轮廓以 4 倍采样渲染到 alpha，只在边缘使用约 1.15–2.1 像素的局部向内过渡，原图 RGB 不变。制作过程的放大描线、深色/浅色背景检查图保存在 `docs/edge-review`。`scripts/extract-cat.py` 已改为此流程的兼容入口，避免旧自动蒙版覆盖手工版本。

以下为历史版本记录。

# 1.0.2 边缘处理

当前猫主体仍为原图像素。只处理 alpha：7px 形态学清理、4px 轮廓平滑、5px 向内羽化；保留面部内区完全不透明，不模糊或重绘面部 RGB。`scripts/extract-cat.py` 可复现并逐像素断言一致。轮廓采用向内过渡，避免扩展出原照片的笼子/家具颜色；阴影改为更轻的中性色。

# 1.0.1 当前素材

- `src/renderer/assets/cat.png`：按用户最新要求直接从 `docs/reference.jpg` 抠图，**没有生成或重绘猫主体**。`scripts/extract-cat.py` 只计算 alpha，RGB 来自原图，逐像素断言一致。裁切记录见 `cat-source-region.json`。原先 AI 主体已替换。
- `src/renderer/assets/keyboard.png`：内置 imagegen 生成及一次局部文字纠正，真正透明背景。最终 PNG 原尺寸 2172×724。运行时不绘制键帽或文字，透明覆盖层仅提供按键亮起效果；`keyboard-art.ts` 记录按图片测量的坐标。
- `src/renderer/assets/paw.png`：沿用原 imagegen 前臂素材，左右独立控制，图层缩短加宽至 220×160 并降低明度。猫的脸部图层不受这些变换影响。

## 键盘原始提示词

Production game asset: ONE exquisite cozy cartoon 3D full-size ANSI 104-key mechanical keyboard, isolated on genuinely transparent background. Wide landscape composition, 1536x600 canvas. Orthographic straight-on view from directly above with only a tiny front-facing thickness visible, NO yaw or trapezoid distortion: all rows horizontal, columns vertical, flat top key surfaces. Keyboard fills canvas nearly edge to edge, 2% side padding, 4% top and bottom padding. Keyboard aspect ratio about 3.4:1. Premium soft clay render, rounded chunky keycaps, lovely sculpted edges, subtle ceramic sheen, warm ivory alphanumeric keys, muted sage green case and modifiers, buttery yellow Escape and Enter keys, tiny embossed paw motif centered on the spacebar. Fine ambient occlusion between keys and restrained soft contact shadow, polished cute animation-film prop, carefully crafted not generic rectangles. EXACT traditional ANSI 104-key layout: main typing cluster on left width 15 units, separate three-column navigation and arrows cluster at x15.6, separate four-column numpad at x19.2; total width 23.2 units. Six rows: function row Esc and F1-F12 plus Print Screen Scroll Lock Pause; number row tilde 1-0 minus equals and wide backspace; QWERTY row; ASDF row with wide Enter; ZXCV row with two wide Shifts; bottom Ctrl Win Alt long spacebar Alt Win Menu Ctrl. Navigation Insert Home PageUp / Delete End PageDown, inverted-T arrows at bottom. Numpad standard four columns NumLock divide multiply minus / 789 and tall plus / 456 / 123 and tall Enter / wide zero decimal. Correct legible restrained English key legends, NO extra keys, NO decorative text or branding, NO animals hands mouse desk cable or background. Real transparent alpha, not checkerboard. Only the complete keyboard.

## 键盘局部纠正提示词

Precise localized text correction on this existing keyboard image. Change ONLY the legend on the small green key immediately to the right of Num Lock in the top row of the numeric keypad, the second key of that group of four: replace its '+' symbol with the division slash '/' symbol. This is the numpad divide key. Keep its green keycap unchanged. Preserve everything else EXACTLY: same full keyboard shape, all other 103 keys, their labels and placement, materials, lighting, paws on spacebar, crop, image dimensions, transparent alpha background. Do not redraw or restyle the keyboard. Do not change the tall plus key below, which is correct.

---

以下为 1.0.0 历史制作记录；其中 AI 猫主体不再用于当前版本。

# 素材记录

工具：内置 imagegen，未使用 CLI/API fallback。两次生成均以用户提供的 `学姐的猫.jpg`（存档 `reference.jpg`）为参考，启用真正透明背景。最终资源位于 `src/renderer/assets/cat.png` 和 `paw.png`。RGBA 通道已检查。左右前臂及猫爪共享同一张毛发素材，通过独立变换控制；按压为代码姿态，不另行重绘面部。应用图标为代码绘制，不使用猫照片重绘。

## 猫主体：原始提示词

Use case: identity-preserve / background-extraction. Create a production transparent PNG cutout for a desktop cat companion. Edit target: the provided photo of the British shorthair blue grey cat. Preserve EXACT original face, amber eye shapes and giant dark pupils, ear shape, nose, mouth, fur detail, expression and head angle. Do not beautify, stylize or replace the face. Remove entire cage, wooden furniture and foreground. Keep the cat head and chest, complete the bottom into a seated front-facing torso with short rounded shoulders, but NO visible forelegs or paws (they are separate animated assets). Photorealistic grey fur, same lighting. Cat fills most of canvas centered, ears and whiskers uncut. True transparent background, no keyboard, no mouse, no text, no shadow backdrop. Facial identity is the highest priority.

## 前臂及猫爪：原始提示词

Create ONE separate animation sprite: a photorealistic British blue shorthair cat foreleg and rounded paw, grey short dense fur matching the cat in the reference image. No face no body. Straight tapered short forearm pointing downward, ending in a broad rounded fluffy paw resting on a keyboard, but do not show keyboard or any other object. View from front and slightly above so top of paw and three subtle toe divisions visible. Single isolated forearm paw centered vertically in a tall portrait transparent canvas. Fur naturally feathered at top shoulder attachment. Same cool grey fur and soft light as reference. Real alpha transparent background. No text, no shadows outside paw.
