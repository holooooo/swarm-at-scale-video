window.TIMELINE = {
 "duration": 202.863,
 "scenes": [
  {
   "id": "intro",
   "start": 0.0,
   "voiceEnd": 25.036,
   "end": 26.536,
   "lines": [
    {
     "zh": "一只椋鸟，看不见整个鸟群，|它只盯着身边的六七只同伴。",
     "en": "A single starling can't see the flock.|It only watches the six or seven birds beside it.",
     "start": 0.9,
     "end": 5.852
    },
    {
     "zh": "可几十万只这样的鸟聚在一起，|就能在天上画出这样的形状。",
     "en": "Yet put a few hundred thousand of them together,|and they paint shapes like this across the sky.",
     "start": 6.412,
     "end": 10.632
    },
    {
     "zh": "没有领头鸟，也没有指挥。|1986 年，有人只用三条规则，|就在电脑里复现了这一幕。",
     "en": "No leader, no conductor.|In 1986, someone used just three rules|to recreate it on a computer.",
     "start": 12.292,
     "end": 20.015
    },
    {
     "zh": "这一期，我们从一只鸟出发，一路演进到六万只。",
     "en": "This episode, we start from one bird and evolve all the way to sixty thousand.",
     "start": 20.775,
     "end": 25.036
    }
   ]
  },
  {
   "id": "rules",
   "start": 26.536,
   "voiceEnd": 58.329,
   "end": 59.429,
   "lines": [
    {
     "zh": "他叫克雷格·雷诺兹，|他把模拟出来的鸟叫作 Boids，“类鸟体”。",
     "en": "His name is Craig Reynolds.|He called his simulated birds boids: bird-oid objects.",
     "start": 26.536,
     "end": 31.757
    },
    {
     "zh": "每只 boid 只感知身边一小圈邻居，|只做三件事：",
     "en": "Each boid senses only the neighbors in a small radius,|and does just three things:",
     "start": 32.017,
     "end": 36.056
    },
    {
     "zh": "分离，离得太近就躲开；",
     "en": "separation: steer away when someone gets too close;",
     "start": 36.416,
     "end": 38.819
    },
    {
     "zh": "对齐，方向跟邻居保持一致；",
     "en": "alignment: match your neighbors' heading;",
     "start": 39.479,
     "end": 42.173
    },
    {
     "zh": "聚合，朝邻居的中心靠拢。",
     "en": "cohesion: move toward their center.",
     "start": 42.833,
     "end": 45.242
    },
    {
     "zh": "三股力相加，就是这一帧的转向。|没有全局规划，鸟群自己出现了。",
     "en": "Add the three forces, and that's this frame's steering.|No global plan, yet the flock simply emerges.",
     "start": 46.002,
     "end": 52.324
    },
    {
     "zh": "1992 年，它登上了《蝙蝠侠归来》，|生成了成群的蝙蝠和企鹅大军。",
     "en": "In 1992 it reached Batman Returns,|driving swarms of bats and an army of penguins.",
     "start": 52.784,
     "end": 58.329
    }
   ]
  },
  {
   "id": "steer",
   "start": 59.429,
   "voiceEnd": 83.476,
   "end": 84.876,
   "lines": [
    {
     "zh": "1999 年的 GDC 上，|雷诺兹把它扩展成一整套转向行为：|寻找、逃离、徘徊、避障。",
     "en": "At GDC 1999,|Reynolds expanded it into a whole toolkit of steering behaviors:|seek, flee, wander, avoid.",
     "start": 59.429,
     "end": 68.234
    },
    {
     "zh": "核心只有一行：期望速度，减去当前速度。",
     "en": "The core is a single line: desired velocity minus current velocity.",
     "start": 68.494,
     "end": 72.721
    },
    {
     "zh": "放进一只鹰，每只鸟多一条“逃离”，|鸟群就会被撕开，再重新合拢。",
     "en": "Drop in a hawk and give each bird one extra flee rule,|and the flock tears open, then closes again.",
     "start": 73.181,
     "end": 79.185
    },
    {
     "zh": "《半条命》里的异星飞鸟，|名字就直接叫 Boid。",
     "en": "In Half-Life, the alien flyers of Xen|are literally named Boid.",
     "start": 79.945,
     "end": 83.476
    }
   ]
  },
  {
   "id": "scale",
   "start": 84.876,
   "voiceEnd": 115.505,
   "end": 116.605,
   "lines": [
    {
     "zh": "但这里藏着一个规模问题：|每只鸟都得先找出，谁是它的邻居。",
     "en": "But a scaling problem hides here:|every bird first has to find out who its neighbors are.",
     "start": 84.876,
     "end": 90.614
    },
    {
     "zh": "和所有鸟逐一比距离，|一千只鸟，每帧就是一百万次；|数量翻十倍，开销翻一百倍。",
     "en": "Compare against every other bird,|and a thousand birds cost a million checks per frame;|ten times the birds, a hundred times the cost.",
     "start": 90.874,
     "end": 98.928
    },
    {
     "zh": "解法是空间网格：每只鸟只查自己和相邻的格子，|开销从 n 的平方，降到接近 n。",
     "en": "The fix is a spatial grid: each bird checks only its own cell and the cells next to it,|and the cost drops from n squared to roughly n.",
     "start": 99.388,
     "end": 107.793
    },
    {
     "zh": "2006 年，雷诺兹靠它在 PS3 上，|跑起了一万五千个个体，每秒六十帧。",
     "en": "In 2006, Reynolds used it to run|fifteen thousand agents on a PS3 at sixty frames per second.",
     "start": 108.253,
     "end": 115.505
    }
   ]
  },
  {
   "id": "topo",
   "start": 116.605,
   "voiceEnd": 137.649,
   "end": 138.949,
   "lines": [
    {
     "zh": "那真实的椋鸟看多远？|2008 年，STARFLAG 团队|重建了鸟群里每只鸟的三维位置。",
     "en": "So how far does a real starling look?|In 2008, the STARFLAG team|rebuilt the 3D position of every bird in a flock.",
     "start": 116.605,
     "end": 124.889
    },
    {
     "zh": "答案是：不按距离，|只看最近的六七只，不管它们离得多远。",
     "en": "The answer: not by distance.|Each bird tracks its six or seven nearest, however far away.",
     "start": 125.149,
     "end": 130.807
    },
    {
     "zh": "这叫拓扑邻居。|论文的模拟显示：密度剧变时，|这样的鸟群更不容易散。",
     "en": "These are topological neighbors.|The paper's simulations show that when density swings,|such flocks are harder to break apart.",
     "start": 131.267,
     "end": 137.649
    }
   ]
  },
  {
   "id": "gpu",
   "start": 138.949,
   "voiceEnd": 164.586,
   "end": 167.286,
   "lines": [
    {
     "zh": "再往上，就得交给 GPU：|每只鸟的位置和速度，存成浮点纹理里的一个像素。",
     "en": "Beyond that, hand it to the GPU:|each bird's position and velocity is one pixel of a float texture.",
     "start": 138.949,
     "end": 145.545
    },
    {
     "zh": "邻居也不再一个个去数，|先把所有鸟累加进一张网格，|记下每格的数量、中心和平均速度。",
     "en": "Neighbors are no longer counted one by one;|every bird is splatted into a grid|that keeps each cell's count, center and average velocity.",
     "start": 145.905,
     "end": 153.559
    },
    {
     "zh": "每只鸟只读周围的格子，|三条规则，就变成了对一张场的采样。",
     "en": "Each bird reads only the cells around it,|and the three rules become samples of a field.",
     "start": 153.919,
     "end": 159.24
    },
    {
     "zh": "六万五千五百三十六只，|每一只都在实时做着同样的三件事。",
     "en": "Sixty-five thousand five hundred thirty-six birds,|each doing the same three things, in real time.",
     "start": 159.9,
     "end": 164.586
    }
   ]
  },
  {
   "id": "bridge",
   "start": 167.286,
   "voiceEnd": 179.421,
   "end": 179.821,
   "lines": [
    {
     "zh": "从三条规则到六万只，规则几乎没变，|变的是我们怎么组织数据。",
     "en": "From three rules to sixty thousand birds, the rules barely changed.|What changed is how we organize the data.",
     "start": 167.286,
     "end": 173.711
    },
    {
     "zh": "可如果每一只不再是一个点，|而是一条有骨骼、会摆尾的鱼呢？",
     "en": "But what if each one isn't a point anymore,|but a fish with a skeleton and a swinging tail?",
     "start": 173.971,
     "end": 179.421
    }
   ]
  },
  {
   "id": "gdc",
   "start": 179.821,
   "voiceEnd": 190.621,
   "end": 191.121,
   "lines": [
    {
     "zh": "每条鱼大概有 60 到 100 个关节",
     "en": "there's like 60 to 100 joints",
     "start": 179.821,
     "end": 182.021
    },
    {
     "zh": "每一帧，你都得把每条鱼的关节全部更新一遍",
     "en": "and every frame you have to update all of those joints per fish",
     "start": 182.021,
     "end": 184.571
    },
    {
     "zh": "所以要更新的不只是一万条鱼",
     "en": "so instead of just having 10,000 fish to update",
     "start": 184.571,
     "end": 187.571
    },
    {
     "zh": "而是一万乘以一百个关节，这太疯狂了",
     "en": "you have ten thousand times 100 joints, which is crazy",
     "start": 187.571,
     "end": 190.621
    }
   ],
   "clip": {
    "src": "sources/raw/gdc_abzu_raw.mp4",
    "in": 221.85,
    "out": 232.65
   },
   "credit": "GDC 2017 · Matt Nava · Creating the Art of ABZÛ"
  },
  {
   "id": "final",
   "start": 191.121,
   "voiceEnd": 199.163,
   "end": 202.863,
   "lines": [
    {
     "zh": "下一期，我们潜进《ABZÛ》的海底，|看上万条鱼怎么游出生命感。",
     "en": "Next time, we dive into the sea of ABZÛ|to see how ten thousand fish come alive.",
     "start": 191.121,
     "end": 196.423
    },
    {
     "zh": "而这一切，还得从一只鸟说起。",
     "en": "And all of it starts, once again, with a single bird.",
     "start": 196.683,
     "end": 199.163
    }
   ]
  }
 ]
};
