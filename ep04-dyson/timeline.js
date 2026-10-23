window.TIMELINE = {
 "duration": 171.477,
 "scenes": [
  {
   "id": "intro",
   "start": 0.0,
   "voiceEnd": 20.71,
   "end": 22.21,
   "lines": [
    {
     "zh": "一块太阳能板，只需要做一件事：|一整天都转过去，正对着太阳。",
     "en": "A solar panel has only one job:|turn all day long to face the sun.",
     "start": 0.9,
     "end": 6.916
    },
    {
     "zh": "可在《戴森球计划》里，|一颗星球上铺满了成千上万块，|恒星周围还飞着几十万张太阳帆。",
     "en": "But in Dyson Sphere Program,|a single planet is paved with thousands of them,|and hundreds of thousands of sails circle the star.",
     "start": 7.976,
     "end": 15.067
    },
    {
     "zh": "每一块都在转。这么多东西，|游戏到底每一帧要算多少？",
     "en": "Every one of them is turning.|How much does the game have to compute each frame?",
     "start": 15.927,
     "end": 20.71
    }
   ]
  },
  {
   "id": "title",
   "start": 22.21,
   "voiceEnd": 26.636,
   "end": 28.936,
   "lines": [
    {
     "zh": "这一期，我们看怎么让一百万个东西，一起追着太阳转。",
     "en": "This episode: how to make a million things track the sun at once.",
     "start": 22.21,
     "end": 26.636
    }
   ]
  },
  {
   "id": "cpu",
   "start": 28.936,
   "voiceEnd": 52.953,
   "end": 54.453,
   "lines": [
    {
     "zh": "最直接的写法：每块板每帧在 CPU 上，|先找到太阳，转动底座，再把面板仰起来，|算出一个 4×4 矩阵，传给显卡。",
     "en": "The direct way: every panel, every frame, on the CPU:|find the sun, turn the base, tilt the face up,|build a 4×4 matrix and hand it to the GPU.",
     "start": 28.936,
     "end": 40.084
    },
    {
     "zh": "我在这台电脑上测了一下：|一百万块板，光算矩阵就要 46 毫秒，|每帧还得上传 61 MB 数据。",
     "en": "I measured it on this machine:|for a million panels the matrices alone take 46 milliseconds,|and 61 megabytes have to be uploaded every frame.",
     "start": 40.644,
     "end": 48.539
    },
    {
     "zh": "可这些板的变化，其实全都能从太阳位置推出来。",
     "en": "Yet everything about how these panels change follows from where the sun is.",
     "start": 49.199,
     "end": 52.953
    }
   ]
  },
  {
   "id": "gpu",
   "start": 54.453,
   "voiceEnd": 84.641,
   "end": 86.741,
   "lines": [
    {
     "zh": "那就把这段数学，搬进顶点着色器。",
     "en": "So move that math into the vertex shader.",
     "start": 54.453,
     "end": 57.539
    },
    {
     "zh": "每块板只存一次：它在星球上的方向，加一个随机数，16 个字节，|开局上传，之后再也不动。",
     "en": "Each panel is stored once: its direction on the planet plus a random number, sixteen bytes,|uploaded at the start and never touched again.",
     "start": 58.099,
     "end": 67.336
    },
    {
     "zh": "每一帧，CPU 只发两个数：星球转到了哪，太阳在哪。|顶点着色器自己转底座、仰面板。",
     "en": "Each frame, the CPU sends just two values: how far the planet has turned, and where the sun is.|The vertex shader turns the base and tilts the face on its own.",
     "start": 67.996,
     "end": 77.621
    },
    {
     "zh": "转到夜晚的一侧，太阳落下地平线，|板子就平放下来，等下一次日出。",
     "en": "On the night side, once the sun sets below the horizon,|the panels lie flat and wait for the next sunrise.",
     "start": 78.281,
     "end": 84.641
    }
   ]
  },
  {
   "id": "swarm",
   "start": 86.741,
   "voiceEnd": 118.411,
   "end": 120.511,
   "lines": [
    {
     "zh": "太空里的太阳帆更极端：几十万张，每一张都在绕着恒星转。",
     "en": "Out in space, the solar sails go further: hundreds of thousands, each orbiting the star.",
     "start": 86.741,
     "end": 91.978
    },
    {
     "zh": "它们甚至什么都不用存。|只用编号算出哈希，就能定出轨道、半径和起始角，|再按开普勒定律，越靠里的转得越快。",
     "en": "They don't need to store anything at all.|A hash of each sail's index fixes its orbit, radius and starting angle,|and by Kepler's law, inner orbits run faster.",
     "start": 92.538,
     "end": 103.34
    },
    {
     "zh": "位置就是编号和时间的函数。|这里的一百零四万八千五百七十六张帆，只用一次绘制。",
     "en": "Position is just a function of index and time.|These one million forty-eight thousand five hundred seventy-six sails take a single draw call.",
     "start": 104.0,
     "end": 110.907
    },
    {
     "zh": "据社区 Mod 作者的分析，|《戴森球计划》也是用一次程序化绘制，|画出所有远处的太阳帆。",
     "en": "According to a community mod author's analysis,|Dyson Sphere Program also draws all the distant sails|with one procedural draw call.",
     "start": 111.567,
     "end": 118.411
    }
   ]
  },
  {
   "id": "shell",
   "start": 120.511,
   "voiceEnd": 134.703,
   "end": 136.403,
   "lines": [
    {
     "zh": "戴森壳的六边形也是一样。|社区 Mod SphereOpt 把它们改成实例化，|每层一次绘制，而不是每块壳一次。",
     "en": "The hexagons of the Dyson shell work the same way.|The community mod SphereOpt switched them to instancing:|one draw call per layer instead of one per shell.",
     "start": 120.511,
     "end": 128.536
    },
    {
     "zh": "在一颗有 5240 块壳的戴森球上，|作者测到帧率从 18 提到了 85 左右。",
     "en": "On a sphere with 5,240 shells,|its author measured the frame rate going from 18 to about 85.",
     "start": 129.196,
     "end": 134.703
    }
   ]
  },
  {
   "id": "lod",
   "start": 136.403,
   "voiceEnd": 153.158,
   "end": 154.658,
   "lines": [
    {
     "zh": "还有一招是不画、少画。|离得近的太阳帆，游戏画成实心模型；|远处的，只是一张平面贴片。",
     "en": "Another move is to draw less, or nothing.|Sails up close are drawn as solid meshes;|far away, they're just flat sprites.",
     "start": 136.403,
     "end": 145.247
    },
    {
     "zh": "SphereOpt 也给框架和节点加了细节层级和视锥剔除：|戴森球不在画面里时，帧率大幅上升。",
     "en": "SphereOpt also added level of detail and frustum culling for frames and nodes:|when the sphere is out of view, the frame rate jumps.",
     "start": 145.907,
     "end": 153.158
    }
   ]
  },
  {
   "id": "bridge",
   "start": 154.658,
   "voiceEnd": 167.377,
   "end": 171.477,
   "lines": [
    {
     "zh": "四期下来，招式其实只有几种：|局部规则、空间网格、数据和逻辑分开，|再把能算的都交给 GPU。",
     "en": "Four episodes in, there are really only a few moves:|local rules, a spatial grid, data kept apart from logic,|and everything computable handed to the GPU.",
     "start": 154.658,
     "end": 164.394
    },
    {
     "zh": "下一期，我们把它们合在一起。",
     "en": "Next time, we put them all together.",
     "start": 165.054,
     "end": 167.377
    }
   ]
  }
 ]
};
