# EP03 发布文案 · ECS：一万个敌人

成片：`03_ECS_一万个敌人.mp4`（3:21，16:9，中英双语字幕，另附 `.srt`）

## 封面（统一版式，与系列其他期同一套设计）

- `out/covers/ep03-4x3.jpg`（1440×1080）横版封面
- `out/covers/ep03-3x4.jpg`（1080×1440）竖版 / 主页九宫格 3:4 裁切

版式、字体层级、配色与另一系列（Shader 实验室）共用一套，改封面见 `../covers/README.md`。

## 标题（每条 ≤ 20 字，任选其一）
- 标题 1：ECS：游戏怎么同时算一万个敌人
- 标题 2：尸潮叠成人山，游戏是怎么算的？
- 标题 3：从守望先锋到僵尸世界大战的 ECS
- 标题 4：同样一百万个，快了将近十倍

## 话题标签
#vibe知识大赏 #游戏开发 #ECS #守望先锋 #僵尸世界大战

## 简介
一只僵尸翻不过八米高的墙，几千只却会把彼此当成梯子。这一期从《守望先锋》首席玩法程序员 Tim Ford 的 GDC 2017 演讲讲起：实体只是一个 ID，组件只存数据，系统只有逻辑。再到数据导向：同类组件存成连续数组，在这台 M3 Max 上，移动一百万个实体从 37 ms 降到 3.8 ms。最后用流场寻路、格子计数和攀爬，在浏览器里实时搭出一座八千只僵尸叠成的尸山。

## 来源
Timothy Ford（Blizzard）GDC 2017 “Overwatch Gameplay Architecture and Netcode”（片段 1:51–2:01）；Game Informer《Six Things To Know About World War Z》(2019)；Elijah Emerson《Crowd Pathfinding and Steering Using Flow Field Tiles》，Game AI Pro (2013)。电影《僵尸世界大战》(2013) 预告片，游戏《僵尸世界大战》“铅浪”更新预告片（B 站转载）。性能数字为本机实测（`ep03-ecs/bench.json`）。
