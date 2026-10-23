window.TIMELINE = {
 "duration": 160.274,
 "scenes": [
  {
   "id": "intro",
   "start": 0.0,
   "voiceEnd": 19.161,
   "end": 20.861,
   "lines": [
    {
     "zh": "一把剑，悬在她的指尖前。",
     "en": "One sword hovers at her fingertips.",
     "start": 0.9,
     "end": 3.298
    },
    {
     "zh": "剑诀一起，第二把、第一百把、|第一万把，从云海里升起来。",
     "en": "She forms the seal, and a second, a hundredth,|a ten-thousandth sword rise out of the clouds.",
     "start": 4.958,
     "end": 11.863
    },
    {
     "zh": "一万把剑，每一把都要飞、要躲、要出手。|游戏要怎么算？",
     "en": "Ten thousand swords, and every one has to fly, dodge and strike.|How does a game compute that?",
     "start": 13.123,
     "end": 19.161
    }
   ]
  },
  {
   "id": "title",
   "start": 20.861,
   "voiceEnd": 25.637,
   "end": 27.737,
   "lines": [
    {
     "zh": "终章，我们把前四期的招式，合成一套御剑术。",
     "en": "For the finale, we combine the moves of the last four episodes into one art of sword flight.",
     "start": 20.861,
     "end": 25.637
    }
   ]
  },
  {
   "id": "flock",
   "start": 27.737,
   "voiceEnd": 46.61,
   "end": 48.11,
   "lines": [
    {
     "zh": "剑群的飞行，就是第一期的鸟群算法。",
     "en": "The swords fly with the flocking algorithm from episode one.",
     "start": 27.737,
     "end": 30.74
    },
    {
     "zh": "每把剑只看身边最近的几把：|太近就分开，方向和同伴对齐，|再加一股绕着她旋转的力。",
     "en": "Each sword looks only at its nearest few:|too close, move apart; match your neighbours' heading;|and add one more force that circles around her.",
     "start": 31.3,
     "end": 38.901
    },
    {
     "zh": "三条局部规则，就转出了一道升天的剑旋风。|找邻居，用的还是那张空间网格。",
     "en": "Three local rules spin up a whirlwind of swords.|Neighbours are still found with the same spatial grid.",
     "start": 39.561,
     "end": 46.61
    }
   ]
  },
  {
   "id": "ecs",
   "start": 48.11,
   "voiceEnd": 71.773,
   "end": 73.073,
   "lines": [
    {
     "zh": "敌人来了：六千把赤红飞剑。",
     "en": "Then the enemy arrives: six thousand crimson swords.",
     "start": 48.11,
     "end": 50.813
    },
    {
     "zh": "每把剑都是一个实体：|位置、速度、角色、目标、弯曲，|各存一列数组。",
     "en": "Every sword is an entity:|position, velocity, role, target, bend,|each stored as its own array column.",
     "start": 51.873,
     "end": 60.136
    },
    {
     "zh": "角色系统分配任务：|有的直取敌人本体，有的去截击来剑，|剩下的在她身前结成剑盾。",
     "en": "A role system hands out jobs:|some go straight for the enemy, some intercept incoming swords,|and the rest form a shield in front of her.",
     "start": 60.696,
     "end": 68.272
    },
    {
     "zh": "每一帧，系统挨个扫过这些数组。",
     "en": "Each frame, the systems sweep through those arrays one by one.",
     "start": 68.832,
     "end": 71.773
    }
   ]
  },
  {
   "id": "bend",
   "start": 73.073,
   "voiceEnd": 92.223,
   "end": 93.723,
   "lines": [
    {
     "zh": "两把剑相撞时，碰撞系统算出撞击的方向和力度，|写进弯曲组件。",
     "en": "When two swords collide, the collision system works out the direction and force of the hit|and writes them into the bend component.",
     "start": 73.073,
     "end": 78.606
    },
    {
     "zh": "真正把剑压弯的是顶点着色器：|越靠近剑尖弯得越多，|再叠一段衰减的正弦，就是撞击后的颤动。",
     "en": "The bending itself happens in the vertex shader:|the closer to the tip, the more it bends,|and a decaying sine wave on top is the ringing after the hit.",
     "start": 79.266,
     "end": 87.914
    },
    {
     "zh": "和第二期《ABZÛ》让鱼身摆动，是同一招。",
     "en": "It's the same trick ABZÛ uses to make a fish's body swim, from episode two.",
     "start": 88.474,
     "end": 92.223
    }
   ]
  },
  {
   "id": "gpu",
   "start": 93.723,
   "voiceEnd": 109.6,
   "end": 110.9,
   "lines": [
    {
     "zh": "一万六千把剑，CPU 每帧只上传位置、方向和弯曲，|每把六十四个字节。",
     "en": "Sixteen thousand swords: each frame the CPU uploads only position, direction and bend,|sixty-four bytes per sword.",
     "start": 93.723,
     "end": 100.132
    },
    {
     "zh": "剑尖朝哪、剑身怎么转，|交给顶点着色器去算。",
     "en": "Which way the tip points and how the blade turns|are left to the vertex shader.",
     "start": 100.692,
     "end": 104.929
    },
    {
     "zh": "所有剑一次绘制，剑光和火花各再加一次。",
     "en": "All the swords take one draw call, plus one each for the trails and the sparks.",
     "start": 105.489,
     "end": 109.6
    }
   ]
  },
  {
   "id": "climax",
   "start": 110.9,
   "voiceEnd": 122.755,
   "end": 124.655,
   "lines": [
    {
     "zh": "她剑诀前推。",
     "en": "She drives the seal forward.",
     "start": 110.9,
     "end": 111.978
    },
    {
     "zh": "一万把剑同时转向，汇成一条剑河，|击碎对方的护体剑气。",
     "en": "Ten thousand swords turn at once, merging into a river of blades|that shatters the enemy's guarding aura.",
     "start": 113.638,
     "end": 118.82
    },
    {
     "zh": "被打弯的红剑，一把把坠进云海。",
     "en": "The bent red swords drop, one by one, into the sea of clouds.",
     "start": 119.88,
     "end": 122.755
    }
   ]
  },
  {
   "id": "recall",
   "start": 124.655,
   "voiceEnd": 131.511,
   "end": 133.211,
   "lines": [
    {
     "zh": "收剑。",
     "en": "Sheathe.",
     "start": 124.655,
     "end": 125.274
    },
    {
     "zh": "弯掉的剑在归途上慢慢回直，|每一把都回到它出发的位置。",
     "en": "On the way back, the bent swords slowly straighten,|and each one returns to exactly where it set out.",
     "start": 127.134,
     "end": 131.511
    }
   ]
  },
  {
   "id": "outro",
   "start": 133.211,
   "voiceEnd": 155.974,
   "end": 160.274,
   "lines": [
    {
     "zh": "五期下来：局部规则、空间网格、|实例化和顶点动画、数据和逻辑分开，|再把能算的交给 GPU。",
     "en": "Five episodes: local rules, a spatial grid,|instancing and vertex animation, data kept apart from logic,|and everything computable handed to the GPU.",
     "start": 133.211,
     "end": 142.402
    },
    {
     "zh": "一只鸟、一条鱼、一个僵尸、一块板、一把剑，|变成一万个，用的是同一套办法。",
     "en": "A bird, a fish, a zombie, a panel, a sword:|turning one into ten thousand takes the same set of moves.",
     "start": 143.062,
     "end": 152.116
    },
    {
     "zh": "而这一切，都从一把剑开始。",
     "en": "And all of it begins with a single sword.",
     "start": 153.176,
     "end": 155.974
    }
   ]
  }
 ]
};
