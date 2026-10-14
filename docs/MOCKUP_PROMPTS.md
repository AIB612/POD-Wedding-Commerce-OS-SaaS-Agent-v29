# Mockup image prompts (AI / photography brief)

Use this brief to create realistic, **white-label** product images (no print, no logo, no text) for every POD Studio
product, then import them with `scripts/import_mockup.py`. The studio keeps working with the built-in renders until
an image is replaced.

## Shared style (append to every prompt)
> Professional e-commerce product photo, single **blank** product, **no print, no logo, no text, no brand marks**,
> front view, centred, product fills about 60–70 % of the frame, square 1:1, 2000 × 2000 px.
> Seamless studio backdrop: soft vertical gradient from **#F4EFE9** (top) to **#E5DDD3** (bottom), very subtle
> vignette, no props, no people, no hands. Soft diffused key light from the upper left, gentle contact shadow under
> the product. Neutral white balance, true-to-life material texture, sharp focus, no reflections of studio gear.

Negative prompt: text, letters, logo, watermark, pattern, print, graphic, label text, brand, props, hands, model,
busy background, coloured background, harsh shadow, tilted view.

## Per product
| id | product | prompt (subject) |
|---|---|---|
| `tee` | 有机棉 T 恤 / Organic cotton tee | organic cotton tee, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 300×400 mm completely blank |
| `hoodie` | 连帽卫衣 / Hoodie | hoodie, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 280×320 mm completely blank |
| `polo_emb` | 刺绣 Polo 衫 / Embroidered polo | embroidered polo, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 90×90 mm completely blank |
| `cap_emb` | 刺绣鸭舌帽 / Embroidered cap | embroidered cap, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 110×55 mm completely blank |
| `fleece` | 抓绒外套 / Fleece jacket | fleece jacket, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 90×90 mm completely blank |
| `windbreaker` | 防风夹克 / Windbreaker | windbreaker, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 250×300 mm completely blank |
| `leggings` | 弹力瑜伽裤 / Yoga leggings | yoga leggings, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 600×1000 mm completely blank |
| `apron` | 帆布围裙 / Canvas apron | canvas apron, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 220×250 mm completely blank |
| `baby_body` | 婴儿纯棉连体衣 / Baby bodysuit | baby bodysuit, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 140×140 mm completely blank |
| `xmas_sweater` | 节日针织毛衣 / Holiday sweater | holiday sweater, plain white, garment laid flat / on an invisible ghost mannequin, neatly pressed, natural soft folds; printable area 500×600 mm completely blank |
| `pet_bandana` | 宠物三角巾 / Pet bandana | pet bandana, plain white, facing the camera, centred; printable area 300×300 mm completely blank |
| `pet_bed` | 宠物床 / Pet bed | pet bed, plain white, facing the camera, centred; printable area 600×450 mm completely blank |
| `pet_bowl` | 宠物陶瓷碗 / Ceramic pet bowl | ceramic pet bowl, plain white, facing the camera, centred; printable area 200×60 mm completely blank |
| `mug` | 陶瓷马克杯 / Ceramic mug | ceramic mug, plain white, standing upright, handle (if any) to the right; printable area 200×85 mm completely blank |
| `magic_mug` | 变色魔术杯 / Colour-changing mug | colour-changing mug, plain white, standing upright, handle (if any) to the right; printable area 200×85 mm completely blank |
| `espresso` | 意式浓缩杯 / Espresso cup | espresso cup, plain white, standing upright, handle (if any) to the right; printable area 120×50 mm completely blank |
| `enamel_mug` | 搪瓷露营杯 / Enamel camp mug | enamel camp mug, plain white, standing upright, handle (if any) to the right; printable area 180×70 mm completely blank |
| `tumbler` | 不锈钢随行杯 / Steel tumbler | steel tumbler, plain white, standing upright, handle (if any) to the right; printable area 230×100 mm completely blank |
| `bottle` | 铝制运动水壶 / Aluminium sports bottle | aluminium sports bottle, plain white, standing upright, handle (if any) to the right; printable area 200×90 mm completely blank |
| `thermos` | 真空保温杯 / Vacuum flask | vacuum flask, plain white, standing upright, handle (if any) to the right; printable area 180×80 mm completely blank |
| `poster` | 哑光海报 / Matte poster | matte poster, plain white, hanging flat, facing the camera, nothing in the frame; printable area 300×400 mm completely blank |
| `canvas` | 纹理帆布画 / Textured canvas | textured canvas, plain white, hanging flat, facing the camera, nothing in the frame; printable area 300×400 mm completely blank |
| `framed` | 木框画 / Framed print | framed print, plain white, hanging flat, facing the camera, nothing in the frame; printable area 300×400 mm completely blank |
| `metal` | 高光金属印画 / Metal print | metal print, plain white, hanging flat, facing the camera, nothing in the frame; printable area 300×400 mm completely blank |
| `acrylic_wall` | 亚克力墙画 / Acrylic wall print | acrylic wall print, plain white, hanging flat, facing the camera, nothing in the frame; printable area 300×400 mm completely blank |
| `tapestry` | 墙壁挂毯 / Wall tapestry | wall tapestry, plain white, placed upright facing the camera; printable area 1500×1300 mm completely blank |
| `puzzle` | 艺术拼图 / Art puzzle | art puzzle, plain white, placed upright facing the camera; printable area 500×380 mm completely blank |
| `rug` | 艺术地毯 / Art rug | art rug, plain white, placed upright facing the camera; printable area 1200×800 mm completely blank |
| `pillow` | 定制抱枕 / Throw pillow | throw pillow, plain white, placed upright facing the camera; printable area 450×450 mm completely blank |
| `candle` | 玻璃罐香薰蜡烛 / Jar candle | jar candle, plain white, placed upright facing the camera; printable area 200×70 mm completely blank |
| `ornament` | 陶瓷圣诞挂件 / Ceramic ornament | ceramic ornament, plain white, facing the camera, centred; printable area 75×75 mm completely blank |
| `stocking` | 节日长袜 / Holiday stocking | holiday stocking, plain white, facing the camera, centred; printable area 200×250 mm completely blank |
| `wrap_paper` | 定制包装纸 / Gift wrap | gift wrap, plain white, facing the camera, centred; printable area 700×500 mm completely blank |
| `banner` | 派对横幅 / Party banner | party banner, plain white, facing the camera, centred; printable area 1500×500 mm completely blank |
| `tattoo` | 临时纹身贴 / Temporary tattoos | temporary tattoos, plain white, facing the camera, centred; printable area 50×50 mm completely blank |
| `greeting` | 折叠贺卡 / Folded greeting card | folded greeting card, plain white, lying flat, facing the camera, crisp paper edges; printable area 148×105 mm completely blank |
| `postcard` | 厚纸明信片 / Postcard | postcard, plain white, lying flat, facing the camera, crisp paper edges; printable area 148×105 mm completely blank |
| `notebook` | 螺旋笔记本 / Spiral notebook | spiral notebook, plain white, lying flat, facing the camera, crisp paper edges; printable area 148×210 mm completely blank |
| `invitation` | 棉纹艺术纸邀请卡 / Cotton paper invitation | cotton paper invitation, plain white, lying flat, facing the camera, crisp paper edges; printable area 148×210 mm completely blank |
| `menu_card` | 婚宴菜单卡 / Menu card | menu card, plain white, lying flat, facing the camera, crisp paper edges; printable area 105×210 mm completely blank |
| `sticker` | 模切贴纸 / Die-cut sticker | die-cut sticker, plain white, facing the camera, centred; printable area 80×80 mm completely blank |
| `phone_case` | 手机壳 / Phone case | phone case, plain white, facing the camera, centred; printable area 75×150 mm completely blank |
| `mousepad_xl` | 超大游戏桌面垫 / XL desk mat | xl desk mat, plain white, facing the camera, centred; printable area 900×400 mm completely blank |
| `tote` | 环保帆布袋 / Canvas tote | canvas tote, plain white, facing the camera, centred; printable area 280×320 mm completely blank |
| `lanyard` | 展会挂绳 / Lanyard | lanyard, plain white, facing the camera, centred; printable area 20×900 mm completely blank |
| `laptop_sleeve` | 电脑内胆包 / Laptop sleeve | laptop sleeve, plain white, facing the camera, centred; printable area 340×240 mm completely blank |
| `backpack` | 商务双肩包 / Business backpack | business backpack, plain white, facing the camera, centred; printable area 200×240 mm completely blank |
| `trophy` | 亚克力纪念奖杯 / Acrylic trophy | acrylic trophy, plain white, facing the camera, centred; printable area 120×160 mm completely blank |
| `acrylic_stand` | 亚克力人物立牌 / Acrylic standee | acrylic standee, plain white, facing the camera, centred; printable area 100×150 mm completely blank |
| `welcome_sign` | 亚克力迎宾牌 / Acrylic welcome sign | acrylic welcome sign, plain white, lying flat, facing the camera, crisp paper edges; printable area 400×600 mm completely blank |
| `photo_frame` | 亚克力相框 / Acrylic photo block | acrylic photo block, plain white, facing the camera, centred; printable area 130×180 mm completely blank |
| `engraved_jewelry` | 激光雕刻首饰 / Engraved pendant | engraved pendant, plain white, facing the camera, centred; printable area 25×25 mm completely blank |
| `luggage_tag` | 皮革行李牌 / Leather luggage tag | leather luggage tag, plain white, facing the camera, centred; printable area 60×90 mm completely blank |
| `gift_box` | 定制礼盒 / Custom gift box | custom gift box, plain white, facing the camera, centred; printable area 200×200 mm completely blank |
| `popsocket` | 气囊手机支架 / Phone grip | phone grip, plain white, facing the camera, centred; printable area 38×38 mm completely blank |
| `neck_gaiter` | 多功能防寒颈套 / Neck gaiter | neck gaiter, plain white, facing the camera, centred; printable area 250×500 mm completely blank |
| `ski_case` | 滑雪镜保护套 / Goggle case | goggle case, plain white, facing the camera, centred; printable area 200×110 mm completely blank |

## Import
```bash
python3 scripts/import_mockup.py tee ~/Downloads/tee.png          # keeps the print area from studio-catalog.json
python3 scripts/import_mockup.py tote ~/Downloads/tote.png --area=32,40,36,42   # or set it (percent x,y,w,h)
npm run build:studio-data
```
The importer crops to a square, separates the product from the backdrop (so keep the backdrop plain), creates the
alpha mask and the shade map, and refreshes `studio-mockup-assets.js` for offline use. Check the result in the
Design tab with the print-area outline; adjust `--area` if needed.

## Rights
Only import images you created (own photography, your own AI generations) or are licensed to use. Do not import or
"re-generate" product images taken from other platforms (e.g. Printful, Printify) — derived copies are still theirs.
