# 事实来源与素材说明

## EP01 鸟群算法 Boids

### 事实
| 说法 | 来源 |
| --- | --- |
| 1986 年 Craig Reynolds 提出 boids（bird-oid object），1987 年论文发表于 SIGGRAPH：“Flocks, Herds, and Schools: A Distributed Behavioral Model”，Computer Graphics 21(4) | [Wikipedia: Boids](https://en.wikipedia.org/wiki/Boids)；[论文 PDF](https://course.khoury.northeastern.edu/cs5150f14/readings/reynolds_boids.pdf)；[SIGGRAPH History](https://history.siggraph.org/person/craig-reynolds) |
| 1992 年《蝙蝠侠归来》用它生成蝙蝠群和企鹅大军；1998 年 Reynolds 获奥斯卡科学技术奖 | [Wikipedia: Craig Reynolds](https://en.wikipedia.org/wiki/Craig_Reynolds_(computer_graphics))；[befores & afters: A history of CG bird flocking](https://beforesandafters.com/2022/04/07/a-history-of-cg-bird-flocking/) |
| 1999 年 GDC 演讲 “Steering Behaviors For Autonomous Characters”（寻找、逃离、徘徊、避障……） | [red3d.com/cwr/steer](https://www.red3d.com/cwr/steer/) |
| 《半条命》（1998）Xen 的飞行生物在游戏文件中名为 Boid，行为代码在 SDK 的 aflock.cpp | [Half-Life Wiki: Boid](https://breezewiki.discard.no/half-life/wiki/Boid)；[Combine OverWiki: Boid](https://combineoverwiki.net/wiki/Boid) |
| 2006 年 PSCrowd：在 PS3 上用空间哈希加多处理器，模拟 15,000 个个体，60 fps | ACM DOI [10.1145/1183316.1183333](https://doi.org/10.1145/1183316.1183333)；[GDC Vault: Crowd Simulation on PS3](https://gdcvault.com/play/1013476/Crowd-Simulation-on)；[AAAI AIIDE 2006 invited talks](https://aaai.org/?p=40805) |
| 2008 年 STARFLAG：椋鸟按拓扑距离互动，每只鸟只与最近的 6–7 只互动；模拟显示拓扑互动在密度变化时凝聚力更强 | Ballerini et al., PNAS 105(4):1232–1237, [PMC2234121](https://pmc.ncbi.nlm.nih.gov/articles/PMC2234121/)；[arXiv:0709.1916](https://arxiv.org/abs/0709.1916) |
| 《ABZÛ》：每条鱼 60–100 个关节，一万条鱼 × 100 个关节不可行，于是改用静态网格实例化 | Matt Nava, “Creating the Art of ABZÛ”, GDC 2017（片段 3:41.9–3:52.7） |

### 素材（画面上都已署名）
| 文件 | 用途 | 出处 |
| --- | --- | --- |
| `sources/raw/starling_turkey.mp4` | 开头钩子与拓扑段的实拍椋鸟 | Bilibili BV1kJUKBCEZG，@Bobo字幕组，土耳其泰基尔达椋鸟群飞（转载的新闻画面） |
| `sources/raw/gdc_abzu_raw.mp4` | GDC 演讲片段（约 11 秒） | Bilibili BV15b41157HH（GDC 官方录像的转载）；原始录像在 GDC Vault / GDC YouTube 频道 |
| `sources/raw/gdc_abzu_cn.mp4` | 下一期参考（中文字幕版） | Bilibili BV1Hx411V78q，@卡姐Cara 翻译 |
| `starling_*` 等其余文件 | 备用 | 见同名 .json |

所有素材都是短片段引用，用于教学和评论。正式发布前，请按目标平台的规则确认，最好替换成原始出处的高清版本。蝙蝠群画面是自制的示意渲染，不是电影原片。

## EP02 《ABZÛ》万鱼之海
| 说法 / 素材 | 来源 |
| --- | --- |
| 一万多条鱼里只有约 30 条带骨骼；其余是静态网格 + 材质里的顶点动画（游动、平移、转弯卷曲、咬合）+ 混合形状空间 | Matt Nava, “Creating the Art of ABZÛ”, GDC 2017（片段 7:14–7:27、7:34–7:44；示意画面 5:04–10:22）；转载 Bilibili BV15b41157HH，中文字幕版 BV1Hx411V78q（@卡姐Cara） |
| 补充 | 80.lv 对 Matt Nava 的采访；Godot 文档 “Animating thousands of fish” |
| `sources/raw/abzu_school.mp4` 游戏实机 | ABZÛ © Giant Squid / 505 Games · Bilibili BV19p411o7ps @星影 |

## EP03 ECS：从《守望先锋》到《僵尸世界大战》
| 说法 / 素材 | 来源 |
| --- | --- |
| 实体只是 ID、组件只存数据、系统只有逻辑 | Timothy Ford (Blizzard), “Overwatch Gameplay Architecture and Netcode”, GDC 2017（片段 1:51–2:01）；转载 Bilibili BV1Qb411h7ua |
| 《僵尸世界大战》Swarm Engine：上千僵尸、叠人墙 | Game Informer, “Six Things To Know About World War Z” (2019)；Bilibili BV1ELJy6zE5b @这货不是氨基酸（机制解析） |
| 流场寻路 | Elijah Emerson, “Crowd Pathfinding and Steering Using Flow Field Tiles”, Game AI Pro (2013) |
| 一百万实体 37 ms → 3.8 ms | 本机实测 `ep03-ecs/bench.json`（Apple M3 Max） |
| 预告片与实机 | 电影 World War Z (2013) © Paramount（BV1fu411z7ur）；游戏 © Saber Interactive / Focus Entertainment（BV1hupr6oEnX、BV1pyp761EpZ） |

## EP04 《戴森球计划》万板向日
| 说法 / 素材 | 来源 |
| --- | --- |
| 远处太阳帆一次 `DrawProceduralNow` 画完 | DSPSwarmDrawFix Mod v1.1.0 页面（作者分析） |
| 戴森壳实例化：5,240 块壳 18 fps → ~85 fps；框架/节点 LOD 与视锥剔除 | SphereOpt Mod 页面（作者实测） |
| 一百万块板 CPU 算矩阵 45.9 ms、每帧上传 61 MB | 本机实测 `ep04-dyson/bench.json`（Apple M3 Max） |
| 实机画面 | Dyson Sphere Program © Youthcat Studio / Gamera Games · Bilibili BV1nf4y1H7GS @不肝不氪的云在 |

## EP05 御剑术：一万把飞剑
| 说法 / 素材 | 来源 |
| --- | --- |
| 白衣剑修、对手的脸、头发、身体 | VRoid Studio beta 版样例模型 “Sendagaya Shino”“HairSample_Male”（pixiv），**CC0**（VRM meta：licenseName = CC0，商用允许）；取自 github.com/madjin/vrm-samples（vroid/beta），原文件与说明在 `sources/raw/vroid/`。去掉了原有现代服装，画面上已署名 |
| 汉服（内袍、宽袖、交领、腰带、外纱、披帛、发簪）、剑、山峰 | 本片 Blender 5.2 Python 脚本建模并按测得的身体尺寸贴合（`ep05-sword/blender/`），导出 glTF；画中画转台为同一模型的 EEVEE 渲染 |
| 52 根人形骨骼、约 2.3 万顶点、无动画片段，姿势由代码 IK 实时计算 | `ep05-sword/blender/vroid.py`、`body.py`、`ep05-sword/sims/rig.js`（屏幕上的数字是运行时读取的） |
| 一万把 + 六千把剑的模拟每步 2.8–7.8 ms | 本机实测 `ep05-sword/bench.json`（Apple M3 Max，Node 24） |
| 每把剑每帧上传 4 × vec4 = 64 字节 | `ep05-sword/sims/swordgl.js` 的 `sync()` |
| ABZÛ 游动着色器（画中画） | Matt Nava, “Creating the Art of ABZÛ”, GDC 2017（与 EP02 同一片段，Bilibili BV15b41157HH 转载） |
