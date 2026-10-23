window.TIMELINE = {
 "duration": 201.082,
 "scenes": [
  {
   "id": "intro",
   "start": 0.0,
   "voiceEnd": 20.285,
   "end": 21.585,
   "lines": [
    {
     "zh": "一只僵尸，翻不过这堵八米高的墙。",
     "en": "One zombie can't climb an eight-metre wall.",
     "start": 0.9,
     "end": 3.86
    },
    {
     "zh": "可几千只僵尸，会把彼此当成梯子。",
     "en": "But a few thousand will use each other as a ladder.",
     "start": 4.92,
     "end": 7.907
    },
    {
     "zh": "《僵尸世界大战》里，尸潮就是这样叠成人山，翻进城里的。|每一只都在找路、推挤、攀爬，|游戏要怎么同时算这么多个？",
     "en": "In World War Z, that's how the horde piles into a mountain and spills over.|Every one of them is pathing, shoving and climbing.|How does a game compute that many at once?",
     "start": 9.167,
     "end": 20.285
    }
   ]
  },
  {
   "id": "title",
   "start": 21.585,
   "voiceEnd": 25.197,
   "end": 27.497,
   "lines": [
    {
     "zh": "这一期，我们从《守望先锋》的 ECS 讲起。",
     "en": "This episode starts with the ECS behind Overwatch.",
     "start": 21.585,
     "end": 25.197
    }
   ]
  },
  {
   "id": "oop",
   "start": 27.497,
   "voiceEnd": 51.277,
   "end": 52.577,
   "lines": [
    {
     "zh": "最直觉的写法，是给每只僵尸一个对象：|位置、速度、血量、动画，再写一个 update。",
     "en": "The intuitive way is one object per zombie:|position, velocity, health, animation, plus an update method.",
     "start": 27.497,
     "end": 36.115
    },
    {
     "zh": "可这些对象散落在内存各处，|CPU 每次整块读进 64 字节，|大部分都用不上。",
     "en": "But those objects are scattered across memory.|The CPU always fetches 64 bytes at a time,|and most of them go unused.",
     "start": 36.675,
     "end": 43.142
    },
    {
     "zh": "我在这台电脑上测了一下：|一百万个对象，光是挪一步就要 37 毫秒，|超过了一整帧的时间。",
     "en": "I measured it on this machine:|just moving a million objects one step takes 37 milliseconds,|more than a whole frame.",
     "start": 43.702,
     "end": 51.277
    }
   ]
  },
  {
   "id": "owA",
   "start": 52.577,
   "voiceEnd": 59.01,
   "end": 59.31,
   "lines": [
    {
     "zh": "《守望先锋》用的是另一种架构。|这是首席玩法程序员 Tim Ford 在 GDC 2017 的演讲：",
     "en": "Overwatch uses a different architecture.|Here is lead gameplay programmer Tim Ford at GDC 2017:",
     "start": 52.577,
     "end": 59.01
    }
   ]
  },
  {
   "id": "owClip",
   "start": 59.31,
   "voiceEnd": 69.76,
   "end": 70.26,
   "lines": [
    {
     "zh": "实体其实只是一个 ID，对应一组组件",
     "en": "An entity is really just an ID that corresponds to a collection of components.",
     "start": 59.31,
     "end": 63.46
    },
    {
     "zh": "组件存储游戏状态，没有行为",
     "en": "Components store game state and have no behaviors.",
     "start": 63.46,
     "end": 66.91
    },
    {
     "zh": "系统拥有行为，不存储游戏状态",
     "en": "Systems have behaviors and store no game state.",
     "start": 66.91,
     "end": 69.71
    }
   ],
   "clip": {
    "src": "sources/raw/gdc_overwatch_raw.mp4",
    "in": 110.95,
    "out": 121.4
   },
   "credit": "GDC 2017 · Timothy Ford · Overwatch Gameplay Architecture and Netcode"
  },
  {
   "id": "ow",
   "start": 70.26,
   "voiceEnd": 92.664,
   "end": 93.964,
   "lines": [
    {
     "zh": "组件里没有函数，系统里没有字段。",
     "en": "Components have no functions; systems have no fields.",
     "start": 70.26,
     "end": 72.991
    },
    {
     "zh": "每个系统只关心几种组件：|挂机检测只处理同时拥有连接、输入和统计的实体，|AI 机器人没有连接组件，自然就被跳过。",
     "en": "Each system only cares about a few components:|the AFK check runs on entities that have a connection, input and stats;|an AI bot has no connection, so it's simply skipped.",
     "start": 73.551,
     "end": 84.102
    },
    {
     "zh": "《守望先锋》客户端大约有 46 个系统、103 种组件。|对他们来说，最大的好处是控制复杂度。",
     "en": "The Overwatch client has about 46 systems and 103 component types.|For them, the big win was keeping complexity under control.",
     "start": 84.662,
     "end": 92.664
    }
   ]
  },
  {
   "id": "soa",
   "start": 93.964,
   "voiceEnd": 110.405,
   "end": 111.905,
   "lines": [
    {
     "zh": "实体多到上万时，ECS 还有另一个好处：|同一种组件，可以紧挨着存成一列数组。",
     "en": "Once there are tens of thousands of entities, ECS has another payoff:|each component type can sit packed in a single array.",
     "start": 93.964,
     "end": 101.075
    },
    {
     "zh": "系统从头到尾扫一遍，|读进来的每个字节都有用。|同样一百万个，只要 3.8 毫秒，快了将近十倍。",
     "en": "A system sweeps it from start to end,|and every byte it fetches gets used.|The same million entities take 3.8 milliseconds, almost ten times faster.",
     "start": 101.735,
     "end": 110.405
    }
   ]
  },
  {
   "id": "flow",
   "start": 111.905,
   "voiceEnd": 131.455,
   "end": 132.955,
   "lines": [
    {
     "zh": "可光跑得快还不够：|一万只僵尸要是各自算一遍寻路，还是算不过来。",
     "en": "Speed alone isn't enough:|ten thousand zombies each running their own pathfinding is still too much.",
     "start": 111.905,
     "end": 117.442
    },
    {
     "zh": "办法是流场：|从目标出发，把整条街的距离算一遍，|每个格子存一个指向目标的箭头。",
     "en": "The answer is a flow field:|compute the distance to the goal across the whole street once,|and every cell stores an arrow pointing the way.",
     "start": 118.002,
     "end": 125.094
    },
    {
     "zh": "每只僵尸只读脚下的那一个箭头。|地图只算一次，僵尸再多也不怕。",
     "en": "Each zombie reads only the arrow under its feet.|The map is solved once, no matter how many zombies there are.",
     "start": 125.754,
     "end": 131.455
    }
   ]
  },
  {
   "id": "pile",
   "start": 132.955,
   "voiceEnd": 162.409,
   "end": 164.109,
   "lines": [
    {
     "zh": "人山是怎么叠起来的？|每一步，先数一数每个格子里有几只僵尸，|和上一期鱼群用的是同一张网格。",
     "en": "So how does the mountain form?|Every step, count the zombies in each cell,|the same grid trick the flocks used.",
     "start": 132.955,
     "end": 140.744
    },
    {
     "zh": "格子越挤，僵尸就站得越高；|被墙挡住的，会爬到同伴身上，|坡越堆越高，最后漫过墙头。",
     "en": "The more crowded the cell, the higher a zombie stands;|those blocked by the wall climb onto the others,|and the slope rises until it spills over the top.",
     "start": 141.304,
     "end": 149.943
    },
    {
     "zh": "据 Game Informer 报道，|《僵尸世界大战》为尸潮专门写了 Swarm 引擎，|同屏最多约五百只。",
     "en": "According to Game Informer,|World War Z's Swarm Engine was built for the hordes,|handling up to about five hundred zombies on screen.",
     "start": 150.603,
     "end": 157.61
    },
    {
     "zh": "它内部怎么实现并没有公开，|这里演示的是一种常见思路。",
     "en": "Its internals aren't public;|what you see here is one common approach.",
     "start": 158.07,
     "end": 162.409
    }
   ]
  },
  {
   "id": "systems",
   "start": 164.109,
   "voiceEnd": 179.703,
   "end": 181.603,
   "lines": [
    {
     "zh": "整个尸潮就是七个系统，每帧按顺序跑一遍：|生成、计数、流场、攀爬、移动、回收、动画。",
     "en": "The whole horde is seven systems, run in order every frame:|spawn, count, flow, climb, move, recycle, animate.",
     "start": 164.109,
     "end": 174.62
    },
    {
     "zh": "八千一百九十二只僵尸，|每一只都只是几列数组里的一行。",
     "en": "Eight thousand one hundred ninety-two zombies,|each just one row across a few arrays.",
     "start": 175.28,
     "end": 179.703
    }
   ]
  },
  {
   "id": "bridge",
   "start": 181.603,
   "voiceEnd": 188.132,
   "end": 189.032,
   "lines": [
    {
     "zh": "每只僵尸，都要转身朝向目标。|可如果要转向的，是一百万块太阳能板呢？",
     "en": "Every zombie turns to face its goal.|But what if what needs turning is a million solar panels?",
     "start": 181.603,
     "end": 188.132
    }
   ]
  },
  {
   "id": "final",
   "start": 189.032,
   "voiceEnd": 197.382,
   "end": 201.082,
   "lines": [
    {
     "zh": "下一期：《戴森球计划》，|让无数块太阳能板一起追着太阳转。",
     "en": "Next time: Dyson Sphere Program,|and countless solar panels tracking the sun together.",
     "start": 189.032,
     "end": 194.275
    },
    {
     "zh": "而这一切，还得从一只僵尸说起。",
     "en": "And all of it starts, once again, with a single zombie.",
     "start": 194.535,
     "end": 197.382
    }
   ]
  }
 ]
};
