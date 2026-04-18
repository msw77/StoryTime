/**
 * Generate illustrations for classic stories using their scene descriptions.
 * Run with: node scripts/generate-classic-images.mjs
 *
 * Reads classic stories from src/data/classicStories2to4.ts (exported to JSON).
 * Uses the same Imagen 4 pipeline as the main app (fal.ts).
 * Saves image URLs into src/data/storyImages.json alongside existing entries.
 * Resumable — skips stories that already have the correct page count.
 */

import { fal } from "@fal-ai/client";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load env ────────────────────────────────────────────────────────
const envPath = join(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const falKey = envContent.match(/FAL_KEY=(.+)/)?.[1]?.trim();
if (!falKey) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}
fal.config({ credentials: falKey });

// ── Style directives (mirrors src/lib/fal.ts exactly) ───────────────
const STYLE_PREFIX = `Warm, friendly children's book illustration in soft watercolor style. Simple shapes, rounded edges, warm natural lighting. Gentle color palette with soft blues, greens, and warm yellows. No scary or dark elements. Characters have large, expressive eyes and friendly expressions. Style is consistent with a modern children's picture book for ages 2-8.`;

const TEXTLESS_SUFFIX = `STYLE: Wordless painted illustration. Purely visual storytelling through expressions, body language, color, and lighting. Every surface is smooth, clean, and unadorned. Walls are bare. All surfaces show only color, pattern, or texture — never anything readable. Silent scene. The entire image is a single cohesive painting with nothing overlaid. ABSOLUTELY NO TEXT of any kind — no words, no letters, no writing, no pseudo-text, no gibberish characters, no signage, no labels anywhere in the image. If letters are produced the image is a failure.

FRAMING: Full-bleed illustration that fills 100% of the canvas edge-to-edge. No decorative paper border, no deckle or torn paper edges, no vintage paper texture around the art, no matting, no frame, no vignette, no cream or beige margins around the illustration. The painted scene extends to every edge of the rectangular image. Do not render the illustration as a "page in a book" — just the illustration itself, corner-to-corner.

COMPOSITION: Single unified scene — one coherent painted illustration filling the canvas. DO NOT produce a split-panel or side-by-side composition. DO NOT render two separate scenes joined by a seam or divider. DO NOT split the image into multiple sub-panels or show the same scene from two angles. Each named character appears EXACTLY ONCE in the image — do NOT duplicate the same character twice in one scene. If the scene features Mowgli, there is only ONE Mowgli visible. If the scene features Pinocchio, there is only ONE Pinocchio visible. Applies to every character.`;

// ── Per-story anti-trademark + subject guards ───────────────────────
// These are injected AT THE TOP of the prompt (highest weight in the
// model) for stories where the initial Imagen 4 Fast pass produced
// systemic issues: Disney lookalikes, wrong-subject defaults, or
// dropped protagonists. Only present when regenerating — stories not
// in this dict use the plain prompt.
const STORY_GUARDS = {
  classic_rumpelstiltskin: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
The miller's daughter has AUBURN or CHESTNUT-BROWN hair worn in a simple loose braid over one shoulder. She wears a plain peasant dress in muted sage green, cream, or earth tones. She is NOT Elsa from Frozen. NOT platinum blonde. NOT in an icy purple or blue gown. NOT Disney styling.
Rumpelstiltskin is a small weathered gnome-like man with a grey beard, tattered brown leather clothes, and a worn red pointed cap. NOT a Disney dwarf. NOT Dopey. NOT cartoonish.
Setting is a dim medieval stone cottage or castle tower lit by candles or lantern.`,

  classic_pinocchio: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Pinocchio is a wooden marionette boy with visible natural wood grain on his face and limbs, joint-lines at shoulders and knees, and short dark carved hair. He wears a simple earth-toned peasant outfit: muted brown knee-breeches and a cream linen shirt. He does NOT wear a yellow feather cap. NOT red shorts. NOT a red bowtie. NOT a yellow collar. NOT Disney's Pinocchio styling.
The cricket (if shown) is a small green cricket sitting on a surface — NOT wearing a top hat, NOT carrying an umbrella, NOT anthropomorphized like Jiminy Cricket.
The fairy (if shown) is a kind older woman with soft grey-white hair in a flowing cream or muted lavender robe — NOT a young sparkly blue fairy, NOT Disney Blue Fairy.
Geppetto is an elderly woodcarver in a leather apron.`,

  classic_little_red_hen: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
The Little Red Hen IS a HEN — a red-feathered chicken. She stands upright on two scaly yellow legs. She has a red comb, orange beak, and bright expressive eyes. She is the PROTAGONIST of every single image — she must be prominently visible and recognizable as a chicken. NOT a human girl. NOT a human farmer. NOT a child in a red apron. Every scene centers on the HEN.
The cat, dog, and duck are also ANTHROPOMORPHIC ANIMALS standing upright — a grey tabby cat, a brown floppy-eared dog, a white duck. They are NOT humans.
Setting: a sunny farmyard with simple red barn, wheat field, or rustic cottage interior.`,

  classic_jungle_book: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Mowgli is a single Indian boy around 10 years old, with warm dark brown skin, tousled black hair, and big dark eyes. He wears a simple earth-toned cloth wrap around his waist. He is the SAME boy on every page — consistent age (~10), consistent skin tone, consistent hair. He is NOT a toddler. NOT two children. NOT a blonde child. NOT a pale-skinned child. NOT in modern clothes.
Baloo is a large friendly brown bear. Bagheera is a sleek black panther with amber eyes. Shere Khan is a large orange-black-striped tiger.
Setting is a lush Indian jungle — tall trees, vines, dappled green light.`,

  classic_rapunzel: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Rapunzel is a young woman with very long CHESTNUT BROWN hair (or deep auburn) worn in a thick single braid. Hair is long (reaches her waist or below) but NOT Disney Tangled blonde, NOT glowing, NOT platinum. She wears a simple medieval peasant gown in deep forest green, burgundy, or muted plum. NOT a shiny princess gown. NOT a purple Disney Tangled dress. NOT Disney styling.
The witch is a stern older woman in a long black or charcoal hooded cloak, NOT a cartoon witch with warts, NOT a Disney villain.
The prince is a young man in simple medieval clothes — muted brown and blue tunic and leather boots.
Setting: a tall stone tower surrounded by forest, or the witch's walled garden.`,

  classic_aladdin: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Aladdin is a slim young man with short dark hair and warm tan skin. He wears a LOOSE BEIGE LINEN TUNIC with a simple cloth belt, and plain linen trousers. He does NOT have a bare chest. NOT a purple vest. NOT a red fez. NOT a red sash. NOT Disney Aladdin's iconic styling.
The princess is a graceful young woman with dark hair in a simple coil, wearing a flowing TURQUOISE or DEEP EMERALD robe with modest coverage. NOT a pink gown with a crop top. NOT Jasmine styling. NOT Disney.
The genie is an ethereal amorphous figure of warm golden-orange light and smoke — NOT blue, NOT muscular, NOT with a hoop earring, NOT Disney Genie. Looks like swirling luminous vapor with a gentle face.
Setting: historical medieval Arabian city with mud-brick houses, arched doorways, market scenes — NOT the Disney Agrabah palace silhouette.`,

  classic_cinderella: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Cinderella is a young woman with CHESTNUT-BROWN curls (not blonde) and hazel eyes. In everyday scenes she wears a CREAM LINEN DRESS with a muted GREEN APRON and sometimes has ash smudges on her cheeks. At the ball she wears a SILVER-AND-ROSE gown with gold embroidery — NOT Disney pale blue, NOT a sparkly ballgown. She is always PRESENT in the scene — do NOT produce generic cartoon children on blank backgrounds.
Stepmother: a sharp-featured older woman in stiff dark grey or burgundy formal dress. Stepsisters Greta and Mina: two young women in fine pink and green gowns, somewhat vain expressions. Prince: a kind young man with sandy hair in a deep TEAL coat with gold trim. Two white doves appear in many scenes (from the hazel tree).
Every scene must clearly depict Cinderella or her stepfamily — NOT unnamed cartoon kids on white backgrounds.`,

  classic_rip_van_winkle: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Rip is an older man with a LONG GREY BEARD, wearing a rumpled brown coat, knee-breeches, and buckled shoes (colonial American, 1770s). In early scenes he is younger (~35, shorter beard). In post-sleep scenes his beard is long and white. He looks bewildered and bedraggled.
Setting: the Catskill Mountains (forested, misty peaks) OR a small Dutch-Colonial American village (timber houses, wooden signs without visible text). NOT a modern American flag. NOT a European alpine village. NOT a Heidi-style cottage.
The strange bowlers in the mountains are short old men in old-fashioned Dutch clothing bowling with a rumble of thunder.
This is NOT a Heidi story. NOT a grandfather-granddaughter reunion. There is NO blonde young girl as a central character.`,

  classic_secret_garden: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Mary Lennox is a thin 10-year-old girl with chestnut-brown straight hair and pale skin, wearing prim Victorian-era clothing — a dark green or dark blue wool dress with a white lace collar. She has a solemn, curious expression. She is the SAME girl on every page — consistent appearance.
Dickon is a cheerful 12-year-old boy with freckles and red-brown hair, in earth-toned rustic clothes. Colin is a pale dark-haired boy initially shown in a large Victorian bed (invalid), then later healthy and outdoors.
Setting: a grand grey stone English Victorian manor house (Misselthwaite), or the hidden walled garden with ivy and climbing roses.
This is NOT a Heidi story. NOT an Alpine setting. NOT a blonde girl with a bearded grandfather. NOT a modern cottage. Mary arrives in Yorkshire, England.`,

  classic_goldilocks: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Goldilocks MUST BE VISIBLY PRESENT AND PROMINENTLY FEATURED IN EVERY SCENE. She is the protagonist of the story — do NOT produce scenes showing only the three bears, do NOT show empty cottage interiors, do NOT omit her from any page. Every illustration must include Goldilocks as a clearly visible character, usually in the foreground or middleground.
Goldilocks: a small girl about 6-7 with LONG WAVY BLONDE HAIR (like spun gold) worn loose or in two simple braids. She wears a SIMPLE BLUE-AND-WHITE GINGHAM DRESS with a white apron/pinafore and plain brown shoes. SAME girl on every page — consistent long wavy blonde hair, consistent dress, consistent face. Do NOT render her with short hair, NOT with brown hair, NOT with a bob, NOT with overalls.
Papa Bear is a HUGE brown bear in a green or brown waistcoat. Mama Bear is medium brown in a cream apron. Baby Bear is small cinnamon-colored with a blue bowtie.
Setting: a tidy wooden forest cottage with three chairs (large/medium/small), three porridge bowls, three beds.`,

  classic_billy_goats_gruff: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Three billy goats, each distinct and CONSISTENT across every page:
- Little Goat: tiny, white, with small short horns, wide innocent eyes.
- Middle Goat: medium, tan/beige, with slightly curled horns.
- Big Goat: large, dark grey-brown, with impressive curled horns and a stern confident face.
Each goat keeps the SAME appearance on every page.
The Troll is a stocky grumpy creature with GREEN-GREY skin, a LARGE KNOBBY NOSE, wild dark hair, and a patched brown tunic. The SAME troll appears on every troll-page — do NOT vary his skin tone (not sometimes pale human, not sometimes human-shaped, not sometimes small gnome). Big and grumpy, but playful — not scary for young kids.
Setting: a wooden plank bridge over a gurgling stream, with grassy hillsides on both sides.`,

  classic_gingerbread_man: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
The Gingerbread Man is a TALL ANTHROPOMORPHIC gingerbread cookie figure with ARMS AND LEGS — he walks, runs, and gestures. Body: cinnamon brown baked-dough color with clear limb shapes. Face: smiling, with white icing details (round eyes, curving mouth, three icing buttons down the front, an icing bowtie). He is the SAME tall running figure on every page he appears — do NOT render him as a flat round cookie, NOT as a round cookie with stubby limbs, NOT as a different shape.
The Old Man is a kind bald grandfather in simple shirt and suspenders. The Old Woman is a kind grey-haired grandmother in a yellow apron. The Fox is a slim RED fox with a white belly and sly smile.
Setting: a rural country cottage, a dirt road lined with fields, a river crossing with the fox.`,

  classic_bremen_musicians: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Four anthropomorphic animal musicians who travel TOGETHER as a band — they must appear TOGETHER on almost every page:
- Donkey: large grey donkey, kind weary eyes.
- Dog: medium brown-and-white hound dog with floppy ears.
- Cat: orange tabby cat with green eyes.
- Rooster: colorful rooster with a red comb, black-green tail, white body.
These FOUR animals are the protagonists — every scene features them as a group. Do NOT replace them with human children. Do NOT show multiple of the same animal (ONE cat, ONE dog, ONE donkey, ONE rooster). Do NOT put humans in their place.
The robbers (when shown) are three burly medieval ruffians in rough cloaks — SCARY but cartoonish. They flee when the animals stack up and make their "music."
Setting: German countryside road, rustic cottage in the woods.`,

  classic_alice_wonderland: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Alice is a GIRL (NOT a boy) about 8-9 years old, with SHOULDER-LENGTH WAVY BROWN HAIR (NOT blonde, NOT red/auburn, NOT short-bob, NOT Disney's Alice). She wears a SIMPLE PALE YELLOW DRESS with a brown leather belt, black stockings, and black Mary-Jane shoes. SAME girl on every page — consistent brown hair, consistent yellow dress. NOT a boy. NOT Disney's blue-pinafore-white-apron Alice.
White Rabbit: a white fluffy anthropomorphic rabbit in a rumpled tweed waistcoat holding a gold pocket watch.
Cheshire Cat: a shadowy grey-striped cat with a huge grin and glowing green eyes (NOT pink/purple).
Mad Hatter: a lanky man in a tall green top hat and yellow-checkered suit with wild orange hair.
Queen of Hearts: a plump dramatic middle-aged woman in a flowing red-and-gold heart-printed gown with a tall golden crown. She is ANGRY but CARTOONISH — NOT Disney's Queen of Hearts. Her court consists of regular medieval-style guards in red tunics with simple heart emblems — NOT Disney-style stick-figure playing-card soldiers, NOT geometric card-suit formations, NOT the iconic Disney courtroom composition. Absolutely NO red splatter, NO violence, NO toppled/injured figures, NO scary poses. The scene should read as theatrical and slightly silly, not threatening.
Setting: dreamlike, surreal Wonderland — oversized mushrooms, giant flowers, checkerboard gardens, whimsical architecture.`,

  classic_pied_piper: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
The Pied Piper is a tall, mysterious man (NOT a modern person, NOT a clean-cut young adult) in a PATCHWORK MOTLEY CLOTH JACKET (bright reds, yellows, blues, greens in a harlequin/diamond pattern), a TALL PEAKED FELT HAT, and dark medieval hose. He holds a LONG WOODEN FLUTE. He is the SAME figure every page.
The setting is a MEDIEVAL GERMAN walled town (Hamelin) with timber-framed houses, cobbled streets, red-tiled roofs.
In the rat scenes: MANY BROWN RATS on the cobblestones following the piper.
In the children scenes: MANY CHILDREN in medieval clothes (simple tunics, linen dresses) following the piper.
Do NOT replace the children with modern toddlers. Do NOT set this in a modern bedroom or cottage. Every scene is medieval Hamelin.`,

  classic_snow_queen: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Gerda is a small girl about 7-8 with RED-AUBURN HAIR in two neat braids. Her OUTFIT VARIES BY SEASON/SCENE because her journey moves through many lands:
  - Winter scenes: red woolen coat with white fur trim, red mittens, brown boots.
  - Warm/summer scenes (river, garden, travelling): simple green or rust-colored cotton pinafore dress over a cream blouse; she has shed the coat.
  - Lapland scenes: warm fur-lined cloak.
SAME face, SAME red-auburn braids, SAME age across ALL pages regardless of outfit.
Kai is a small boy about 7-8 with BLOND hair, wearing a blue wool jacket, navy trousers, and brown boots. SAME boy every page. When enchanted, expression turns cold and blank; appearance otherwise unchanged.
The Snow Queen is a tall beautiful woman with icy pale skin, long flowing WHITE hair, a silver crown with icicles, and a long flowing WHITE fur-trimmed gown. Regal and cold in expression — NOT scary or evil-looking.
Setting: Scandinavian winter, summer cottage gardens, autumn forests, or ice palaces depending on the scene. Gerda is PROMINENT in every scene she's described in.`,

  classic_ugly_duckling: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
The protagonist is a GREY DUCKLING — a fluffy little DUCK chick, grey-feathered, slightly larger and messier than his yellow siblings, with oversized feet and big sad eyes. He is a DUCK, NOT a chicken, NOT a hen, NOT a human child. He is the SAME grey duckling on every page.
His siblings: small bright-yellow ducklings with orange beaks, around a mother duck (white duck with yellow beak).
In the final transformation: he has become a beautiful WHITE SWAN — graceful long neck, pure white feathers, orange beak, among other white swans.
Do NOT render the protagonist as a chicken. Do NOT render him as a human child. Setting: a farm pond, a reedy riverbank, an autumn lake, a spring pond with swans.`,

  classic_tortoise_hare: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Two animal protagonists only — NO humans in the scenes.
Hare: a tall slim brown-grey hare with long ears and a cocky confident expression. Wears a simple red sports scarf.
Tortoise: a dark-green shelled tortoise with a wrinkled face and a calm determined expression.
Other animals along the road (squirrels, birds, frogs, sheep) are welcome as spectators — but NO HUMAN CHILDREN or ADULTS. This is an animals-only story.`,

  classic_red_riding_hood: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Little Red Riding Hood: a small girl about 6-7 with dark-brown hair in two neat braids, wearing a BRIGHT RED hooded cloak over a simple cream peasant dress. She carries a wicker basket. SAME girl every page.
Wolf: a tall grey wolf with yellow eyes — playful big-bad-wolf energy, NOT frightening.
Grandmother: a kind elderly woman in a white nightcap and nightgown (when in bed) or a blue apron dress.
Woodsman: a strong bearded woodcutter with an axe, friendly expression.
Setting: a storybook forest path with tall pines, or grandmother's cozy cottage interior. NO modern clothes, NO modern settings.`,

  classic_enormous_turnip: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Old Farmer: a warm jolly elderly man with a grey beard, plaid shirt, brown overalls, straw hat. SAME farmer every page.
Old Wife: a cheerful elderly woman in a blue apron dress and white headscarf.
Granddaughter: a small girl about 7 in a yellow pinafore with brown braids.
Dog, Cat, Mouse: ordinary pets joining the pulling line — a brown-and-white dog, an orange tabby cat, a tiny grey mouse. Each animal appears EXACTLY ONCE per scene. The mouse is SMALL but visible.
The ENORMOUS TURNIP is huge, comically oversized — taller than the farmer. Purple-and-white striped.
Setting: rustic vegetable garden with wooden fence and farmhouse in the background.`,

  classic_thumbelina: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Thumbelina is a TINY girl no bigger than a thumb — miniature human with long golden hair, wearing a small pale-pink flower-petal dress. She is TINY relative to her surroundings (she is smaller than a rose, standing on a leaf, etc.). SAME girl every page.
The old woman (opening): a kind elderly woman in a brown shawl.
Toad: a warty brown-green toad, comic not scary.
Beetle: a glossy iridescent beetle.
Field mouse: a fat grey house-mouse in a little shawl.
Flower-prince: a tiny noble man-sized-to-Thumbelina with fine wings and pale-gold robes.
Setting: oversized flowers, leaves, and garden details — always emphasizing Thumbelina's tiny scale.`,

  classic_puss_in_boots: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Puss in Boots: a slim orange tabby cat standing upright on his hind legs, wearing SHINY BLACK KNEE-HIGH BOOTS, a feathered wide-brim hat, and a red or burgundy cape. Holds a drawstring sack (hunting bag) in one paw — when a bag is shown, PUSS IS HOLDING IT clearly, no headless or invisible carrier. SAME Puss every page: same boots, same hat, same cape.
Thomas (the miller's son, Puss's master): a young man in his early twenties with short brown hair. In the first pages he wears simple peasant clothes; after the river rescue he wears FINE NOBLE CLOTHES in emerald green with gold trim. Whenever Thomas is in a scene, he is CLEARLY VISIBLE and beside Puss where the story calls for it.
King: a jolly bearded royal man in a gold crown and purple robes.
Princess: a young woman with long dark hair in a simple elegant gown.
Ogre (the castle owner): a hulking large-nosed green-skinned humanoid ogre in a patched brown tunic. He is playfully scary, not horrifying.

TRANSFORMATION SCENES — special composition requirements:
- Ogre-to-Lion (p10): show the OGRE MID-TRANSFORMATION. The ogre is partially transformed with magical sparkles/light swirling around him — part of his body is already lion (mane, fur, paws) while the rest is still ogre. The transformation is IN PROGRESS and VISIBLE. Puss watches slyly. The image must show BOTH the fading ogre AND the emerging lion simultaneously as one transforming figure.
- Ogre-to-Mouse (p11): the ogre has SHRUNK dramatically with a puff of magical smoke, and a TINY grey mouse stands where he was. The disappearing ogre is shown as fading/faint in the background, with the mouse prominent in the foreground. EXACTLY ONE mouse, no duplicates. Puss poised to catch him.
- At the castle (p12): Puss stands BESIDE Thomas at the castle entrance welcoming the king's carriage. BOTH figures visible — Puss in boots + hat, Thomas in his fine noble emerald clothes, king arriving in an ornate carriage.

Setting: medieval European countryside, a river, a fine castle, a pastoral village.`,

  classic_wizard_oz: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Dorothy: a small girl about 9 with brown-red braids, wearing a PINK-AND-WHITE gingham dress and SILVER slippers (NOT blue gingham, NOT ruby slippers — the original Baum book specifies silver). SAME Dorothy every page.
Scarecrow: a straw-stuffed figure in rough burlap clothes with a painted face and floppy straw limbs.
Tin Man: a silver-grey tin woodsman with an axe and a cone-shaped helmet.
Cowardly Lion: a large golden lion with a bushy mane and a sad/timid expression.
Toto: a small black terrier dog.
Wizard: a stout older man with a white beard in simple rumpled clothes (once revealed behind the curtain) OR a flame-and-smoke projection (on his throne).
Wicked Witch: a stern older woman in a pointed black hat and long black cloak.
Glinda: a graceful woman in a shimmering pink gown with a tall crown.
Setting: the colorful Land of Oz — yellow brick road, Emerald City (green), fields of poppies, farmhouse on the Kansas plains.`,

  classic_robin_hood: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Robin Hood is a MALE character (not female, not a girl) — a young man in his mid-twenties with red-brown hair, a short beard, wearing FOREST GREEN medieval tunic and hose, soft leather boots, a bow over his shoulder and a feathered cap. SAME Robin every page — consistent hair, consistent green tunic.
Little John: a tall burly bearded man in brown leathers, holding a long wooden quarterstaff.
Friar Tuck: a round cheerful friar in brown robes with a rope belt and a tonsured haircut.
Maid Marian: a young woman with long brown hair in a simple green or burgundy medieval gown.
Sheriff of Nottingham: a stern grey-haired man in fine red-and-gold robes with a golden chain of office.
Merry Men: a band of outlaws in earth-toned medieval peasant clothes.
Setting: Sherwood Forest — tall oak trees, dappled sunlight, a rustic hideout. Or medieval Nottingham village with timber-framed houses. Robin MUST be VISIBLY PRESENT in every scene he's described in.`,

  classic_treasure_island: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Jim Hawkins is a BOY (NOT a girl) about 13 with unruly brown hair, wearing a plain linen shirt, brown knee-breeches, and leather boots. SAME boy every page — consistent brown hair, consistent outfit. NOT female. NOT blonde.
Long John Silver: a tall weathered pirate with LONG SILVER-GREY HAIR tied back, a rugged beard, a WOODEN PEG LEG (or crutch), and a PARROT on his shoulder. Wears a battered blue coat over a striped shirt. SAME Silver every page — the peg leg and parrot are his iconic markers.
Billy Bones: a grizzled old sailor with a scar down his cheek.
Captain Smollett: a stern upright officer in a navy coat with gold buttons.
Ben Gunn: a wild marooned man in tattered goat-skin clothes, not a modern-looking teen, not monstrous.
Setting: a coastal English inn (early scenes), a tall-masted sailing ship (voyage scenes), a tropical treasure island with palms and a stockade (later scenes). NO photorealistic imagery, NO modern styling. Soft watercolor throughout.`,

  classic_wind_willows: `CRITICAL CHARACTER DIRECTIVES — NON-NEGOTIABLE:
Four anthropomorphic ANIMAL protagonists — do NOT replace them with human children on any page.
Toad: a large GREEN TOAD in a yellow checked waistcoat, tweed cap, and spats — pompous and dramatic. SAME toad every page.
Mole: a small black-furred mole in a red scarf and waistcoat, round cheerful face.
Rat: a sleek brown WATER RAT in a striped boater hat and waistcoat, paddling in a small wooden rowboat in many scenes.
Badger: a large black-and-white striped badger in a dressing gown or formal waistcoat, wise and stern.
Setting: English Edwardian countryside along a river — willows, reeds, a canal, Toad Hall (a grand English manor house), a winding country road. NO modern children, NO modern bedrooms, NO modern clothing. Everything is circa 1905 rural England.`,
};

// Text sanitizer (mirrors src/lib/fal.ts)
function sanitize(text) {
  return text
    .replace(/["'"'\u201C\u201D\u2018\u2019][^"'"'\u201C\u201D\u2018\u2019]*["'"'\u201C\u201D\u2018\u2019]/g, "")
    .replace(/\b(saying|reading|that says|that reads|titled|labeled|written|writes|inscription)\b[^.,;]*/gi, "")
    .replace(/\b(the words?|the letters?|the name)\b[^.,;]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Per-story descriptor scrubbers — strip Disney-specific costume language
// from the scene text for trademark-heavy stories so it doesn't fight the
// anti-trademark guard directive. (The original fullPages were written
// against the pre-guard pipeline and sometimes describe the iconic
// Disney look directly.)
const STORY_SCRUBBERS = {
  classic_pinocchio: (text) =>
    text
      .replace(/\b(red\s+felt\s+cap|red\s+cap|yellow\s+feather[^,.;]*|feather(ed)?\s+cap|yellow\s+collar)[^,.;]*/gi, "simple earth-toned cap")
      .replace(/\b(patchwork\s+vest|red\s+bowtie|blue\s+bowtie|red\s+shorts?|green\s+shorts?)[^,.;]*/gi, "simple peasant clothes"),
  classic_rumpelstiltskin: (text) =>
    text
      .replace(/\b(platinum|icy\s+blonde|ice\s+blonde|ice-blonde|silver\s+blonde)[^,.;]*/gi, "auburn")
      .replace(/\b(icy\s+purple|icy\s+blue|frozen\s+style|elsa[-\s]style)[^,.;]*/gi, "earth-toned"),
  classic_aladdin: (text) =>
    text
      .replace(/\b(purple\s+vest|red\s+fez|bare[\s-]?chest(ed)?|red\s+sash)[^,.;]*/gi, "loose beige linen tunic")
      .replace(/\b(blue[\s-]?skinned?\s+genie|muscular\s+genie|hoop[\s-]?earring)[^,.;]*/gi, "amorphous glowing golden genie"),
  classic_cinderella: (text) =>
    text
      .replace(/\b(pale\s+blue\s+(ball\s*)?gown|powder\s+blue\s+dress|disney\s+blue)[^,.;]*/gi, "silver-and-rose ball gown")
      .replace(/\btiara[^,.;]*/gi, "simple pearl hairpin"),
  classic_rapunzel: (text) =>
    text
      .replace(/\b(long\s+blonde|blonde\s+hair|golden\s+hair|tangled[-\s]style|platinum\s+hair)[^,.;]*/gi, "long chestnut brown hair in a thick braid")
      .replace(/\bpurple\s+(gown|dress|princess)[^,.;]*/gi, "deep forest green peasant gown"),
};

// ── Parse classic stories from the TypeScript source ────────────────
// We can't import .ts directly in plain Node, so we do a quick regex
// extraction of the JSON-like data from the TS file.
function loadClassicStories(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  // Strip the TS wrapper: everything between the first [ and the last ]
  const match = raw.match(/export const \w+:\s*Story\[\]\s*=\s*(\[[\s\S]*\]);/);
  if (!match) throw new Error("Could not parse classic stories from " + filePath);
  // The data is already valid JSON (quoted keys, no trailing commas we hope)
  // Try JSON.parse; if it fails we'll eval in a safe-ish way
  try {
    return JSON.parse(match[1]);
  } catch {
    // Fallback: use Function constructor (no require/import access)
    // eslint-disable-next-line no-new-func
    return new Function("return " + match[1])();
  }
}

const CLASSIC_FILES = [
  join(__dirname, "..", "src", "data", "classicStories2to4.ts"),
  join(__dirname, "..", "src", "data", "classicStories4to7.ts"),
  join(__dirname, "..", "src", "data", "classicStories7to10.ts"),
];

// Gather all classic stories
const allStories = [];
for (const file of CLASSIC_FILES) {
  if (existsSync(file)) {
    const stories = loadClassicStories(file);
    allStories.push(...stories);
    console.log(`Loaded ${stories.length} stories from ${file.split(/[\\/]/).pop()}`);
  }
}

if (allStories.length === 0) {
  console.error("No classic stories found!");
  process.exit(1);
}

// ── Load existing image map ─────────────────────────────────────────
const OUTPUT_FILE = join(__dirname, "..", "src", "data", "storyImages.json");
let imageMap = {};
if (existsSync(OUTPUT_FILE)) {
  imageMap = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
  console.log(`Loaded existing image map: ${Object.keys(imageMap).length} stories`);
}

// ── CLI flags ───────────────────────────────────────────────────────
// --story=<id>            Only regenerate images for this one story
// --page=<n>              1-based page number to regenerate (requires --story)
// --pages=n1,n2,n3        Multiple 1-based page numbers (requires --story)
// --reference=<n>         1-based page number of a KNOWN-GOOD page in the same
//                         story to use as a character/style reference. Switches
//                         to nano-banana-2 edit mode so retries preserve the
//                         character look from the reference page.
// --force                 Overwrite existing images
const argv = process.argv.slice(2);
const STORY_FILTER = argv.find((a) => a.startsWith("--story="))?.split("=")[1] || null;
const PAGE_FILTER_RAW = argv.find((a) => a.startsWith("--page="))?.split("=")[1];
const PAGES_FILTER_RAW = argv.find((a) => a.startsWith("--pages="))?.split("=")[1];
const REFERENCE_RAW = argv.find((a) => a.startsWith("--reference="))?.split("=")[1];
const FORCE = argv.includes("--force");

// --page wins if both --page and --pages are set
let PAGE_FILTER_SET = null;
if (PAGE_FILTER_RAW) {
  PAGE_FILTER_SET = new Set([parseInt(PAGE_FILTER_RAW, 10) - 1]);
} else if (PAGES_FILTER_RAW) {
  PAGE_FILTER_SET = new Set(PAGES_FILTER_RAW.split(",").map((s) => parseInt(s.trim(), 10) - 1));
}
const REFERENCE_PAGE = REFERENCE_RAW ? parseInt(REFERENCE_RAW, 10) - 1 : null;

if (PAGE_FILTER_SET && !STORY_FILTER) {
  console.error("--page / --pages requires --story");
  process.exit(1);
}
if (REFERENCE_PAGE !== null && !STORY_FILTER) {
  console.error("--reference requires --story");
  process.exit(1);
}

const storiesToProcess = STORY_FILTER
  ? allStories.filter((s) => s.id === STORY_FILTER)
  : allStories;

if (STORY_FILTER && storiesToProcess.length === 0) {
  console.error(`No story matched --story=${STORY_FILTER}. Available ids:`);
  for (const s of allStories) console.error(`  ${s.id}`);
  process.exit(1);
}

// ── Generate ────────────────────────────────────────────────────────
const totalPages = storiesToProcess.reduce((sum, s) => sum + (s.fullPages?.length || 0), 0);
console.log(`\n${storiesToProcess.length} classic stor${storiesToProcess.length === 1 ? "y" : "ies"}, ${totalPages} total pages${FORCE ? " (force-regenerating)" : ""}`);
if (PAGE_FILTER_SET) console.log(`Targeting pages: ${[...PAGE_FILTER_SET].map((p) => p + 1).sort((a, b) => a - b).join(", ")}`);
// ── Model selection ────────────────────────────────────────────────
// --model=imagen4 (fast, cheap, weak IP adherence)
// --model=nano-banana-2 (slower ~45s/image, better IP adherence, softer watercolor)
const MODEL_ARG = argv.find((a) => a.startsWith("--model="))?.split("=")[1] || "nano-banana-2";
const MODEL_ID = MODEL_ARG === "imagen4" ? "fal-ai/imagen4/preview/fast" : "fal-ai/nano-banana-2";
const EDIT_MODEL_ID = "fal-ai/nano-banana-2/edit";
const COST_PER_IMAGE = MODEL_ARG === "imagen4" ? 0.04 : 0.08;

// Resolve reference URL (if --reference set) from the existing imageMap.
let REFERENCE_URL = null;
if (REFERENCE_PAGE !== null && STORY_FILTER) {
  REFERENCE_URL = imageMap[STORY_FILTER]?.[REFERENCE_PAGE] || null;
  if (!REFERENCE_URL) {
    console.error(`--reference=${REFERENCE_PAGE + 1}: no URL found for ${STORY_FILTER} page ${REFERENCE_PAGE + 1}`);
    process.exit(1);
  }
}

console.log(`Model: ${REFERENCE_URL ? EDIT_MODEL_ID + " (reference mode)" : MODEL_ID}`);
if (REFERENCE_URL) console.log(`Reference: ${STORY_FILTER} page ${REFERENCE_PAGE + 1}`);
console.log(`Estimated cost: ~$${(totalPages * COST_PER_IMAGE).toFixed(2)}`);
console.log("");

async function generateImage(scene, mood, storyId) {
  // Per-story anti-trademark guard goes at the TOP of the prompt so it
  // gets the highest attention weight. Only a handful of classics need
  // this — stories not in the dict get an empty guard.
  const guard = STORY_GUARDS[storyId] ? `${STORY_GUARDS[storyId]}\n\n` : "";
  const scrub = STORY_SCRUBBERS[storyId] || ((t) => t);
  const prompt = `${guard}${STYLE_PREFIX}\n\nScene: ${scrub(sanitize(scene))}\nMood: ${mood}\n\n${TEXTLESS_SUFFIX}`;

  // Reference-image mode: nano-banana-2 edit endpoint with the reference
  // URL passed as image_urls. Preserves character appearance from the
  // reference across the retry.
  if (REFERENCE_URL) {
    const refPrompt = `Using the supplied reference image for CHARACTER APPEARANCE (faces, hair, clothing, overall style), paint a NEW SCENE described below. Keep the character(s) visually identical to the reference. Do NOT copy the reference's composition — create a new composition for the new scene.\n\n${prompt}`;
    const result = await fal.subscribe(EDIT_MODEL_ID, {
      input: {
        prompt: refPrompt,
        image_urls: [REFERENCE_URL],
        num_images: 1,
        output_format: "png",
      },
    });
    const data = result.data;
    if (!data.images || data.images.length === 0) throw new Error("No image returned (edit mode)");
    return data.images[0].url;
  }

  const isNanoBanana = MODEL_ID === "fal-ai/nano-banana-2";
  const input = isNanoBanana
    ? {
        prompt,
        aspect_ratio: "16:9",
        num_images: 1,
        output_format: "png",
        safety_tolerance: 1,
        resolution: "1K",
      }
    : {
        prompt,
        aspect_ratio: "16:9",
        num_images: 1,
        output_format: "png",
      };

  const result = await fal.subscribe(MODEL_ID, { input });

  const data = result.data;
  if (!data.images || data.images.length === 0) {
    throw new Error("No image returned");
  }
  return data.images[0].url;
}

let completed = 0;
let skipped = 0;
let failedPages = 0;

for (const story of storiesToProcess) {
  const pages = story.fullPages || [];
  if (pages.length === 0) {
    console.log(`[SKIP] ${story.title} — no fullPages`);
    skipped++;
    continue;
  }

  // Skip if already done with correct page count — but only when the
  // caller isn't forcing a regen or targeting specific pages.
  if (
    !FORCE &&
    !PAGE_FILTER_SET &&
    imageMap[story.id] &&
    imageMap[story.id].length === pages.length
  ) {
    console.log(`[SKIP] ${story.title} — already has ${pages.length} images (use --force to regenerate)`);
    skipped++;
    continue;
  }

  console.log(`\n[${completed + skipped + 1}/${storiesToProcess.length}] ${story.title} (${pages.length} pages)...`);

  const pageImages = imageMap[story.id] || [];

  for (let i = 0; i < pages.length; i++) {
    // Skip pages outside the targeted set (if --page / --pages provided)
    if (PAGE_FILTER_SET && !PAGE_FILTER_SET.has(i)) continue;

    // Skip pages that already have an image (unless --force or targeted)
    if (pageImages[i] && !FORCE && !PAGE_FILTER_SET) {
      process.stdout.write(`  Page ${i + 1}/${pages.length} — already done\n`);
      continue;
    }

    const page = pages[i];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = await generateImage(page.scene, page.mood || "warm", story.id);
        pageImages[i] = url;
        process.stdout.write(`  Page ${i + 1}/${pages.length} ✓\n`);
        break;
      } catch (err) {
        if (attempt === 3) {
          console.error(`  Page ${i + 1}/${pages.length} FAILED after 3 attempts: ${err.message}`);
          pageImages[i] = null;
          failedPages++;
        } else {
          const wait = err.status === 429 ? 30000 : 5000 * attempt;
          console.log(`  Page ${i + 1} attempt ${attempt} failed, retrying in ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }

    // Small delay between pages
    await new Promise((r) => setTimeout(r, 500));
  }

  imageMap[story.id] = pageImages;
  completed++;

  // Save progress after each story
  writeFileSync(OUTPUT_FILE, JSON.stringify(imageMap, null, 2));
  console.log(`  ✓ Saved. (${completed} done, ${skipped} skipped, ${failedPages} page failures)`);

  // Pause between stories
  await new Promise((r) => setTimeout(r, 1000));
}

console.log("\n═══════════════════════════════════════");
console.log(`Done! Stories processed: ${completed}`);
console.log(`Stories skipped: ${skipped}`);
console.log(`Page failures: ${failedPages}`);
console.log(`Output: ${OUTPUT_FILE}`);
