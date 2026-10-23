# 万象成群 · Swarms at Scale —— 交接文档

一个 16:9 视频系列，讲游戏里**群体 AI 与规模问题**的解法。每期约 3 分钟，配音用本地曼波（MamboTTS / `mambo-mac`），中英双语字幕。画面全部在浏览器里用 three.js（WebGL2）和 Canvas 实时生成，再逐帧离线渲染成 MP4。可以插入公开素材和 GDC 演讲片段。每期的**首尾形成环**：最后一帧能接回第一帧。

## 系列规划

| 期 | 主题 | 状态 |
| --- | --- | --- |
| EP01 | 鸟群算法 Boids：三条规则 → 转向行为 → 空间网格 → 拓扑邻居 → GPU 六万只 | ✅ 完成 |
| EP02 | 《ABZÛ》：上万条、数百种鱼的生动动画 | ✅ 完成 |
| EP03 | ECS：从《守望先锋》到《僵尸世界大战》的海量敌人 | ✅ 完成 |
| EP04 | 《戴森球计划》：无数太阳能板朝向太阳 | ✅ 完成 |
| EP05 | 综合前几期：御剑术，上万把剑的剑阵（Blender 建模的白衣剑修） | ✅ 完成 |

## 目录

```
swarm-at-scale-video/
├── HANDOFF.md              本文档
├── SOURCES.md              事实来源与素材授权说明（每期都要更新）
├── core/
│   ├── film.js             共享运行时：时间轴查询、字幕切分、代码面板、标签/卡片/擦除转场、素材帧、预览播放器
│   └── film.css            共享 1920×1080 版式（参考 webgl-seascape-video）
├── lib/                    three.js r160 + postprocessing（本地，无 CDN）
├── tools/
│   ├── make.sh             一键出片：配音 → 事件 → 混音 → 渲染 → SRT → 合成
│   ├── build_voice.py      逐行调用 mambo-mac，生成 voice.wav / clipaudio.wav / timeline.js
│   ├── build_audio.py      程序化音乐 + 环境声 + 转场音效 + 闪避（ducking）+ 片段原声
│   ├── render.mjs          无头 Chrome（Metal）逐帧截图 → ffmpeg；也能导出静帧、SRT、事件表
│   ├── cdp.mjs / serve.mjs Chrome DevTools 协议封装 / 本地静态服务器
│   ├── sheet.sh            渲染若干时间点并拼成 3×3 审片图
│   ├── probe.mjs           在页面里执行表达式（调试模拟状态用）
│   ├── extract_media.sh    把素材切成 30fps JPEG 序列（便于逐帧精确取帧）
│   └── bili.py             B 站公开视频下载（免登录，最高 480p）
├── sources/raw/            下载的原始素材 + 每个素材的 .json 出处
├── ep01-boids/
│   ├── script.json         分镜 + 中英台词（`|` 是字幕手动断行点）
│   ├── voice.json          配音参数：语速、停顿、场景延长、读音替换表
│   ├── timeline.js         build_voice.py 生成，不要手改
│   ├── story.js            本期全部镜头：frame(t) → 画面 + 叠加层
│   ├── film.html           渲染页面（加 `?render=1` 是出片模式，不加就是带播放条的预览）
│   ├── draw2d.js           2D 示意图的绘制函数
│   ├── sims/boids2d.js     CPU boids（代码面板直接引用其中的 //#region）
│   ├── sims/gpuflock.js    GPU boids：浮点纹理 + 网格累加场 + 实例化鸟/鱼渲染
│   ├── media/              切好的素材帧序列
│   └── audio.m4a           预览用音频
├── build/<ep>/             中间产物（TTS 缓存、静帧、无声视频、混音）
└── out/                    成片 MP4 + SRT
```

## 出片流程

```bash
cd swarm-at-scale-video
tools/make.sh ep01-boids "01_鸟群算法_三条规则到六万只鸟"
```

各步骤可以单独跑：

```bash
python3 tools/build_voice.py ep01-boids            # 改了台词或停顿后运行（TTS 有缓存，只重合成改动的行）
python3 tools/build_voice.py ep01-boids --force    # 全部重新合成
node tools/render.mjs ep01-boids --stills 0,45.5   # 渲染静帧到 build/ep01-boids/stills/
tools/sheet.sh ep01-boids /tmp/a.jpg 10,20,30,40,50,60,70,80,90   # 3×3 审片图
node tools/render.mjs ep01-boids --from 60 --to 90 --out /tmp/part.mp4   # 只渲染一段
```

浏览器预览：`node tools/serve.mjs . 8017`，然后打开 `http://127.0.0.1:8017/ep01-boids/film.html`。底部有播放条，空格键播放/暂停，URL 加 `#秒数` 可以直接跳到某一时刻。

**耗时参考**（M 系列 Mac）：配音约 1 秒/字，一期约 15 分钟（有缓存时是秒级）；渲染 3 个并行页面，约 3 分钟成片需要 10–15 分钟。

## 关键设计（新一期请沿用）

1. **画面是 t 的纯函数。** `story.frame(t)` 不依赖播放历史。模拟用固定种子和固定 60 Hz 步长，`advanceTo(step)` 往前倒退时会自动重置再重新模拟。所以静帧可以任意顺序渲染，3 个并行页面的结果也一致。新模拟一律遵守这条：不要用 `Math.random()` 或 `performance.now()`。
2. **时间都从配音推出来。** `timeline.js` 记录每一行台词的真实起止时间（逐行合成，没有估算）。镜头用 `S(id)`、`E(id)`、`L(id, k)`（第 k 行开始）、`CK(id, k, j)`（第 k 行第 j 个字幕块）来定位。台词一改，画面会自动重新对齐。
3. **代码面板引用真实代码。** 屏幕上的代码片段直接取自模拟源文件中的 `//#region 名称 … //#endregion`，所以显示的就是正在运行的代码。改代码时注意别把 region 改坏，行号会跟着变。
4. **转场。** `shot(t0, draw, {wipe, labA, labB})`：新镜头从左边擦入，擦除线两侧显示“之前/之后”标签。`dissolve` 是叠化。转场时刻会写进 `events.json`，混音时据此加 whoosh 音效。
5. **环形结构。** EP01 的第 0 帧是 hero 鸟群在模拟时间 S0=45 s 时的状态，相机贴着一只鸟，高亮它的 7 个邻居。结尾镜头的模拟时间定为 `S0 - (END - t)`，所以最后一帧正好回到 S0。相机从远景飞回同一只鸟，品牌栏和进度条淡出。音乐在 `loop_fix` 里把尾部交叉淡化回开头。新一期的做法：先定好“循环帧”，让结尾的所有状态都收敛到它。
6. **素材。** 先用 `tools/extract_media.sh` 切成 JPEG 序列，再在 story 里通过 `FOOT`（全屏，可按擦除区域裁切）或 `out.frame`（带框的演讲画面）引用。每个素材都要在画面上署名（`out.credit`），并写进 `SOURCES.md`。
7. **演讲片段。** 在 `script.json` 里写成 `"clip": {src, in, out}` 的段落，台词带相对时间 `[zh, en, t0, t1]`。build_voice 会切出原声放进 `clipaudio.wav`，字幕显示成引号样式，音乐在这一段让位。

## 已知问题 / 可以改进

- **素材分辨率只有 480p。** 当前网络环境下 YouTube、Wikimedia、archive.org 都连不上（DNS 超时），只能用 B 站免登录的 480p。实拍椋鸟画面放大到 1080p 后偏软（只做了轻微的对比度和饱和度调整）。条件允许时，建议换成 GDC 官方 YouTube 频道的 1080p 版本或 GDC Vault 上的原始录像（搜索 “Creating the Art of ABZÛ”），以及 CC 授权的椋鸟 4K 素材。换素材只需要重新跑 `extract_media.sh`，帧数会自动适配（同时更新 story.js 里 `CLIPS` 的 `count`）。
- **《蝙蝠侠归来》《半条命》没有用原片。** 蝙蝠群是自己渲染的示意画面，画面上已标注“示意画面（自制渲染，非电影原片）”。半条命只放了文字卡片。如果需要原片，要自己从正版内容里剪出合理引用长度的片段。
- **GDC 片段。** 用的是《ABZÛ》美术总监 Matt Nava 在 GDC 2017 的演讲 “Creating the Art of ABZÛ”，约 11 秒，已署名，作为下一期的引子。这类剪辑在评论、教学语境下通常属于合理引用，但最终能不能发，要看发布平台的规则，请自行判断。
- **配音读音。** 英文词、年份、缩写通过 `voice.json → spoken` 替换成好读的写法（例如 Boids→博伊兹、SIGGRAPH→西格拉夫、ABZÛ→阿布祖）。听感不对时直接改这张表，然后重跑 build_voice（只有受影响的行会重新合成）。
- **mambo-mac 不会覆盖已有文件**，重名时会自动加 `_1`、`_2`。build_voice.py 已经改成先写到临时目录再移动到位，不要回退成直接 `-o` 输出。
- **背景音乐是程序合成的**（D 大调四和弦循环）。可以改用 `mambo-mac music --instrumental` 生成 YuE2 纯音乐，但权重是 CC BY-NC 4.0（禁止商用），而且生成时内存峰值超过 10 GB，不要和配音任务同时跑。

## 后续各期：内容要点与可复用部分

所有新期数都从 EP01 复制骨架：`cp -r ep01-boids ep0N-xxx`，然后删掉 media/、改 script.json、voice.json、story.js，其余（core/、tools/）不用动。

### EP02《ABZÛ》万鱼之海
- **钩子**：EP01 结尾的鱼群和 GDC 引语。开头可以回到这段引语：“一万条鱼 × 一百个关节 = 不可能”，然后给出解法。
- **技术主线**（出自 Matt Nava 的 GDC 2017 演讲，B 站 BV1Hx411V78q 有中文字幕版，原始素材在 `sources/raw/gdc_abzu_cn.mp4` 和 `gdc_abzu_raw.mp4`）：
  1. 骨骼动画撑不住数量 → 改用静态网格实例化（每个实例只有少量独有数据）。
  2. 在材质里做顶点动画：游动周期（沿身体传播的正弦波）、左右平移、转弯卷曲（turning curl）、咬合（bite）。
  3. 混合形状空间（blendshape blendspace）提供更丰富的姿态，见演讲约 7:00 起的画面。
  4. 群体行为本身仍然是 boids（可以直接复用 `sims/gpuflock.js`，把 morph 设成 1 就是鱼的形态，顶点着色器里已经有沿身体传播的波）。
  5. 数百种鱼：每个实例存“物种 id、相位、尺寸、颜色”等少量参数。
- **可复用**：gpuflock.js 的 `FISH` 形状和 `morph` 参数；水下天空（`uWater=1`）。
- **环形**：建议首尾都定在“一条鱼的特写”。

### EP03 ECS：从《守望先锋》到《僵尸世界大战》
- **资料**：Timothy Ford，“Overwatch Gameplay Architecture and Netcode”，GDC 2017（ECS、System 只处理组件、确定性）；Saber Interactive 在 GDC 讲过《僵尸世界大战》的“Swarm Engine”（成千上万的僵尸、叠人墙），可以搜 “World War Z swarm GDC”。Unity DOTS 的数据导向设计讲座也可作补充。
- **可视化建议**：同一批实体分别用“对象数组”和“组件连续数组（SoA）”两种内存布局，展示缓存行的命中/未命中；System 像流水线一样扫过连续内存；僵尸潮可以用 EP01 的空间网格加流场（flow field）实现。
- **需要新写**：内存布局动画（Canvas），以及 instanced 的僵尸剪影。

### EP04《戴森球计划》：无数太阳能板朝向太阳
- **资料**：搜 “Dyson Sphere Program GPU instancing” 和开发团队 Youthcat Studio 的技术分享（知乎、B 站都有相关文章），重点是 GPU 实例化、在顶点着色器里计算每块板朝向太阳的旋转（不在 CPU 上逐个更新 transform），以及大量建筑的 LOD 和合批。
- **可视化建议**：先在 CPU 上逐个 `lookAt` 并显示每帧耗时，再改到 GPU 顶点着色器里算朝向；一颗行星表面铺满上万块板，太阳绕行时所有板一起转。
- **可复用**：gpuflock.js 里“位置存进纹理、实例化渲染”的套路。

### EP05 御剑术：万剑剑阵
- 把前几期串起来：boids（EP01）负责剑群的飞行，顶点动画（EP02）做剑身的颤动与拖尾，ECS 和数据导向（EP03）负责每把剑的状态，GPU 朝向计算（EP04）让所有剑尖对准目标。
- **视觉**：上万把剑先排成阵（莲花、八卦、龙），再化为剑雨；可以借用 EP01 GPU 那一节“纹理平面 → 群体”的布局插值作为成阵过渡。
- **环形**：最后一帧回到一把剑的特写，顺带呼应整个系列的第一期：一只鸟和一把剑。

## EP05 结构（Blender + three.js）

- `ep05-sword/blender/`：`build.py` 是入口（`blender -b --factory-startup --python ep05-sword/blender/build.py -- export preview turntable`）。`geo.py` 是环形网格工具；`vroid.py` 导入 `sources/raw/vroid/` 里的 CC0 VRoid 模型（删现代服装、转向、缩放到肩高 1.38 m、T-pose 改成 48° A-pose 并设为静止姿势、骨骼改名成 rig.js 用的名字、测量身体轮廓、把 MToon 颜色写进材质 extras）；`body.py` 按测得的轮廓缝汉服并蒙皮；`props.py` 是剑和山峰。转台换模型后要重新跑 `turntable`，再按 solid→x-ray 交叉淡化拼成 `media/blender_tt/` 的 270 帧。导出到 `ep05-sword/models/*.glb`，预览图和转台帧输出到 `build/ep05-sword/blender/`。第二套 UV（`Flutter`，three.js 里叫 uv1）存“飘动权重和相位”，布料着色器用它做风吹效果。
- 人物材质：`sims/rig.js` 的 `toon()` 是仿 MToon 的卡通着色（亮/暗两色 + shade shift + 冷色边缘光 + 风吹），VRoid 部件读 `material.userData`，汉服用 `ROBE`/`RIVAL` 表。
- 剑的弯曲：`swordgl.js` 的 `bendSword()` 让剑身沿圆弧弯（曲率 κ = 2|B| + 颤动），剑柄保持笔直、跟着剑根转。剑光是穿过剑柄尾端最近 8 个位置的条带，历史位置由 `swords.js` 的 `record()` 环形缓冲每步记录（快照里一起存）。
- `sims/swords.js`：一万六千把剑的 ECS（纯 JS，Node 可以直接跑基准测试）；`sims/schedule.js` 存战斗时间表（片子里的秒数，要和配音对齐）；`sims/bench.mjs` 把基准测试结果写进 `bench.json`；`sims/clinks.mjs` 从碰撞日志生成剑鸣音效的时间点（make.sh 会自动调用）。
- `sims/rig.js`：在代码里摆姿势（两段式 IK、手指弯曲）；`sims/scene.js`：她的姿势时间线和本命剑的路径；`sims/duel.js`：慢动作对剑实验。
- 改台词以后，要同步检查 `schedule.js` 和 `scene.js` 里写死的秒数（剑诀抬手、指向、前推这几个时刻）。
- 第 0 帧和最后一帧都是剑诀加悬剑的特写：在 `T.rest` 时所有剑都被强制放回原位、弯曲清零；云、风、呼吸都是以片长为周期的函数。

## 检查清单（每期出片前）

- [ ] `tools/sheet.sh` 每 10 秒抽一帧，看一遍画面有没有空白、遮挡或越界
- [ ] 第 0 帧和最后一帧并排对比（环形结构）
- [ ] 字幕：每块中文不超过约 24 字，需要时用 `|` 手动断行，英文与中文对应
- [ ] 素材署名出现在画面上，并且写进 SOURCES.md
- [ ] 成片响度：make.sh 已经做 loudnorm（-15 LUFS）；用 `ffmpeg -i out.mp4 -af volumedetect -f null -` 确认不是静音（没有 GDC 片段的期数曾经整条混音为 0，已修复）
