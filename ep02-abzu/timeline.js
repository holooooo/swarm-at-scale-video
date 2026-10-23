window.TIMELINE = {
 "duration": 197.713,
 "scenes": [
  {
   "id": "intro",
   "start": 0.0,
   "voiceEnd": 10.922,
   "end": 11.822,
   "lines": [
    {
     "zh": "给一条鱼做动画，最经典的办法是骨骼：|六十到一百个关节，想怎么动就怎么动。",
     "en": "The classic way to animate a fish is a skeleton:|sixty to a hundred joints, and it can do anything you like.",
     "start": 0.9,
     "end": 7.613
    },
    {
     "zh": "可《ABZÛ》要的，是这样的画面。",
     "en": "But ABZÛ wanted something like this.",
     "start": 8.373,
     "end": 10.922
    }
   ]
  },
  {
   "id": "gdcA",
   "start": 11.822,
   "voiceEnd": 25.022,
   "end": 25.322,
   "lines": [
    {
     "zh": "你看角落这里，我想大概有一万一千条鱼",
     "en": "you can see in the corner there, I think it's about 11,000 fish or something.",
     "start": 11.822,
     "end": 17.122
    },
    {
     "zh": "这些是巨大的鲹鱼",
     "en": "These are giant trevallies,",
     "start": 17.222,
     "end": 18.822
    },
    {
     "zh": "它们同时在游，每一条的节奏都不一样",
     "en": "and they all are swimming with a unique timing of their swim cycle at the same time.",
     "start": 18.822,
     "end": 25.022
    }
   ],
   "clip": {
    "src": "sources/raw/gdc_abzu_raw.mp4",
    "in": 434.1,
    "out": 447.3
   },
   "credit": "GDC 2017 · Matt Nava · Creating the Art of ABZÛ"
  },
  {
   "id": "gdcB",
   "start": 25.322,
   "voiceEnd": 34.822,
   "end": 35.322,
   "lines": [
    {
     "zh": "我们试过用带骨骼的鱼来做这个场景",
     "en": "when we tried to do this scene with skeleton fish,",
     "start": 25.322,
     "end": 28.222
    },
    {
     "zh": "屏幕上大概只能放 30 条鱼",
     "en": "we only could get like 30 fish on the screen.",
     "start": 28.222,
     "end": 32.622
    },
    {
     "zh": "所以差别非常大",
     "en": "So it's a huge difference.",
     "start": 32.622,
     "end": 34.822
    }
   ],
   "clip": {
    "src": "sources/raw/gdc_abzu_raw.mp4",
    "in": 454.4,
    "out": 463.9
   },
   "credit": "GDC 2017 · Matt Nava · Creating the Art of ABZÛ"
  },
  {
   "id": "title",
   "start": 35.322,
   "voiceEnd": 40.572,
   "end": 42.872,
   "lines": [
    {
     "zh": "三十条，到一万一千条。|这一期，我们拆开《ABZÛ》的鱼。",
     "en": "Thirty fish, versus eleven thousand.|This episode, we take ABZÛ's fish apart.",
     "start": 35.322,
     "end": 40.572
    }
   ]
  },
  {
   "id": "skel",
   "start": 42.872,
   "voiceEnd": 59.27,
   "end": 60.47,
   "lines": [
    {
     "zh": "骨骼动画贵在哪？|每一帧，每个关节都要算一次变换，|再把每个顶点按权重蒙到骨头上。",
     "en": "Why are skeletons expensive?|Every frame, every joint needs its transform computed,|and every vertex is skinned to its bones by weight.",
     "start": 42.872,
     "end": 50.78
    },
    {
     "zh": "一万条鱼乘一百个关节，就是一百万个关节，|每秒还要再算六十遍。",
     "en": "Ten thousand fish times a hundred joints is a million joints,|sixty times a second.",
     "start": 51.34,
     "end": 56.863
    },
    {
     "zh": "所以他们干脆把骨骼拿掉了。",
     "en": "So they took the skeletons away.",
     "start": 57.423,
     "end": 59.27
    }
   ]
  },
  {
   "id": "inst",
   "start": 60.47,
   "voiceEnd": 77.041,
   "end": 78.341,
   "lines": [
    {
     "zh": "所有鱼共用一个静态网格，|用实例化一次画出成千上万份。",
     "en": "Every fish shares one static mesh,|drawn thousands of times in a single instanced call.",
     "start": 60.47,
     "end": 65.434
    },
    {
     "zh": "这项技术原本多用来画草地；|每个实例只带一小份数据。",
     "en": "The technique is usually used for grass;|each instance carries only a tiny bit of data.",
     "start": 65.694,
     "end": 69.982
    },
    {
     "zh": "在这期的演示里，每条鱼只有三十二个字节：|位置、相位、速度和转向。",
     "en": "In this demo, each fish is just thirty-two bytes:|position, phase, velocity and turn rate.",
     "start": 70.242,
     "end": 77.041
    }
   ]
  },
  {
   "id": "swim",
   "start": 78.341,
   "voiceEnd": 104.082,
   "end": 105.582,
   "lines": [
    {
     "zh": "没有骨骼，鱼怎么动？|答案是在材质里直接挪顶点。",
     "en": "Without bones, how does a fish move?|By moving its vertices right in the material.",
     "start": 78.341,
     "end": 83.165
    },
    {
     "zh": "第一层，整条鱼左右平移；|第二层，绕中心点偏航。",
     "en": "Layer one: the whole fish slides side to side.|Layer two: it yaws around its center.",
     "start": 83.725,
     "end": 89.062
    },
    {
     "zh": "第三层，一道正弦波沿着脊椎传向尾巴；|第四层，身体沿脊椎扭转。",
     "en": "Layer three: a sine wave travels down the spine to the tail.|Layer four: the body twists along the spine.",
     "start": 89.822,
     "end": 95.996
    },
    {
     "zh": "再加一张蒙板，只让后半身摆动，|一条会游的鱼就出来了，一根骨头都没用。",
     "en": "Add a mask so only the back half swings,|and you have a swimming fish without a single bone.",
     "start": 96.756,
     "end": 104.082
    }
   ]
  },
  {
   "id": "phase",
   "start": 105.582,
   "voiceEnd": 118.336,
   "end": 119.636,
   "lines": [
    {
     "zh": "四层动作都由同一个相位驱动。|每条鱼起始相位不同，鱼群就不会整齐划一。",
     "en": "All four layers run off a single phase.|Give every fish its own starting phase, and the school stops marching in lockstep.",
     "start": 105.582,
     "end": 112.023
    },
    {
     "zh": "相位的快慢跟着游速走：|加速时尾巴摆得又快又猛，然后滑行。",
     "en": "The phase speeds up with swim speed:|when a fish accelerates its tail beats hard, then it coasts.",
     "start": 112.683,
     "end": 118.336
    }
   ]
  },
  {
   "id": "bite",
   "start": 119.636,
   "voiceEnd": 135.049,
   "end": 136.349,
   "lines": [
    {
     "zh": "咬合很难用正弦波做出来，|于是他们改用混合变形：",
     "en": "A bite is hard to make out of sine waves,|so they switched to blendshapes:",
     "start": 119.636,
     "end": 123.81
    },
    {
     "zh": "先张嘴，再把头往前送，同时合上嘴。",
     "en": "open the mouth, then thrust the head forward while it snaps shut.",
     "start": 124.27,
     "end": 128.104
    },
    {
     "zh": "螃蟹的腿也是四个混合姿态；|要用骨骼，一只螃蟹就得四十一个关节。",
     "en": "A crab's legs are four blended poses too;|with a skeleton, one crab would need forty-one joints.",
     "start": 128.864,
     "end": 135.049
    }
   ]
  },
  {
   "id": "curl",
   "start": 136.349,
   "voiceEnd": 157.5,
   "end": 158.8,
   "lines": [
    {
     "zh": "鱼越长，问题越明显：|鲨鱼急转弯时，像一块木板在转。",
     "en": "The longer the fish, the worse it looks:|a shark in a hard turn rotates like a plank.",
     "start": 136.349,
     "end": 141.697
    },
    {
     "zh": "他们给鲨鱼做了四个卷曲姿态，|按转弯的方向和力度在中间插值。",
     "en": "They gave the shark four curl poses,|blended by the direction and strength of the turn.",
     "start": 142.257,
     "end": 147.201
    },
    {
     "zh": "可混合变形是叠加的：|向左和向上同时卷，尾巴就被拉得太远。",
     "en": "But blendshapes add up:|curl left and up at once, and the tail is pulled much too far.",
     "start": 147.761,
     "end": 153.057
    },
    {
     "zh": "最后只好再加一个专门的斜向姿态，把尾巴拉回来。",
     "en": "So they added one more pose just for the diagonal, to pull the tail back.",
     "start": 153.717,
     "end": 157.5
    }
   ]
  },
  {
   "id": "school",
   "start": 158.8,
   "voiceEnd": 173.851,
   "end": 176.151,
   "lines": [
    {
     "zh": "至于每条鱼往哪儿游，就交给上一期的群体规则：|位置和速度存在纹理里，在 GPU 上更新。",
     "en": "Where each fish swims comes from last episode's flocking rules:|positions and velocities live in textures and update on the GPU.",
     "start": 158.8,
     "end": 166.414
    },
    {
     "zh": "七种鱼，七次绘制调用，一万零二百四十条鱼，|每一条都按自己的节奏在游。",
     "en": "Seven species, seven draw calls, ten thousand two hundred forty fish,|each swimming to its own rhythm.",
     "start": 167.074,
     "end": 173.851
    }
   ]
  },
  {
   "id": "bridge",
   "start": 176.151,
   "voiceEnd": 186.451,
   "end": 187.351,
   "lines": [
    {
     "zh": "每条鱼，就是一小份数据，|加上一段所有鱼共用的代码。",
     "en": "Every fish is a tiny bit of data,|plus one piece of code that all fish share.",
     "start": 176.151,
     "end": 180.441
    },
    {
     "zh": "把这个想法推广到游戏里的每一个对象，|就是下一期的主角：ECS。",
     "en": "Apply that idea to every object in a game,|and you get the star of the next episode: ECS.",
     "start": 181.001,
     "end": 186.451
    }
   ]
  },
  {
   "id": "final",
   "start": 187.351,
   "voiceEnd": 194.013,
   "end": 197.713,
   "lines": [
    {
     "zh": "下一期：从《守望先锋》到《僵尸世界大战》。",
     "en": "Next time: from Overwatch to World War Z.",
     "start": 187.351,
     "end": 191.07
    },
    {
     "zh": "而这一切，还得从一条鱼说起。",
     "en": "And all of it starts, once again, with a single fish.",
     "start": 191.33,
     "end": 194.013
    }
   ]
  }
 ]
};
