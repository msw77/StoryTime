// ─── STORY ENGINE (cohesive 6-page arcs) ─────────────────────────────────────
// Extracted from StoryTime.jsx prototype

import { DURATIONS } from "@/data/genres";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoryInput {
  heroName: string;
  heroType: string;
  obstacle: string;
  genre: string;
  age: string;
  lesson: string;
  duration: string;
}

export interface GeneratedStory {
  title: string;
  emoji: string;
  pages: [string, string][];
  duration: string;
}

interface StoryContext {
  name: string;
  type: string;
  setting: string;
  friend: string;
  obstacle: string;
  lesson: string;
}

interface World {
  settings: string[];
  friends: string[];
  emojis: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ─── WORLDS ──────────────────────────────────────────────────────────────────

const WORLDS: Record<string, World> = {
  adventure: {
    settings: [
      "a hidden canyon beyond the old bridge",
      "a mysterious island at the edge of the sea",
      "a forest where the trees grew tall enough to hide the sky",
      "a mountain nobody in town had ever climbed",
    ],
    friends: [
      "a scruffy trail dog named Patches",
      "a retired sailor who knew every star",
      "a clever crow who collected shiny objects",
      "a park ranger named Jo who always carried rope",
    ],
    emojis: ["🗺️", "🏔️", "⚓", "🧭"],
  },
  fantasy: {
    settings: [
      "an enchanted garden where the flowers hummed melodies",
      "a crystal cave beneath a sleeping volcano",
      "a floating castle held aloft by giant butterflies",
      "a forest where every tree had a kind old face",
    ],
    friends: [
      "a tiny dragon no bigger than a kitten",
      "a cloud sprite who loved to change shape",
      "a talking fox with a silver-tipped tail",
      "a friendly witch who grew spells in flowerpots",
    ],
    emojis: ["✨", "🧙", "🐉", "🌙"],
  },
  friendship: {
    settings: [
      "a neighborhood full of tall trees and wide front porches",
      "a summer camp beside a clear blue lake",
      "a small school where everyone knew each other",
      "a community garden at the end of Maple Street",
    ],
    friends: [
      "the quiet kid who always sat by the window",
      "a neighbor who had just arrived from far away",
      "a classmate who always shared her lunch",
      "an older kid who remembered what it felt like to be new",
    ],
    emojis: ["🤝", "💛", "🏡", "🌻"],
  },
  silly: {
    settings: [
      "a town where the rules changed every Tuesday",
      "a kitchen where the food had strong opinions",
      "a school where the class pet was the principal",
      "a park where the swings told jokes",
    ],
    friends: [
      "a goat who was convinced it was a dog",
      "a talking sock named Gerald",
      "a squirrel with no sense of direction",
      "a grandma who secretly won a wrestling championship",
    ],
    emojis: ["🤪", "😂", "🙃", "🎪"],
  },
  mystery: {
    settings: [
      "an old library with a room that was always locked",
      "a quiet street where small things kept vanishing",
      "a school where the hallways seemed to rearrange overnight",
      "a grandparent's house full of hidden compartments",
    ],
    friends: [
      "a sharp-eyed classmate who noticed every detail",
      "a curious cat who always found trouble",
      "a retired detective who lived two doors down",
      "a younger sibling who asked exactly the right questions",
    ],
    emojis: ["🔍", "🕵️", "📝", "🗝️"],
  },
  science: {
    settings: [
      "a backyard that doubled as a laboratory",
      "a nature trail full of surprising creatures",
      "a kitchen table covered with experiments",
      "a hilltop where the stars seemed close enough to touch",
    ],
    friends: [
      "a science teacher who made everything exciting",
      "a grandmother who used to be an engineer",
      "a neighbor kid who loved building things",
      "a little sibling who asked why about everything",
    ],
    emojis: ["🔬", "🧪", "🌱", "🔭"],
  },
  animals: {
    settings: [
      "a wide meadow at the edge of a deep forest",
      "a coral reef bursting with color",
      "a tall oak tree that sheltered dozens of creatures",
      "a small farm where the animals looked out for each other",
    ],
    friends: [
      "a brave little mouse with a big heart",
      "a wise old tortoise who never rushed",
      "a cheerful bluebird who carried messages",
      "a gentle bear who was startled by loud sounds",
    ],
    emojis: ["🐾", "🦊", "🐻", "🐦"],
  },
  sports: {
    settings: [
      "a neighborhood where every kid played outside after school",
      "a small-town league where everybody got a chance",
      "a community center with a gym full of echoes and energy",
      "a backyard that became a stadium every Saturday",
    ],
    friends: [
      "a coach who believed in every player",
      "an older kid who remembered being the youngest",
      "a teammate who always knew when to pass",
      "a parent in the bleachers who cheered for everyone",
    ],
    emojis: ["⚽", "🏀", "🏊", "🚲"],
  },
};

// ─── ARCS (5 story arc templates) ────────────────────────────────────────────

type ArcFn = (ctx: StoryContext) => string[];

const ARCS: ArcFn[] = [
  ({ name, type, setting, friend, obstacle, lesson }) => [
    `${name} the ${type} had explored the same neighborhood a hundred times — every alley, every fence, every crack in the sidewalk. But one morning, while walking near ${setting}, ${name} noticed something strange: a narrow path, half-hidden by tall grass, winding away into shadow.`,
    `Curiosity won. ${name} followed the path downhill through wildflowers and over a stream so clear you could count every pebble on the bottom. The trail ended at ${setting}, and it was more beautiful than anything ${name} had ever seen. Warm light filtered through the air, and every sound felt hushed.`,
    `${name} wasn't alone for long. ${friend} stepped out from behind a mossy boulder, eyes wide. "You found it too?" they whispered. ${name} nodded, and in that quiet moment a partnership was born. They spent the afternoon exploring together, trading guesses about how this place came to be.`,
    `Then things went wrong. ${obstacle}. What had felt magical now felt fragile, like a soap bubble about to pop. ${name}'s chest tightened. Walking away would have been the easy choice. Going home, closing the door, pretending none of this had happened.`,
    `But ${name} chose differently. Standing beside ${friend}, ${name} decided to ${lesson.toLowerCase()}, even though it was frightening. They tried one approach that didn't work, then another that almost made things worse. On the third try, something clicked. Slowly, carefully, the pieces fell back into place.`,
    `The sun was low when they finally sat down, exhausted and grinning. "Same time tomorrow?" ${friend} asked. ${name} laughed. They had discovered more than a hidden place — they had learned what it truly means to ${lesson.toLowerCase()}, and that lesson felt worth keeping forever.`,
  ],
  ({ name, type, setting, friend, obstacle, lesson }) => [
    `It was supposed to be an ordinary afternoon. ${name} the ${type} was heading home, thinking about nothing special, when a small sound stopped everything. It came from near ${setting} — a worried, unsteady sound, like someone trying hard not to ask for help.`,
    `${name} found ${friend} sitting alone, looking completely overwhelmed. "What happened?" ${name} asked, sitting down nearby. ${friend} hesitated, then explained: ${obstacle}. It was the kind of problem that feels enormous when you face it alone.`,
    `${name} didn't have to stay. It wasn't ${name}'s problem. But something quiet and stubborn inside wouldn't allow walking away. "I'm not sure I can fix this," ${name} admitted, "but I'd like to try. Two people thinking is better than one person worrying."`,
    `At first they made real progress, working side by side with growing confidence. Then the situation shifted. A complication nobody predicted turned their plan upside down. ${friend} slumped. "Maybe I should just give up," ${friend} whispered.`,
    `${name} sat down and thought carefully while the silence stretched out. Then an idea surfaced — simpler than the first plan but steadier. It meant starting over. It meant choosing to ${lesson.toLowerCase()} when everything felt like it was falling apart. They looked at each other, nodded, and began again.`,
    `When the last piece fell into place, ${friend} stared at ${name}. "You didn't have to do any of that." ${name} smiled. "I know. But I think that's the whole point." They walked home together as the streetlights flickered on, talking and laughing like people do after they've been through something real together.`,
  ],
  ({ name, type, setting, friend, obstacle, lesson }) => [
    `Plenty of people told ${name} the ${type} it couldn't be done. Too difficult, too unlikely, too ambitious. But ${name} had a feeling lodged deep inside — a stubborn, glowing feeling that refused to leave. The goal was clear, and it started at ${setting}.`,
    `Preparation became ${name}'s daily routine. Early mornings, late afternoons, and long stretches of thinking before sleep. A small notebook tracked every bit of progress. Some days the entries were encouraging. Others just read: "Tried. Failed. Will try differently tomorrow."`,
    `Then ${friend} showed up. At first they just watched quietly. After a few days, ${friend} said, "You've been doing the hardest part wrong. Want me to show you something?" It was a small adjustment, but it changed everything. Suddenly, things that had seemed impossible felt within reach.`,
    `The real test arrived. ${name} stood at ${setting}, heart pounding. Then it happened — ${obstacle}. The worst possible timing. Every doubt ${name} had ever pushed aside came rushing back at once. This was the moment where most people would stop.`,
    `${friend} appeared at ${name}'s side. Not with a speech — just with steady eyes and four words: "Remember why you started." ${name} closed both eyes, breathed in slowly, and let go of the fear. Then ${name} chose to ${lesson.toLowerCase()}, right there, with everything on the line.`,
    `It wasn't perfect. It was ragged and real and hard-won. But it was enough. ${friend} broke into a grin. That night, ${name} opened the notebook to the last page and wrote: "Today I learned that ${lesson.toLowerCase()} isn't something you wait to feel ready for. You just do it, and the readiness follows."`,
  ],
  ({ name, type, setting, friend, obstacle, lesson }) => [
    `It started with something small. ${name} the ${type} noticed that things around ${setting} were slightly off — an object moved, a sound at an odd hour, a mark on the ground that wasn't there before. Other people walked past without a second glance. But ${name} kept watching.`,
    `By the end of the first week, ${name} had filled half a notebook with observations. Times, dates, details. A pattern was forming: whatever was happening repeated at the same hour each day. ${name} circled the time on the page, underlined it twice, and made a plan.`,
    `That's how ${friend} got pulled in. "Why are you hiding behind a bench with a flashlight?" ${friend} asked one evening. After an embarrassed pause, ${name} explained everything. ${friend}'s expression shifted from amused to fascinated. "I noticed something strange too," ${friend} admitted.`,
    `They pooled their clues and followed the trail deeper. It led somewhere unexpected, and then — ${obstacle}. Everything they thought they understood flipped upside down. The mystery was layered, tangled, and more interesting than either of them had guessed.`,
    `They hit a dead end that felt final. ${name} almost agreed to give up. But then ${name} remembered a detail from the very first day — something so small it had been overlooked. "Wait," ${name} said, flipping back through the notebook. The final piece clicked into place. Solving it required them to ${lesson.toLowerCase()}, and they did.`,
    `The answer was not frightening — it was wonderful. Something hidden in plain sight, waiting for someone patient enough to find it. ${name} and ${friend} sat together afterward, satisfied and tired. "You know what made the difference?" ${friend} said. ${name} already knew: choosing to ${lesson.toLowerCase()}, even when looking away would have been easier.`,
  ],
  ({ name, type, setting, friend, obstacle, lesson }) => [
    `${name} the ${type} woke one morning with a restless feeling, like a compass needle spinning toward something not yet visible. There was a place — ${setting} — that ${name} had heard about but never seen. It was far, and the way was uncertain. But the pull was strong, so ${name} packed a bag and started walking.`,
    `The first stretch was pure joy. Fresh air, open road, unfamiliar birdsong. Everything felt possible. ${name} noticed details that would have blurred past from a car window: the way light changed as clouds drifted, the smell of warm earth after rain, the quiet hum of the world going about its business.`,
    `The excitement faded by afternoon, replaced by sore feet and creeping loneliness. That's when ${friend} appeared, walking the same road. "Traveling alone?" ${friend} asked. ${name} nodded. "Me too," ${friend} said. "How about we travel alone together?" They shared lunch, traded stories, and the miles seemed to shrink.`,
    `The partnership was tested sooner than expected. ${obstacle}. The way forward was blocked, and going backward meant losing all their progress. ${name} felt a hot rush of frustration — fists clenched, jaw tight. All that effort, and now this.`,
    `${friend} asked a quiet question: "What do you think we should try?" Something about the simplicity of it cleared the fog. ${name} realized the solution required choosing to ${lesson.toLowerCase()} — truly, not just in words. It meant letting go of the original plan and trusting a new one. They did it, and slowly the way opened.`,
    `${setting} was everything ${name} had imagined and more. But standing there, looking back over the ground they'd covered, ${name} realized the destination wasn't really the point. The point was every stumble, every choice to keep going when stopping felt safer. "Was it worth it?" ${friend} asked. ${name} didn't hesitate. "Every single step."`,
  ],
];

// ─── Age Adaptation ──────────────────────────────────────────────────────────

function adaptForAge(pages: string[], age: string): [string, string][] {
  if (age === "7-10")
    return pages.map((p, i) => [`Page ${i + 1}`, p] as [string, string]);
  if (age === "4-7")
    return pages.map((p, i) => {
      const s = p.match(/[^.!?]+[.!?]+/g) || [p];
      return [`Page ${i + 1}`, s.slice(0, Math.min(s.length, 4)).join(" ").trim()] as [string, string];
    });
  // age 2-4
  return pages.map((p, i) => {
    const s = p.match(/[^.!?]+[.!?]+/g) || [p];
    return [`Page ${i + 1}`, s.slice(0, 2).join(" ").trim()] as [string, string];
  });
}

// ─── EXPANSIONS ──────────────────────────────────────────────────────────────

type ExpansionFn = (ctx: StoryContext) => string;

const EXPANSIONS: Record<string, ((ctx: StoryContext) => string)[]> = {
  atmosphere: [
    ({ setting }) =>
      `The air around ${setting} carried a feeling that was hard to name — something between excitement and wonder. Every shadow held a secret, and every sound seemed to mean something.`,
    ({ setting }) =>
      `${setting} looked different depending on where you stood. From one angle, everything seemed peaceful. From another, you could sense that something was about to change.`,
    ({ setting }: StoryContext) =>
      `Time seemed to move differently here. Minutes stretched out like hours, and every small detail felt important — the way light fell, the sound of footsteps, the weight of silence between words.`,
  ],
  character: [
    ({ name, type, friend }) =>
      `${name} paused and looked at ${friend}. There was something in ${friend}'s expression — not quite worry, not quite excitement. Something in between. "Are you sure about this?" ${name} asked. ${friend} nodded slowly. "No. But I think that's okay."`,
    ({ name, type, friend }) =>
      `They stopped to rest. ${name} the ${type} sat quietly for a moment, thinking about everything that had happened so far. It was strange how one decision could change a whole day — maybe even a whole life.`,
    ({ name, type, friend }) =>
      `${friend} told ${name} a story while they walked. It was about someone who had faced something similar a long time ago. "How did it end?" ${name} asked. ${friend} smiled. "I think we're about to find out."`,
  ],
  tension: [
    ({ name, obstacle }) =>
      `Just when things seemed to be getting easier, a new problem appeared. It wasn't as big as ${obstacle}, but it was tricky in its own way. ${name} took a deep breath. One challenge at a time.`,
    ({ name, obstacle }) =>
      `${name}'s hands were shaking — not from fear exactly, but from the effort of holding everything together. Some moments test what you're made of, and this was one of them.`,
    ({ name, obstacle }) =>
      `There was a moment when everything went completely quiet. The kind of quiet that comes right before something important happens. ${name} could feel it in the air. Something was about to change.`,
  ],
  resolution: [
    ({ name, friend, lesson }) =>
      `${friend} put a hand on ${name}'s shoulder. They didn't need to say anything — the look they shared said it all. They had done something that mattered, and they both knew it.`,
    ({ name, friend, lesson }) =>
      `Walking back, ${name} noticed things that hadn't been visible before — small, beautiful details hidden in plain sight. It was as if the whole world looked slightly different now. Brighter, somehow.`,
    ({ name, friend, lesson }) =>
      `${name} thought about what ${lesson.toLowerCase()} really meant. It wasn't just a nice idea you hear in a story. It was something you feel in your bones after you've actually lived it.`,
  ],
};

// ─── Main Generator ──────────────────────────────────────────────────────────

export function generateStoryOffline({
  heroName,
  heroType,
  obstacle,
  genre,
  age,
  lesson,
  duration,
}: StoryInput): GeneratedStory {
  const name = heroName || "Sunny";
  const type = heroType || "kid";
  const w = WORLDS[genre] || WORLDS.adventure;
  const setting = pick(w.settings);
  const friend = pick(w.friends);
  const emoji = pick(w.emojis);
  const obs =
    obstacle ||
    pick([
      "a sudden storm rolled in and blocked the way forward",
      "the path split in three directions with no signs",
      "everything they had carefully built came tumbling down",
      "the one thing they needed most turned out to be missing",
      "a misunderstanding turned a friend into a stranger",
    ]);
  const les = lesson || "be brave";
  const ctx: StoryContext = { name, type, setting, friend, obstacle: obs, lesson: les };

  // Get base 6-page arc
  const baseArc = pick(ARCS)(ctx);

  // Determine target page count from duration
  const dur = DURATIONS.find((d) => d.id === duration) || DURATIONS[0];
  const wordsPerPage = age === "2-4" ? 18 : age === "4-7" ? 45 : 70;
  const targetPages = Math.max(6, Math.round(dur.targetWords / wordsPerPage));

  let rawPages: string[];

  if (targetPages <= 6) {
    // Short story — use arc as-is
    rawPages = baseArc;
  } else if (targetPages <= 12) {
    // Medium — expand each beat with an atmosphere/character page between
    rawPages = [];
    for (let i = 0; i < baseArc.length; i++) {
      rawPages.push(baseArc[i]);
      if (i < baseArc.length - 1 && rawPages.length < targetPages) {
        const expType =
          i < 2 ? "atmosphere" : i < 4 ? "character" : i < 5 ? "tension" : "resolution";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }
  } else {
    // Long/Epic — chain two arcs with expansions between
    const secondArc = pick(ARCS.filter((a) => a !== ARCS[0]))(ctx);
    rawPages = [];

    // First arc with expansions
    for (let i = 0; i < baseArc.length; i++) {
      rawPages.push(baseArc[i]);
      if (rawPages.length < targetPages && i < baseArc.length - 1) {
        const expType = i < 2 ? "atmosphere" : i < 4 ? "character" : "tension";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }

    // Bridge between arcs
    rawPages.push(
      `But the story wasn't over yet. Just when ${name} thought everything was settled, something new appeared on the horizon. ${friend} noticed it first. "Look," ${friend} said quietly, pointing. ${name} turned, and felt that familiar tingle — the one that means a new chapter is about to begin.`
    );

    // Second arc with expansions
    for (let i = 0; i < secondArc.length; i++) {
      rawPages.push(secondArc[i]);
      if (rawPages.length < targetPages && i < secondArc.length - 1) {
        const expType = i < 2 ? "atmosphere" : i < 4 ? "tension" : "resolution";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }

    // Pad with resolution expansions if still short
    while (rawPages.length < targetPages) {
      rawPages.push(pick(EXPANSIONS.resolution)(ctx));
    }
  }

  // Trim to target if we overshot
  rawPages = rawPages.slice(0, targetPages);

  const pages = adaptForAge(rawPages, age);
  const title = pick([
    `${name} and the ${pick(["Secret of", "Path Through", "Heart of"])} ${setting
      .split(",")[0]
      .replace(/^a |^an |^the /i, "")
      .trim()}`,
    `The ${pick(["Day", "Moment"])} ${name} ${pick([
      "Changed Everything",
      "Found the Way",
      "Became Unstoppable",
    ])}`,
    `${name}'s ${pick(["Greatest", "Bravest", "Most Incredible"])} ${pick([
      "Adventure",
      "Journey",
      "Day",
    ])}`,
  ]);

  return { title, emoji, pages, duration: dur.id };
}
