# 万象成群 · Swarms at Scale

鸟群、鱼群、尸潮、太阳帆与飞剑的浏览器实时实验集。首页将**独立互动场景**与**讲解回放**分开，不依赖 MP4 才能观看。

- 在线站点：https://swarm-at-scale.pages.dev/
- 源码：https://github.com/holooooo/swarm-at-scale-video

## 五个实验

| 期 | 主题 | 互动入口 | 实时讲解 |
| --- | --- | --- | --- |
| 01 | Boids：局部规则与邻居搜索 | [交互](ep01-boids/interactive.html) | [回放](ep01-boids/film.html) |
| 02 | ABZÛ：实例化鱼群与顶点动画 | [交互](ep02-abzu/interactive.html) | [回放](ep02-abzu/film.html) |
| 03 | ECS：数据导向与尸潮 | [交互](ep03-ecs/interactive.html) | [回放](ep03-ecs/film.html) |
| 04 | 戴森球：朝向、轨道与GPU计算 | [交互](ep04-dyson/interactive.html) | [回放](ep04-dyson/film.html) |
| 05 | 御剑术：剑群、攻防与弯曲 | [交互](ep05-sword/interactive.html) | [回放](ep05-sword/film.html) |

互动页直接复用各期原模拟，不嵌入视频或影片 iframe。可选择阶段、自由旋转/缩放/平移、暂停/单步和调参数。暂停只停止模拟，相机仍可操作；不同阶段不会自动切镜头。手机采用较低实例数量与分辨率预算。

讲解页沿制作时的时间线绘制，含代码面板、双语字幕及本地配音。第五期已剪去人物建模与动作IK的介绍段，人物和剑群的可视效果仍保留。

## 本地运行

需要现代 WebGL 2 浏览器和 HTTP 服务。模块与 GLB 不能直接双击用 file:// 加载。

```sh
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

无 npm 运行依赖、无 CDN。Three.js 与 GLTFLoader 等浏览器模块均在本地 lib/。

## 目录与发布

- `interactive/`：共享交互壳、相机、阶段与原模拟适配器。
- `ep*/`：原始模拟、讲解分镜、时间线、配音和必要素材。
- `core/`：原系列运行时与共享模拟。
- `assets/`：首页样式、群体示意动画和实机渲染封面。
- `out/*.srt`：双语字幕。
- `tools/`：配音/混音/逐帧出片和发布构建工具。

Git 不包含大型成片、build 缓存或 sources/raw 下载源。站点仍保留讲解页需要的已提取素材帧；独立互动页不依赖这些帧。

```sh
python3 tools/build_site.py
wrangler pages deploy dist --project-name swarm-at-scale --branch main
```

`tools/build_site.py` 使用明确的运行时白名单打包至 dist，排除原始下载、制作缓存、MP4、Blender 工程与本地凭据。GitHub Actions 在 main 推送时校验打包并部署 GitHub Pages。Cloudflare Pages 使用本机已授权的 Wrangler 发布；不把登录令牌写入仓库。

## 素材与授权

来源、游戏/GDC短片引用、模型 CC0 信息和基准条件见 [SOURCES.md](SOURCES.md)。第三方素材的教学引用不等于获得再许可；它们不因本仓库公开而改变原权利。`ep05-sword/models/` 的人物来自文档中列明的 CC0 VRoid 样例并经修改，保留来源说明。Three.js 采用 MIT，见 [第三方许可](THIRD_PARTY_NOTICES.md)。

本项目的模拟是教学示意，不是相关游戏源码；性能受实例预算、浏览器和设备影响，不可当作相关游戏的实测表现。
