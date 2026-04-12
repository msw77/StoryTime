import { useState, useEffect, useRef, useCallback } from "react";

const GENRES = [
  { id: "all", label: "All", emoji: "📖", color: "#6366f1" },
  { id: "adventure", label: "Adventure", emoji: "🗺️", color: "#ef4444" },
  { id: "fantasy", label: "Fantasy", emoji: "🧙", color: "#a855f7" },
  { id: "friendship", label: "Friendship", emoji: "🤝", color: "#f59e0b" },
  { id: "silly", label: "Silly", emoji: "🤪", color: "#22c55e" },
  { id: "mystery", label: "Mystery", emoji: "🔍", color: "#6366f1" },
  { id: "science", label: "Science", emoji: "🔬", color: "#06b6d4" },
  { id: "animals", label: "Animals", emoji: "🐾", color: "#f97316" },
  { id: "sports", label: "Sports", emoji: "⚽", color: "#14b8a6" },
];
const AGE_GROUPS = [
  { id: "2-4", label: "🌱 Ages 2–4" },
  { id: "4-7", label: "⭐ Ages 4–7" },
  { id: "7-10", label: "📚 Ages 7–10" },
];
const BUILDER_GENRES = GENRES.filter(g => g.id !== "all");
const LESSONS = ["Be brave","Be kind","Work together","Never give up","Be honest","Share with others","Believe in yourself","Try new things","Be a good friend","Respect nature","Write my own…"];
const HERO_TYPES = ["👧 Girl","👦 Boy","🐱 Cat","🐶 Dog","🐰 Bunny","🦄 Unicorn","🐻 Bear","🤖 Robot","🧚 Fairy","🐉 Dragon"];

const DURATIONS = [
  { id: "3", label: "🌙 Quick", desc: "~3 min", minutes: 3, targetWords: 400 },
  { id: "5", label: "⭐ Short", desc: "~5 min", minutes: 5, targetWords: 650 },
  { id: "10", label: "📖 Medium", desc: "~10 min", minutes: 10, targetWords: 1300 },
  { id: "15", label: "🌟 Long", desc: "~15 min", minutes: 15, targetWords: 1950 },
  { id: "20", label: "👑 Epic", desc: "~20 min", minutes: 20, targetWords: 2600 },
];

function mk(id,title,emoji,genre,age,pages){const gc=GENRES.find(g=>g.id===genre);return{id,title,emoji,color:gc?.color||"#6366f1",genre,age,pages};}

const ALL_STORIES=[
mk("a1","The Lost Map","🗺️","adventure","4-7",[["Page 1","Mia found an old map tucked inside a library book. It showed a path through the Whispering Woods to a golden star."],["Page 2","She packed her backpack with a flashlight, a sandwich, and her lucky rock. The trail began behind the old oak tree."],["Page 3","The woods were full of strange sounds. Owls hooted, branches creaked, and somewhere a stream giggled over stones."],["Page 4","Mia followed the map over a mossy bridge and past a waterfall. The golden star was painted on a cave wall — and inside was a chest of beautiful crystals! She brought one home to remember her adventure."]]),
mk("a2","Captain Finn's Missing Treasure","⚓","adventure","4-7",[["Page 1","Captain Finn sailed the seven seas on his tiny boat, the Seashell. One morning, he discovered his treasure chest was gone!"],["Page 2","He followed wet footprints across the deck. They led to a trail of gold coins dropping into the water."],["Page 3","Finn dove in and found a friendly octopus wearing his captain's hat! The octopus had been playing dress-up."],["Page 4","They shared the treasure and became best friends. Now every Tuesday is Treasure Tea Party day on the Seashell."]]),
mk("a3","The Mountain of Echoes","🏔️","adventure","7-10",[["Page 1","Nobody had climbed Echo Mountain in a hundred years. Leo thought that was a hundred years too long."],["Page 2","The path was steep and slippery. Every word Leo spoke bounced back three times, each echo telling him something different."],["Page 3","At the summit, Leo found a giant horn carved from stone. When he blew it, every echo in the mountain sang together."],["Page 4","The echoes carried his song to the village. From that day on, people called him Leo the Songbringer."]]),
mk("a4","Rosie's Rocket Wagon","🚀","adventure","2-4",[["Page 1","Rosie put a cardboard box on her wagon. She said it was a rocket. Three, two, one — blast off!"],["Page 2","The wagon rolled down the hill past the mailbox, past the big tree, past the pond."],["Page 3","She landed in a pile of soft leaves. The leaves were her moon!"],["Page 4","Rosie planted a flag made of a stick and a sock. She was the first kid on Leaf Moon!"]]),
mk("a5","The Door in the Floor","🚪","adventure","7-10",[["Page 1","When Kai moved into the old house, he found a trapdoor under the rug in his bedroom."],["Page 2","Below was a tunnel lined with glowing mushrooms. It went on and on, curving gently downward."],["Page 3","The tunnel opened into an underground garden with a crystal-clear lake and trees made of sparkling stone."],["Page 4","Kai visited every night. He kept the trapdoor secret and tended the garden. It was his own hidden world."]]),
mk("a6","Jungle Express","🌴","adventure","4-7",[["Page 1","The old train hadn't run in years. But when Ava pulled the lever, it chugged to life and rolled into the jungle."],["Page 2","Monkeys swung onto the roof. Parrots landed on the seats. A sloth climbed aboard very slowly."],["Page 3","The train crossed a river on a vine bridge and climbed a volcano. Ava could see the whole island!"],["Page 4","She brought everyone safely back to the station. The animals waved goodbye and Ava promised to drive again tomorrow."]]),
mk("a7","Sky Pirates","🏴‍☠️","adventure","7-10",[["Page 1","The sky pirates flew a ship made of clouds held together with lightning bolts. Captain Storm was only eleven."],["Page 2","They chased a rainbow across three kingdoms, collecting colors in glass jars."],["Page 3","A rival crew tried to steal their jars, but Storm outwitted them by flying through a thunderhead."],["Page 4","They sold the rainbow colors at the Sky Market and bought enough star-fuel to explore the moon."]]),
mk("a8","Tiny Explorer","🐜","adventure","2-4",[["Page 1","An ant named Pip wanted to see what was on top of the kitchen table."],["Page 2","She climbed a napkin like a mountain. She crossed a plate like a desert."],["Page 3","She found a crumb as big as her head. It was the best thing she ever saw!"],["Page 4","Pip carried the crumb all the way home. Her family had a big feast that night."]]),
mk("a9","The Brave Little Boat","⛵","adventure","2-4",[["Page 1","A paper boat sat in a puddle. The rain came and the puddle became a stream."],["Page 2","The boat floated past rocks and sticks. It spun in little circles but kept going."],["Page 3","It sailed under a bridge where a frog said hello."],["Page 4","The boat reached the pond and floated happily. What a great adventure for a paper boat!"]]),
mk("a10","Desert Star","🌵","adventure","4-7",[["Page 1","Yara walked through the desert following a star that only she could see."],["Page 2","The sand was hot and the wind blew hard. But the star kept shining, leading her forward."],["Page 3","She found an oasis with date palms and cool blue water, hidden between two tall dunes."],["Page 4","Yara drew a map so she could find it again. She named it Star Oasis and visited every summer."]]),
mk("f1","The Wishing Pebble","✨","fantasy","2-4",[["Page 1","Lila found a shiny pebble that hummed when she held it."],["Page 2","She wished for a rainbow and one appeared over her house!"],["Page 3","She wished for a puppy. A fluffy puppy ran up and licked her nose."],["Page 4","Lila's last wish was for her mom to have a good day. And she did. That was the best wish of all."]]),
mk("f2","The Cloud Castle","☁️","fantasy","4-7",[["Page 1","High above the hills sat a castle made of clouds. Princess Wren lived there with her cloud cat, Nimbus."],["Page 2","One day the wind blew too hard and the castle started drifting out to sea. Wren had to act fast."],["Page 3","She wove a rope from rainbows and tied the castle to the tallest mountain."],["Page 4","The castle was safe. Wren declared that day Rainbow Rope Day, and everyone celebrated with cloud cake."]]),
mk("f3","Ember the Tiny Dragon","🐉","fantasy","4-7",[["Page 1","Ember was the smallest dragon in the cave. His fire was only big enough to toast a marshmallow."],["Page 2","The big dragons laughed. But when winter came, only Ember's gentle flame could warm the babies without burning."],["Page 3","He kept every egg warm and every hatchling cozy. The cave had never been so comfortable."],["Page 4","The big dragons stopped laughing. They called Ember the Warmkeeper, and it was the best title of all."]]),
mk("f4","The Moonlight Garden","🌙","fantasy","7-10",[["Page 1","Plants in Grandma's garden only bloomed at midnight. Silver roses, glowing tulips, and singing sunflowers."],["Page 2","One night, Noor followed a trail of petals to a door in the garden wall she'd never seen before."],["Page 3","Inside was a greenhouse where a tiny moon hung from the ceiling, watering the plants with moonbeams."],["Page 4","Grandma smiled when Noor told her. The garden had been waiting for someone with enough wonder to find it."]]),
mk("f5","The Painted Kingdom","🎨","fantasy","7-10",[["Page 1","Every painting in the museum was a window to another world. Sage discovered this when she fell into a landscape."],["Page 2","She landed in a field of violet grass under two suns. Creatures made of brushstrokes galloped past."],["Page 3","The paint-people needed help — their colors were fading. Sage used her watercolors to repaint them brighter."],["Page 4","She climbed back through the frame before the museum closed. She now visits every Saturday with fresh paints."]]),
mk("f6","Zara and the Rainbow Dragon","🌈","fantasy","4-7",[["Page 1","Zara saw something sparkle behind the waterfall. She pushed through the water and found a cave full of color."],["Page 2","A dragon with scales of every color blinked at her. Its name was Prism, and it was very shy."],["Page 3","Prism showed Zara how it painted rainbows by breathing gently through the mist."],["Page 4","They made the biggest rainbow anyone had ever seen. Zara and Prism were rainbow partners forever."]]),
mk("f7","The Invisible Friend","👻","fantasy","2-4",[["Page 1","Boo was invisible. Nobody could see him, but he was always there."],["Page 2","He helped Sam find lost toys. He pushed the swing when nobody was around."],["Page 3","One day Sam said thank you to the empty air. Boo smiled so big he flickered visible for one second."],["Page 4","Sam saw him and giggled. They were best friends, even if only one of them could be seen."]]),
mk("f8","The Star Collector","⭐","fantasy","4-7",[["Page 1","Every night, old Mr. Moon swept fallen stars into a basket. Most he hung back up, but some were too dim."],["Page 2","He gave the dim stars to children in their dreams. That's why some dreams sparkle."],["Page 3","One star fell right into Lily's hand while she was awake. It was warm and hummed like a tiny bell."],["Page 4","She put it on her windowsill. It glowed all night and gave her the most wonderful dreams."]]),
mk("f9","The Spell That Sneezed","🤧","fantasy","4-7",[["Page 1","Wizard Fern tried to cast a cleaning spell, but she sneezed right in the middle of it."],["Page 2","Instead of cleaning, everything turned to bubbles! The chairs, the table, even the cat floated around."],["Page 3","Fern chased bubbles all over the tower. She popped each one and the furniture came back."],["Page 4","The cat-bubble was last. When it popped, the cat was perfectly clean. The spell worked — just in a bubbly way!"]]),
mk("f10","The Giant's Garden","🌻","fantasy","7-10",[["Page 1","A giant lived on the hill and grew vegetables the size of houses. His tomatoes were as tall as trees."],["Page 2","The village below was hungry, but too afraid to ask for food. Mara climbed the hill alone."],["Page 3","The giant wasn't scary at all. He was lonely. He gave Mara a seed the size of her fist."],["Page 4","She planted it in the village square. It grew into a cornstalk that fed everyone all winter."]]),
mk("fr1","Two Cups of Cocoa","☕","friendship","2-4",[["Page 1","Bear made two cups of cocoa. One for Bear. One for Fox."],["Page 2","Fox came in from the cold. Her nose was red and her ears were floppy."],["Page 3","They sat by the fire and drank their cocoa. It was warm and sweet."],["Page 4","Fox said this is the best cocoa ever. Bear said that is because we are drinking it together."]]),
mk("fr2","The Sharing Tree","🌳","friendship","4-7",[["Page 1","The old oak tree dropped one perfect apple every day. Maya always ate it alone."],["Page 2","One day, a new kid named Jaden sat under the tree looking hungry. Maya broke the apple in half."],["Page 3","The next day, the tree dropped two apples. When they shared with another friend, three fell."],["Page 4","By the end of the month, the whole class ate lunch under the tree. It never ran out of apples."]]),
mk("fr3","The Quiet Friend","🤫","friendship","7-10",[["Page 1","Eli didn't talk much. Other kids thought he was strange. But Hana noticed he was always drawing."],["Page 2","She sat next to him at lunch and peeked at his sketchbook. It was full of amazing comics."],["Page 3","Hana asked if she could write the words for his pictures. Eli nodded. They made a whole comic book."],["Page 4","The school printed their comic. Everyone wanted to talk to Eli now, but Hana was still his favorite."]]),
mk("fr4","Puddle Pals","💦","friendship","2-4",[["Page 1","Duck loved puddles. Pig loved puddles. They splashed and splashed."],["Page 2","Duck splashed Pig. Pig splashed Duck. Water went everywhere!"],["Page 3","They made the biggest splash together. It rained mud on both of them."],["Page 4","They laughed and laughed. Muddy friends are the best friends."]]),
mk("fr5","The New Kid","🏫","friendship","4-7",[["Page 1","Amara walked into class on the first day. Everyone already had friends. She sat alone."],["Page 2","At recess, a boy named Lucas kicked a ball to her. She kicked it back. He smiled."],["Page 3","They played every recess that week. Lucas introduced her to his friends."],["Page 4","Months later, another new kid arrived. Amara was the first to kick the ball to her."]]),
mk("fr6","The Blanket Fort","🏰","friendship","2-4",[["Page 1","Milo built a fort with every blanket in the house. It was huge!"],["Page 2","His sister Zoe wanted to come in. Milo said no. It was HIS fort."],["Page 3","But the fort felt big and empty alone. Milo opened the door."],["Page 4","Zoe brought cookies. They ate cookies in the fort and it was perfect."]]),
mk("fr7","Different but the Same","🎭","friendship","7-10",[["Page 1","Priya loved math. Dante loved art. They had nothing in common. Or so they thought."],["Page 2","For the school project, they were paired together. Priya groaned. Dante sighed."],["Page 3","Then Priya saw Dante's perfect geometric patterns. And Dante realized Priya arranged numbers like poetry."],["Page 4","Their project won first place. Math and art weren't so different — and neither were Priya and Dante."]]),
mk("fr8","The Sorry Sandwich","🥪","friendship","4-7",[["Page 1","Ben accidentally broke Kai's favorite toy truck. The wheel popped right off."],["Page 2","Ben was scared to tell Kai. He hid the truck under his bed for two days."],["Page 3","Finally he brought the truck back and said sorry. Kai was sad but not mad."],["Page 4","They fixed the truck together with tape and glue. A little wobbly, but Kai said that made it special."]]),
mk("fr9","Pen Pals","✉️","friendship","7-10",[["Page 1","Sofia in Argentina wrote a letter to a kid in Japan named Hiro."],["Page 2","Hiro wrote back with a drawing of his cat. Sofia sent a photo of her dog. Both were named Luna."],["Page 3","They wrote every month for three years, learning each other's languages word by word."],["Page 4","When Sofia visited Tokyo, Hiro was at the airport. They hugged like old friends, because that's what they were."]]),
mk("fr10","The Umbrella","☂️","friendship","2-4",[["Page 1","It was raining. Cat had an umbrella. Dog did not."],["Page 2","Dog was getting very wet. His ears dripped. His tail drooped."],["Page 3","Cat walked over and held the umbrella over both of them."],["Page 4","They walked home together, dry and happy. Well, mostly dry."]]),
mk("s1","The Backwards Day","🔄","silly","4-7",[["Page 1","Everything was backwards today. Dad wore his shirt inside out. Mom poured juice on her cereal."],["Page 2","At school, the teacher said goodbye when they arrived and hello when they left."],["Page 3","Lunch was dessert first. Everyone ate cake, then sandwiches. Nobody complained!"],["Page 4","At bedtime, they read the story from the last page to the first. It still made sense. Kind of. Goodnight!"]]),
mk("s2","The Hiccup Monster","😫","silly","2-4",[["Page 1","Gus had the hiccups. HIC! HIC! HIC!"],["Page 2","He tried holding his breath. HIC! He tried standing on his head. HIC!"],["Page 3","A frog jumped on his head. Gus was so surprised he forgot to hiccup!"],["Page 4","The frog ribbited. Gus giggled. No more hiccups! Thank you, frog."]]),
mk("s3","Grandma's Super Sneeze","🤧","silly","4-7",[["Page 1","Grandma sneezed so hard her wig flew off and landed on the dog."],["Page 2","The dog ran around the yard wearing the wig. He looked like a tiny grandma."],["Page 3","Grandma chased the dog. The dog chased the cat. The cat chased a butterfly."],["Page 4","They all ended up in a pile in the garden. Grandma put her wig back on — backwards."]]),
mk("s4","The Spaghetti Bath","🍝","silly","2-4",[["Page 1","Ollie didn't want a bath. So he filled the tub with spaghetti instead."],["Page 2","He jumped in. Squish squash! Noodles everywhere!"],["Page 3","Mom found him covered in spaghetti. She was NOT happy. But she did laugh."],["Page 4","Ollie had to take a real bath AND clean up the spaghetti. But it was worth it."]]),
mk("s5","The Dancing Shoes","💃","silly","4-7",[["Page 1","Nina found sparkly shoes at a yard sale. The moment she put them on, her feet started dancing!"],["Page 2","She danced through the grocery store. She tangoed past the tomatoes and waltzed by the watermelons."],["Page 3","She couldn't stop! She danced home, danced up the stairs, and danced into bed."],["Page 4","She finally kicked the shoes off. Her feet were tired but her smile was huge."]]),
mk("s6","Upside Down Town","🙃","silly","7-10",[["Page 1","In Upside Down Town, the sky was on the ground and the ground was on the sky."],["Page 2","People walked on clouds and birds swam through the dirt. Rain fell upward."],["Page 3","A girl from Regular Town visited and kept falling up. She had to hold onto lampposts."],["Page 4","She went home dizzy but smiling. She told her friends, but they thought she made it up. Probably."]]),
mk("s7","The Farting Unicorn","🦄","silly","4-7",[["Page 1","Sparkle the unicorn had a problem. Every time she used her magic, she also tooted. Loudly."],["Page 2","She made flowers grow — TOOT! She painted rainbows — TOOT TOOT!"],["Page 3","The other unicorns giggled. Sparkle was embarrassed. But her magic was the strongest."],["Page 4","She learned to own it. Now she toots with pride. Magic is magic, even if it's a little noisy."]]),
mk("s8","My Dog Ate My Homework… Again","🐕","silly","7-10",[["Page 1","When Jake said his dog ate his homework, Ms. Chen didn't believe him. Nobody ever does."],["Page 2","So Jake brought Biscuit to school. Biscuit immediately ate the spelling chart off the wall."],["Page 3","Then he ate Marcus's math worksheet and the class hamster's permission slip."],["Page 4","Jake got extra credit for the most convincing excuse ever. Biscuit got banned from the building."]]),
mk("s9","The Tickle Bug","🪲","silly","2-4",[["Page 1","A tiny bug landed on Mia's arm. It tickled! She giggled."],["Page 2","The bug walked to her elbow. More tickles! More giggles!"],["Page 3","It walked up to her neck. Mia laughed so hard she fell over!"],["Page 4","The bug flew away. Mia said come back soon, little tickle bug!"]]),
mk("s10","King of the Couch","👑","silly","4-7",[["Page 1","Dad sat on the couch and declared himself King of the Couch. He put a pillow on his head."],["Page 2","The kids attacked! They threw pillows from every direction. The king defended bravely."],["Page 3","But there were too many kids. The king was overthrown and buried in cushions."],["Page 4","From under the pile, Dad's voice said: I shall return. The kids piled on more pillows."]]),
mk("m1","The Missing Cookie","🍪","mystery","2-4",[["Page 1","There was a cookie on the plate. Then there wasn't. Who took it?"],["Page 2","Mom didn't take it. Dad didn't take it. The cat looked suspicious."],["Page 3","There were crumbs on the cat's whiskers! And chocolate on her paws!"],["Page 4","Mystery solved! Bad kitty. But also, it must have been a very good cookie."]]),
mk("m2","The Secret Note","📝","mystery","4-7",[["Page 1","Zoe found a note in her locker: Meet me at the old tree at 3pm. Signed with a smiley face."],["Page 2","At the tree she found another note: Look under the bench by the fountain."],["Page 3","Under the bench was a small box with a third note: Turn around."],["Page 4","Her best friend Ava was standing there with a cupcake. Happy birthday! Zoe had forgotten her own birthday!"]]),
mk("m3","The Ghost in the Attic","👻","mystery","7-10",[["Page 1","Strange noises came from the attic every night at nine. Thump, thump, screeeech."],["Page 2","Nadia crept up with a flashlight. The thumping got louder. Her heart pounded."],["Page 3","She opened the door and found a raccoon family living in an old suitcase. They had babies!"],["Page 4","Dad called animal control to relocate them safely. Nadia named them all before they left."]]),
mk("m4","Where Are My Shoes?","👟","mystery","2-4",[["Page 1","Ben could not find his shoes. He looked under the bed. Nope."],["Page 2","He looked in the closet. He looked in the kitchen. He looked in the bathtub. Nope!"],["Page 3","He found them in the yard. The dog was sleeping on them."],["Page 4","The shoes were warm and a little slobbery. Ben wore them anyway."]]),
mk("m5","The Vanishing Goldfish","🐟","mystery","4-7",[["Page 1","Goldie the goldfish disappeared from her bowl overnight. The water was still there, but no Goldie."],["Page 2","Detective Sam checked for clues. The counter was dry. No splashes anywhere."],["Page 3","Then Sam noticed the orange bowl. A flash of orange moved between the fruit."],["Page 4","Goldie had jumped into the orange bowl! She must have thought the oranges were friends."]]),
mk("m6","The Library Phantom","📚","mystery","7-10",[["Page 1","Books kept moving to the wrong shelves in the school library. Mrs. Park was baffled."],["Page 2","Riley stayed late. At 4pm, a book slid off a shelf by itself. Then another."],["Page 3","Behind the shelf was a cat! It had been living in the library for weeks."],["Page 4","Mrs. Park adopted the cat and named her Dewey. She became the official library cat."]]),
mk("m7","The Footprints in the Snow","🐾","mystery","4-7",[["Page 1","Fresh snow covered the yard. But there were footprints leading to the shed. Big ones."],["Page 2","Lily followed them carefully. The shed door was open a crack."],["Page 3","Inside was a baby deer, curled up and shivering. It had wandered in from the woods."],["Page 4","Lily brought it a blanket and water. In the morning, its mama came to take it home."]]),
mk("m8","The Case of the Purple Hands","🟣","mystery","7-10",[["Page 1","Everyone in Ms. Rivera's class came back from lunch with purple hands. Nobody knew why."],["Page 2","Inspector Jade examined the evidence. The soap was normal. The lunch trays were clean."],["Page 3","Then she noticed the classroom door handle was sticky. Someone had put grape jelly on it!"],["Page 4","The janitor confessed — he'd been eating a PB&J while fixing the door. Mystery solved."]]),
mk("m9","The Whispering Wall","🧱","mystery","7-10",[["Page 1","The wall in the hallway whispered at night. Soft voices, too quiet to understand."],["Page 2","Marco pressed his ear to the wall. It sounded like music — tiny, tinny music."],["Page 3","He opened the electrical panel and found an old radio, still plugged in, playing at night."],["Page 4","It was a jazz station from the 1960s. The wall wasn't haunted — it had good taste in music."]]),
mk("m10","Who Drew on the Wall?","🖍️","mystery","2-4",[["Page 1","There were crayon marks on the wall. Red and blue and green."],["Page 2","Was it the baby? The baby was sleeping. Was it the dog? Dogs can't hold crayons."],["Page 3","There was crayon on Tomas's fingers. Red and blue and green."],["Page 4","Tomas said it was art. Mom said it was the wall. Tomas helped clean it up."]]),
mk("sc1","The Seed That Wouldn't Grow","🌱","science","4-7",[["Page 1","Maya planted a seed and waited. One day. Two days. A whole week. Nothing grew."],["Page 2","She checked the soil. It was dry! She had forgotten to water it. She gave it a big drink."],["Page 3","She moved it to a sunny window. After three days, a tiny green sprout poked through!"],["Page 4","Seeds need water, sun, and patience. Her sunflower grew taller than she was by summer."]]),
mk("sc2","The Moon Is Following Me","🌕","science","2-4",[["Page 1","In the car at night, Leo looked at the moon. It was following them!"],["Page 2","They turned left. The moon turned left. They turned right. The moon turned right!"],["Page 3","Dad said the moon is very far away, so it looks like it moves with us."],["Page 4","Leo waved at the moon anyway. It's nice to have a friend up there."]]),
mk("sc3","How Do Birds Fly?","🐦","science","4-7",[["Page 1","Ava watched a bird fly and wondered how. She couldn't fly no matter how hard she flapped."],["Page 2","Bird wings are curved on top and flat on the bottom. Air moves faster over the top, pushing up."],["Page 3","She curved the wings on a paper airplane. It flew farther than any she'd ever made!"],["Page 4","She couldn't fly like a bird, but she understood now. It wasn't magic — it was science!"]]),
mk("sc4","The Puddle That Disappeared","💧","science","2-4",[["Page 1","It rained in the morning. There was a big puddle on the sidewalk."],["Page 2","After lunch, the puddle was smaller. After nap time, it was almost gone!"],["Page 3","Where did the water go? Up! The sun turned it into tiny drops in the air."],["Page 4","The water went up to the clouds. One day it would rain again. The puddle would come back!"]]),
mk("sc5","Why Is the Sky Blue?","🔵","science","4-7",[["Page 1","Kai asked: why is the sky blue and not green or purple?"],["Page 2","Sunlight looks white, but it's actually every color mixed together, like a hidden rainbow."],["Page 3","When sunlight hits the air, blue light bounces around the most because it travels in short waves."],["Page 4","At sunset, the blue scatters away, and we see red and orange. The sky is a show that changes all day!"]]),
mk("sc6","The Kitchen Volcano","🌋","science","7-10",[["Page 1","Jaya wanted to make a volcano for the science fair. She built a mountain out of clay."],["Page 2","She poured in baking soda, dish soap, red food coloring, and then — vinegar!"],["Page 3","FIZZ! FOAM! Red bubbly lava poured down the sides! The most exciting thing she'd ever made."],["Page 4","The acid and base made carbon dioxide gas. The soap turned it into bubbles. Science made the lava."]]),
mk("sc7","The Magnet Trick","🧲","science","4-7",[["Page 1","Omar got a magnet for his birthday. He stuck it on the fridge — clunk! Cool!"],["Page 2","He tried the table. Nothing. He tried a book. Nothing. He tried a spoon — clunk!"],["Page 3","Magnets stick to things with iron in them. The fridge and spoon had iron."],["Page 4","Omar tested everything in the house. Best discovery: magnets stick to the dog's collar but not the dog."]]),
mk("sc8","Stargazing with Grandpa","🔭","science","7-10",[["Page 1","Grandpa set up the telescope on a clear night. The moon was huge, with craters and mountains."],["Page 2","They found Jupiter. Through the telescope, they could see four tiny dots — Jupiter's moons!"],["Page 3","The light from some stars takes thousands of years to reach us. She was seeing the past!"],["Page 4","They stayed out until their cocoa was cold. The universe was enormous and beautiful."]]),
mk("sc9","The Ice Cube Race","🧊","science","2-4",[["Page 1","Mom gave Eli three ice cubes. One on the table. One in the sun. One in his hand."],["Page 2","The one in his hand melted first! His hand was warm!"],["Page 3","The one in the sun melted next. The one on the table lasted longest."],["Page 4","Heat makes ice melt. Now Eli knows where to keep his popsicle!"]]),
mk("sc10","Building a Bridge","🌉","science","7-10",[["Page 1","Ms. Torres challenged the class to build a bridge from popsicle sticks that could hold a textbook."],["Page 2","Most teams made flat bridges. They broke. Riley's team made triangles — the strongest shape."],["Page 3","Their bridge held one book. Then two. Then three! Triangles spread the weight evenly."],["Page 4","Engineers use triangles in real bridges and buildings. Riley saw triangles everywhere after that."]]),
mk("an1","The Kitten Who Was Scared","🐱","animals","2-4",[["Page 1","A tiny kitten hid under the porch. It was shaking."],["Page 2","Nora sat quietly nearby. She didn't reach for the kitten. She just waited."],["Page 3","After a long time, the kitten crept out and sniffed her hand."],["Page 4","Nora took the kitten home. She named her Brave, because she was."]]),
mk("an2","The Elephant Who Painted","🐘","animals","4-7",[["Page 1","At the sanctuary, an elephant named Mango picked up a brush and painted a blue circle."],["Page 2","The keepers gave her more colors. She painted green stripes and red dots."],["Page 3","People came from all over to see Mango paint. She was happiest with a brush in her trunk."],["Page 4","They sold her paintings to help other elephants. Mango was an artist and a helper."]]),
mk("an3","Migration Day","🦋","animals","7-10",[["Page 1","Monarch butterflies travel 3000 miles every year, from Canada to Mexico."],["Page 2","Luna the butterfly had never made the trip, but something inside her knew the way."],["Page 3","She flew over mountains and rivers. Other monarchs joined her until the sky was orange with wings."],["Page 4","In Mexico, millions of butterflies covered the trees like living leaves. Luna had made it."]]),
mk("an4","The Duck Parade","🦆","animals","2-4",[["Page 1","Mama duck walked down the street. One duckling followed. Then another. Then another!"],["Page 2","Six ducklings in a row! They waddled past the bakery and the school."],["Page 3","Cars stopped. People smiled. A police officer helped them cross."],["Page 4","They waddled to the pond. Splash, splash, splash, splash, splash, splash! Home!"]]),
mk("an5","The Dog Who Couldn't Bark","🐕","animals","4-7",[["Page 1","Biscuit opened his mouth to bark, but nothing came out. Not a woof, not a yip."],["Page 2","He tried to warn his family about the mail carrier. He tried to say hello to other dogs. Silence."],["Page 3","But Biscuit could whistle! A perfect, clear whistle through his teeth."],["Page 4","His family always knew where he was. He was the most unique dog on the block."]]),
mk("an6","The Penguin Problem","🐧","animals","4-7",[["Page 1","Pip the penguin hated the cold. All the other penguins loved it, but Pip shivered."],["Page 2","He tried wearing a scarf. They laughed. He tried the volcanic vent. Too hot!"],["Page 3","Then he discovered huddling in the middle of the group was the warmest spot."],["Page 4","Pip didn't hate the cold anymore. He just needed friends close by."]]),
mk("an7","The Spider's Web","🕷️","animals","7-10",[["Page 1","Every morning, the spider rebuilt her web. Every night, the wind tore it apart."],["Page 2","Marcus watched from his window. He was amazed at her patience."],["Page 3","One morning, dew covered the web and it glittered like diamonds in the sunrise."],["Page 4","He drew the web for art class and won a ribbon. She kept building. He kept drawing."]]),
mk("an8","Baby Owl's First Flight","🦉","animals","2-4",[["Page 1","Baby Owl sat on the branch. Mama said fly! Baby Owl said no."],["Page 2","The branch was safe. The ground was far. The sky was big."],["Page 3","A butterfly landed on Baby Owl's beak. He jumped — and his wings opened!"],["Page 4","Baby Owl was flying! He flew in a circle and landed back. He was brave! Also dizzy."]]),
mk("an9","The Whale Song","🐋","animals","7-10",[["Page 1","Deep in the ocean, a whale sang a song that traveled a thousand miles."],["Page 2","Scientists recorded the songs. Each whale had a unique voice."],["Page 3","One whale sang a brand new melody. Within a year, whales everywhere were singing it."],["Page 4","Whales teach each other songs, just like people. Music connects them across the dark sea."]]),
mk("an10","The Tortoise and the Garden","🐢","animals","4-7",[["Page 1","Old Mr. Tortoise moved very slowly. It took him all morning to cross the garden."],["Page 2","But he noticed things nobody else did. A ladybug. A new flower. A snail's silver trail."],["Page 3","He told the other animals what he saw. They were always in too much of a hurry."],["Page 4","Slow isn't bad, said Mr. Tortoise. Slow means you see the whole world."]]),
mk("sp1","Teddy and the Amazing Mets","⚾","sports","4-7",[["Page 1","Teddy loved the Mets more than anything. He wore his blue and orange jersey every day."],["Page 2","Dad surprised him with tickets! They took the train to the big stadium. The field was SO green!"],["Page 3","In the ninth inning, the Mets were losing. Then — CRACK! A huge home run! Teddy's hat flew off!"],["Page 4","The Mets won! Teddy caught a foul ball. He told it goodnight every evening. Let's Go Mets!"]]),
mk("sp2","The Big Race","🏃","sports","2-4",[["Page 1","Today was the big race. Emma put on her fast shoes."],["Page 2","Ready, set, GO! Emma ran and ran and ran."],["Page 3","She didn't win. She came in third. But she ran faster than last time!"],["Page 4","Dad gave her a big hug. Getting better is better than winning. Emma agreed."]]),
mk("sp3","Goal!","⚽","sports","4-7",[["Page 1","The score was tied. One minute left. Aiden had the ball."],["Page 2","He dribbled past one player. Then another. The goal was right there."],["Page 3","He kicked with everything he had. The ball sailed past the goalie's fingers, into the net!"],["Page 4","GOAL! His team lifted him up. It was just a Saturday game, but it felt like the World Cup."]]),
mk("sp4","The Smallest Player","🏀","sports","4-7",[["Page 1","Mimi was the shortest kid on the basketball team. The others looked like giants."],["Page 2","She couldn't block shots or dunk. But she was fast. Super fast."],["Page 3","She stole the ball three times in one game. She zipped between players like lightning."],["Page 4","Coach said: It's not about being tall. It's about being smart and quick. Mimi was both."]]),
mk("sp5","Swim Day","🏊","sports","2-4",[["Page 1","It was swim day! Ali put on goggles and a swimsuit. Ali was ready."],["Page 2","The water was cold! Toes first. Then knees. Then tummy. Brrrr!"],["Page 3","But once Ali started swimming, it felt great! Splash, splash, kick, kick."],["Page 4","Ali swam all the way across the pool. Coach said great job!"]]),
mk("sp6","The Gymnastics Show","🤸","sports","4-7",[["Page 1","Luna had practiced her routine a hundred times. Today was the big show. Butterflies in her tummy."],["Page 2","She walked onto the mat. The music started. Cartwheel, handstand, perfect split."],["Page 3","On the balance beam, she wobbled — but didn't fall! She held her breath and kept going."],["Page 4","She stuck her landing. The crowd clapped. Luna's butterflies turned into fireworks."]]),
mk("sp7","Skateboard Kid","🛹","sports","7-10",[["Page 1","Dev fell off his skateboard 47 times trying to learn a kickflip. He counted every one."],["Page 2","Scraped knees. Bruised elbows. His mom said maybe try something else."],["Page 3","On attempt 48, the board flipped, his feet caught it, and he landed. Perfectly."],["Page 4","He fell on attempt 49. But it didn't matter. He knew he could do it now."]]),
mk("sp8","The Hockey Goalie","🏒","sports","7-10",[["Page 1","Everyone wanted to score goals. Nobody wanted to be goalie. Except Faye."],["Page 2","She loved the challenge. Every shot was a puzzle. Left? Right? High? Low?"],["Page 3","Championship game. Breakaway. One player, full speed. Faye didn't flinch."],["Page 4","She caught the puck in her glove. Her team won 2-1. The hero who never scored a goal."]]),
mk("sp9","The Bike Race","🚲","sports","4-7",[["Page 1","The neighborhood bike race went around the block. All the kids lined up."],["Page 2","Jake pedaled hard. Wind in his face. He passed the mailbox, the hydrant, the big tree."],["Page 3","Second place! The finish line was close. He pedaled harder than ever."],["Page 4","He didn't win. But he beat his best time by ten seconds. He celebrated like a champion."]]),
mk("sp10","Catch!","🥎","sports","2-4",[["Page 1","Mom threw the ball. It went up, up, up!"],["Page 2","It came down, down, down. Into the grass. Oops!"],["Page 3","Mom threw it again. Up, up, up! Down, down — CATCH!"],["Page 4","They threw the ball until dinner. Best afternoon ever."]]),
];

// ─── VOICE / SPEECH ──────────────────────────────────────────────────────────
// Prefer Enhanced/Premium voices (Apple), then high-quality desktop voices
const PRIORITY_VOICES=[
  // Apple Enhanced/Premium (dramatically better than standard)
  "daniel (enhanced)","samantha (enhanced)","karen (enhanced)","moira (enhanced)",
  "daniel (premium)","samantha (premium)","karen (premium)",
  // Apple standard (still good)
  "daniel","samantha","karen","moira","tessa","fiona",
  // Google / Microsoft high-quality
  "google uk english female","google us english",
  "microsoft aria","microsoft jenny","microsoft guy",
  // Fallbacks
  "zira","rishi","nicky","alex"
];
function getEnglishVoices(){return window.speechSynthesis.getVoices().filter(v=>v.lang.startsWith("en"));}
function pickBestVoice(voices){
  // First try exact priority matches
  for(const p of PRIORITY_VOICES){const f=voices.find(v=>v.name.toLowerCase().includes(p));if(f)return f;}
  // Then look for any "enhanced" or "premium" voice
  const enhanced=voices.find(v=>/enhanced|premium/i.test(v.name));
  if(enhanced)return enhanced;
  return voices[0]||null;
}

// Split text into sentences, preserving which words belong to each
function splitSentences(text){
  const allWords=text.split(/\s+/).filter(Boolean);
  const sentences=[];
  let buf="",wordStart=0,wordCount=0;
  for(let i=0;i<allWords.length;i++){
    buf+=(buf?" ":"")+allWords[i];
    wordCount++;
    const last=allWords[i];
    if(/[.!?]["'"\u2019\u201D]?$/.test(last)||i===allWords.length-1){
      sentences.push({text:buf.trim(),startIdx:wordStart,endIdx:wordStart+wordCount-1});
      buf="";wordStart=i+1;wordCount=0;
    }
  }
  return{allWords,sentences};
}

// Determine pitch for a sentence based on punctuation
function pitchForSentence(text){
  if(text.endsWith("?"))return 1.05;  // slight rise for questions
  if(text.endsWith("!"))return 0.93;  // slight drop for emphasis
  return 0.97;
}

// Determine rate for a sentence (slow down for openers, speed up for action)
function rateForSentence(text,idx,total,baseRate){
  if(idx===0)return baseRate*0.95;  // slower opening
  if(idx===total-1)return baseRate*0.97;  // slightly slower closing
  if(/[!]/.test(text)&&text.length<60)return baseRate*1.03;  // snappier exclamations
  return baseRate;
}

function useSpeech(){
  const[speaking,setSpeaking]=useState(false);
  const[wordIndex,setWordIndex]=useState(-1);
  const[words,setWords]=useState([]);
  const[voice,setVoice]=useState(null);
  const[rate,setRate]=useState(0.82);
  const[allVoices,setAllVoices]=useState([]);
  const cancelledRef=useRef(false);
  const timerRef=useRef(null);

  useEffect(()=>{
    const l=()=>{const ev=getEnglishVoices();setAllVoices(ev);if(!voice&&ev.length)setVoice(pickBestVoice(ev));};
    l();window.speechSynthesis.onvoiceschanged=l;
    return()=>{window.speechSynthesis.onvoiceschanged=null;};
  },[]);

  const stop=useCallback(()=>{
    cancelledRef.current=true;
    window.speechSynthesis.cancel();
    clearInterval(timerRef.current);
    setSpeaking(false);
    setWordIndex(-1);
  },[]);

  const speak=useCallback((text,onEnd)=>{
    stop();
    cancelledRef.current=false;
    const{allWords,sentences}=splitSentences(text);
    setWords(allWords);
    setWordIndex(0);
    setSpeaking(true);

    let sentIdx=0;

    const speakNext=()=>{
      if(cancelledRef.current)return;
      if(sentIdx>=sentences.length){
        setSpeaking(false);setWordIndex(-1);onEnd?.();return;
      }

      const sent=sentences[sentIdx];
      const sentWords=sent.text.split(/\s+/).filter(Boolean);
      const utt=new SpeechSynthesisUtterance(sent.text);
      if(voice)utt.voice=voice;
      utt.rate=rateForSentence(sent.text,sentIdx,sentences.length,rate);
      utt.pitch=pitchForSentence(sent.text);

      // Word tracking within this sentence
      let bFired=false;
      let lastHighlight=sent.startIdx;
      setWordIndex(sent.startIdx);

      utt.onboundary=(e)=>{
        if(cancelledRef.current)return;
        if(e.name==="word"){
          bFired=true;
          clearInterval(timerRef.current);
          // Map charIndex to word within sentence, then to global word index
          let ci=e.charIndex,wIdx=0,pos=0;
          for(let w=0;w<sentWords.length;w++){
            if(pos>=ci){wIdx=w;break;}
            pos+=sentWords[w].length+1;
            wIdx=w+1;
          }
          const globalIdx=Math.min(sent.startIdx+Math.min(wIdx,sentWords.length-1),sent.endIdx);
          if(globalIdx>=lastHighlight){
            lastHighlight=globalIdx;
            setWordIndex(globalIdx);
          }
        }
      };

      // Timer fallback for browsers without onboundary
      const ms=60000/(150*utt.rate);
      let tIdx=0;
      timerRef.current=setInterval(()=>{
        if(bFired||cancelledRef.current){clearInterval(timerRef.current);return;}
        tIdx++;
        const gi=Math.min(sent.startIdx+tIdx,sent.endIdx);
        setWordIndex(gi);
      },ms);

      utt.onend=()=>{
        clearInterval(timerRef.current);
        if(cancelledRef.current)return;
        // Hold the last word highlighted briefly, then pause between sentences
        setWordIndex(sent.endIdx);
        sentIdx++;
        // Natural pause between sentences (longer after periods, shorter after commas)
        const pauseMs=sent.text.endsWith("?")?380:sent.text.endsWith("!")?350:420;
        setTimeout(speakNext,pauseMs);
      };

      utt.onerror=()=>{
        clearInterval(timerRef.current);
        if(!cancelledRef.current){setSpeaking(false);setWordIndex(-1);}
      };

      window.speechSynthesis.speak(utt);
    };

    speakNext();
  },[voice,rate,stop]);

  return{speaking,wordIndex,words,speak,stop,voice,setVoice,rate,setRate,allVoices};
}

// ─── STORY ENGINE (cohesive 6-page arcs) ─────────────────────────────────────
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const WORLDS={
adventure:{settings:["a hidden canyon beyond the old bridge","a mysterious island at the edge of the sea","a forest where the trees grew tall enough to hide the sky","a mountain nobody in town had ever climbed"],friends:["a scruffy trail dog named Patches","a retired sailor who knew every star","a clever crow who collected shiny objects","a park ranger named Jo who always carried rope"],emojis:["🗺️","🏔️","⚓","🧭"]},
fantasy:{settings:["an enchanted garden where the flowers hummed melodies","a crystal cave beneath a sleeping volcano","a floating castle held aloft by giant butterflies","a forest where every tree had a kind old face"],friends:["a tiny dragon no bigger than a kitten","a cloud sprite who loved to change shape","a talking fox with a silver-tipped tail","a friendly witch who grew spells in flowerpots"],emojis:["✨","🧙","🐉","🌙"]},
friendship:{settings:["a neighborhood full of tall trees and wide front porches","a summer camp beside a clear blue lake","a small school where everyone knew each other","a community garden at the end of Maple Street"],friends:["the quiet kid who always sat by the window","a neighbor who had just arrived from far away","a classmate who always shared her lunch","an older kid who remembered what it felt like to be new"],emojis:["🤝","💛","🏡","🌻"]},
silly:{settings:["a town where the rules changed every Tuesday","a kitchen where the food had strong opinions","a school where the class pet was the principal","a park where the swings told jokes"],friends:["a goat who was convinced it was a dog","a talking sock named Gerald","a squirrel with no sense of direction","a grandma who secretly won a wrestling championship"],emojis:["🤪","😂","🙃","🎪"]},
mystery:{settings:["an old library with a room that was always locked","a quiet street where small things kept vanishing","a school where the hallways seemed to rearrange overnight","a grandparent's house full of hidden compartments"],friends:["a sharp-eyed classmate who noticed every detail","a curious cat who always found trouble","a retired detective who lived two doors down","a younger sibling who asked exactly the right questions"],emojis:["🔍","🕵️","📝","🗝️"]},
science:{settings:["a backyard that doubled as a laboratory","a nature trail full of surprising creatures","a kitchen table covered with experiments","a hilltop where the stars seemed close enough to touch"],friends:["a science teacher who made everything exciting","a grandmother who used to be an engineer","a neighbor kid who loved building things","a little sibling who asked why about everything"],emojis:["🔬","🧪","🌱","🔭"]},
animals:{settings:["a wide meadow at the edge of a deep forest","a coral reef bursting with color","a tall oak tree that sheltered dozens of creatures","a small farm where the animals looked out for each other"],friends:["a brave little mouse with a big heart","a wise old tortoise who never rushed","a cheerful bluebird who carried messages","a gentle bear who was startled by loud sounds"],emojis:["🐾","🦊","🐻","🐦"]},
sports:{settings:["a neighborhood where every kid played outside after school","a small-town league where everybody got a chance","a community center with a gym full of echoes and energy","a backyard that became a stadium every Saturday"],friends:["a coach who believed in every player","an older kid who remembered being the youngest","a teammate who always knew when to pass","a parent in the bleachers who cheered for everyone"],emojis:["⚽","🏀","🏊","🚲"]},
};

const ARCS=[
({name,type,setting,friend,obstacle,lesson})=>[
`${name} the ${type} had explored the same neighborhood a hundred times — every alley, every fence, every crack in the sidewalk. But one morning, while walking near ${setting}, ${name} noticed something strange: a narrow path, half-hidden by tall grass, winding away into shadow.`,
`Curiosity won. ${name} followed the path downhill through wildflowers and over a stream so clear you could count every pebble on the bottom. The trail ended at ${setting}, and it was more beautiful than anything ${name} had ever seen. Warm light filtered through the air, and every sound felt hushed.`,
`${name} wasn't alone for long. ${friend} stepped out from behind a mossy boulder, eyes wide. "You found it too?" they whispered. ${name} nodded, and in that quiet moment a partnership was born. They spent the afternoon exploring together, trading guesses about how this place came to be.`,
`Then things went wrong. ${obstacle}. What had felt magical now felt fragile, like a soap bubble about to pop. ${name}'s chest tightened. Walking away would have been the easy choice. Going home, closing the door, pretending none of this had happened.`,
`But ${name} chose differently. Standing beside ${friend}, ${name} decided to ${lesson.toLowerCase()}, even though it was frightening. They tried one approach that didn't work, then another that almost made things worse. On the third try, something clicked. Slowly, carefully, the pieces fell back into place.`,
`The sun was low when they finally sat down, exhausted and grinning. "Same time tomorrow?" ${friend} asked. ${name} laughed. They had discovered more than a hidden place — they had learned what it truly means to ${lesson.toLowerCase()}, and that lesson felt worth keeping forever.`,
],
({name,type,setting,friend,obstacle,lesson})=>[
`It was supposed to be an ordinary afternoon. ${name} the ${type} was heading home, thinking about nothing special, when a small sound stopped everything. It came from near ${setting} — a worried, unsteady sound, like someone trying hard not to ask for help.`,
`${name} found ${friend} sitting alone, looking completely overwhelmed. "What happened?" ${name} asked, sitting down nearby. ${friend} hesitated, then explained: ${obstacle}. It was the kind of problem that feels enormous when you face it alone.`,
`${name} didn't have to stay. It wasn't ${name}'s problem. But something quiet and stubborn inside wouldn't allow walking away. "I'm not sure I can fix this," ${name} admitted, "but I'd like to try. Two people thinking is better than one person worrying."`,
`At first they made real progress, working side by side with growing confidence. Then the situation shifted. A complication nobody predicted turned their plan upside down. ${friend} slumped. "Maybe I should just give up," ${friend} whispered.`,
`${name} sat down and thought carefully while the silence stretched out. Then an idea surfaced — simpler than the first plan but steadier. It meant starting over. It meant choosing to ${lesson.toLowerCase()} when everything felt like it was falling apart. They looked at each other, nodded, and began again.`,
`When the last piece fell into place, ${friend} stared at ${name}. "You didn't have to do any of that." ${name} smiled. "I know. But I think that's the whole point." They walked home together as the streetlights flickered on, talking and laughing like people do after they've been through something real together.`,
],
({name,type,setting,friend,obstacle,lesson})=>[
`Plenty of people told ${name} the ${type} it couldn't be done. Too difficult, too unlikely, too ambitious. But ${name} had a feeling lodged deep inside — a stubborn, glowing feeling that refused to leave. The goal was clear, and it started at ${setting}.`,
`Preparation became ${name}'s daily routine. Early mornings, late afternoons, and long stretches of thinking before sleep. A small notebook tracked every bit of progress. Some days the entries were encouraging. Others just read: "Tried. Failed. Will try differently tomorrow."`,
`Then ${friend} showed up. At first they just watched quietly. After a few days, ${friend} said, "You've been doing the hardest part wrong. Want me to show you something?" It was a small adjustment, but it changed everything. Suddenly, things that had seemed impossible felt within reach.`,
`The real test arrived. ${name} stood at ${setting}, heart pounding. Then it happened — ${obstacle}. The worst possible timing. Every doubt ${name} had ever pushed aside came rushing back at once. This was the moment where most people would stop.`,
`${friend} appeared at ${name}'s side. Not with a speech — just with steady eyes and four words: "Remember why you started." ${name} closed both eyes, breathed in slowly, and let go of the fear. Then ${name} chose to ${lesson.toLowerCase()}, right there, with everything on the line.`,
`It wasn't perfect. It was ragged and real and hard-won. But it was enough. ${friend} broke into a grin. That night, ${name} opened the notebook to the last page and wrote: "Today I learned that ${lesson.toLowerCase()} isn't something you wait to feel ready for. You just do it, and the readiness follows."`,
],
({name,type,setting,friend,obstacle,lesson})=>[
`It started with something small. ${name} the ${type} noticed that things around ${setting} were slightly off — an object moved, a sound at an odd hour, a mark on the ground that wasn't there before. Other people walked past without a second glance. But ${name} kept watching.`,
`By the end of the first week, ${name} had filled half a notebook with observations. Times, dates, details. A pattern was forming: whatever was happening repeated at the same hour each day. ${name} circled the time on the page, underlined it twice, and made a plan.`,
`That's how ${friend} got pulled in. "Why are you hiding behind a bench with a flashlight?" ${friend} asked one evening. After an embarrassed pause, ${name} explained everything. ${friend}'s expression shifted from amused to fascinated. "I noticed something strange too," ${friend} admitted.`,
`They pooled their clues and followed the trail deeper. It led somewhere unexpected, and then — ${obstacle}. Everything they thought they understood flipped upside down. The mystery was layered, tangled, and more interesting than either of them had guessed.`,
`They hit a dead end that felt final. ${name} almost agreed to give up. But then ${name} remembered a detail from the very first day — something so small it had been overlooked. "Wait," ${name} said, flipping back through the notebook. The final piece clicked into place. Solving it required them to ${lesson.toLowerCase()}, and they did.`,
`The answer was not frightening — it was wonderful. Something hidden in plain sight, waiting for someone patient enough to find it. ${name} and ${friend} sat together afterward, satisfied and tired. "You know what made the difference?" ${friend} said. ${name} already knew: choosing to ${lesson.toLowerCase()}, even when looking away would have been easier.`,
],
({name,type,setting,friend,obstacle,lesson})=>[
`${name} the ${type} woke one morning with a restless feeling, like a compass needle spinning toward something not yet visible. There was a place — ${setting} — that ${name} had heard about but never seen. It was far, and the way was uncertain. But the pull was strong, so ${name} packed a bag and started walking.`,
`The first stretch was pure joy. Fresh air, open road, unfamiliar birdsong. Everything felt possible. ${name} noticed details that would have blurred past from a car window: the way light changed as clouds drifted, the smell of warm earth after rain, the quiet hum of the world going about its business.`,
`The excitement faded by afternoon, replaced by sore feet and creeping loneliness. That's when ${friend} appeared, walking the same road. "Traveling alone?" ${friend} asked. ${name} nodded. "Me too," ${friend} said. "How about we travel alone together?" They shared lunch, traded stories, and the miles seemed to shrink.`,
`The partnership was tested sooner than expected. ${obstacle}. The way forward was blocked, and going backward meant losing all their progress. ${name} felt a hot rush of frustration — fists clenched, jaw tight. All that effort, and now this.`,
`${friend} asked a quiet question: "What do you think we should try?" Something about the simplicity of it cleared the fog. ${name} realized the solution required choosing to ${lesson.toLowerCase()} — truly, not just in words. It meant letting go of the original plan and trusting a new one. They did it, and slowly the way opened.`,
`${setting} was everything ${name} had imagined and more. But standing there, looking back over the ground they'd covered, ${name} realized the destination wasn't really the point. The point was every stumble, every choice to keep going when stopping felt safer. "Was it worth it?" ${friend} asked. ${name} didn't hesitate. "Every single step."`,
],
];

function adaptForAge(pages,age){
  if(age==="7-10")return pages.map((p,i)=>[`Page ${i+1}`,p]);
  if(age==="4-7")return pages.map((p,i)=>{const s=p.match(/[^.!?]+[.!?]+/g)||[p];return[`Page ${i+1}`,s.slice(0,Math.min(s.length,4)).join(" ").trim()];});
  return pages.map((p,i)=>{const s=p.match(/[^.!?]+[.!?]+/g)||[p];return[`Page ${i+1}`,s.slice(0,2).join(" ").trim()];});
}

// Expansion passages to flesh out longer stories between core beats
const EXPANSIONS={
  atmosphere:({setting})=>[
    `The air around ${setting} carried a feeling that was hard to name — something between excitement and wonder. Every shadow held a secret, and every sound seemed to mean something.`,
    `${setting} looked different depending on where you stood. From one angle, everything seemed peaceful. From another, you could sense that something was about to change.`,
    `Time seemed to move differently here. Minutes stretched out like hours, and every small detail felt important — the way light fell, the sound of footsteps, the weight of silence between words.`,
  ],
  character:({name,type,friend})=>[
    `${name} paused and looked at ${friend}. There was something in ${friend}'s expression — not quite worry, not quite excitement. Something in between. "Are you sure about this?" ${name} asked. ${friend} nodded slowly. "No. But I think that's okay."`,
    `They stopped to rest. ${name} the ${type} sat quietly for a moment, thinking about everything that had happened so far. It was strange how one decision could change a whole day — maybe even a whole life.`,
    `${friend} told ${name} a story while they walked. It was about someone who had faced something similar a long time ago. "How did it end?" ${name} asked. ${friend} smiled. "I think we're about to find out."`,
  ],
  tension:({name,obstacle})=>[
    `Just when things seemed to be getting easier, a new problem appeared. It wasn't as big as ${obstacle}, but it was tricky in its own way. ${name} took a deep breath. One challenge at a time.`,
    `${name}'s hands were shaking — not from fear exactly, but from the effort of holding everything together. Some moments test what you're made of, and this was one of them.`,
    `There was a moment when everything went completely quiet. The kind of quiet that comes right before something important happens. ${name} could feel it in the air. Something was about to change.`,
  ],
  resolution:({name,friend,lesson})=>[
    `${friend} put a hand on ${name}'s shoulder. They didn't need to say anything — the look they shared said it all. They had done something that mattered, and they both knew it.`,
    `Walking back, ${name} noticed things that hadn't been visible before — small, beautiful details hidden in plain sight. It was as if the whole world looked slightly different now. Brighter, somehow.`,
    `${name} thought about what ${lesson.toLowerCase()} really meant. It wasn't just a nice idea you hear in a story. It was something you feel in your bones after you've actually lived it.`,
  ],
};

function generateStoryOffline({heroName,heroType,obstacle,genre,age,lesson,duration}){
  const name=heroName||"Sunny",type=heroType||"kid";
  const w=WORLDS[genre]||WORLDS.adventure;
  const setting=pick(w.settings),friend=pick(w.friends),emoji=pick(w.emojis);
  const obs=obstacle||pick(["a sudden storm rolled in and blocked the way forward","the path split in three directions with no signs","everything they had carefully built came tumbling down","the one thing they needed most turned out to be missing","a misunderstanding turned a friend into a stranger"]);
  const les=lesson||"be brave";
  const ctx={name,type,setting,friend,obstacle:obs,lesson:les};

  // Get base 6-page arc
  const baseArc=pick(ARCS)(ctx);

  // Determine target page count from duration
  const dur=DURATIONS.find(d=>d.id===duration)||DURATIONS[0];
  const wordsPerPage=age==="2-4"?18:age==="4-7"?45:70;
  const targetPages=Math.max(6,Math.round(dur.targetWords/wordsPerPage));

  let rawPages;

  if(targetPages<=6){
    // Short story — use arc as-is
    rawPages=baseArc;
  } else if(targetPages<=12){
    // Medium — expand each beat with an atmosphere/character page between
    rawPages=[];
    for(let i=0;i<baseArc.length;i++){
      rawPages.push(baseArc[i]);
      if(i<baseArc.length-1 && rawPages.length<targetPages){
        const expType=i<2?"atmosphere":i<4?"character":i<5?"tension":"resolution";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }
  } else {
    // Long/Epic — chain two arcs with expansions between
    const secondArc=pick(ARCS.filter(a=>a!==ARCS[0]))(ctx);
    rawPages=[];

    // First arc with expansions
    for(let i=0;i<baseArc.length;i++){
      rawPages.push(baseArc[i]);
      if(rawPages.length<targetPages && i<baseArc.length-1){
        const expType=i<2?"atmosphere":i<4?"character":"tension";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }

    // Bridge between arcs
    rawPages.push(`But the story wasn't over yet. Just when ${name} thought everything was settled, something new appeared on the horizon. ${friend} noticed it first. "Look," ${friend} said quietly, pointing. ${name} turned, and felt that familiar tingle — the one that means a new chapter is about to begin.`);

    // Second arc with expansions
    for(let i=0;i<secondArc.length;i++){
      rawPages.push(secondArc[i]);
      if(rawPages.length<targetPages && i<secondArc.length-1){
        const expType=i<2?"atmosphere":i<4?"tension":"resolution";
        rawPages.push(pick(EXPANSIONS[expType])(ctx));
      }
    }

    // Pad with resolution expansions if still short
    while(rawPages.length<targetPages){
      rawPages.push(pick(EXPANSIONS.resolution)(ctx));
    }
  }

  // Trim to target if we overshot
  rawPages=rawPages.slice(0,targetPages);

  const pages=adaptForAge(rawPages,age);
  const title=pick([`${name} and the ${pick(["Secret of","Path Through","Heart of"])} ${setting.split(",")[0].replace(/^a |^an |^the /i,"").trim()}`,`The ${pick(["Day","Moment"])} ${name} ${pick(["Changed Everything","Found the Way","Became Unstoppable"])}`,`${name}'s ${pick(["Greatest","Bravest","Most Incredible"])} ${pick(["Adventure","Journey","Day"])}`]);
  return{title,emoji,pages,duration:dur.id};
}

// ─── PERSISTENT STORAGE ──────────────────────────────────────────────────────
async function loadSaved(){try{const r=await window.storage.get("saved-stories");return r?JSON.parse(r.value):[];}catch{return[];}}
async function saveToDisk(stories){try{await window.storage.set("saved-stories",JSON.stringify(stories));}catch(e){console.error("Save failed:",e);}}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const css=`
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Baloo+2:wght@700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#fef9f0;--card:#fff;--text:#2d2a24;--muted:#8a8578;--accent:#ff6b4a;--accent2:#6c5ce7;--radius:18px;--shadow:0 4px 20px rgba(0,0,0,0.08);}
body,#root{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;}
.app{max-width:480px;margin:0 auto;padding:0 0 80px;min-height:100vh;}
.header{padding:20px 20px 12px;display:flex;align-items:center;justify-content:space-between;}
.header h1{font-family:'Baloo 2',cursive;font-size:28px;color:var(--accent);letter-spacing:-0.5px;}
.header-btns{display:flex;gap:8px;}
.icon-btn{width:40px;height:40px;border-radius:50%;border:none;background:var(--card);box-shadow:var(--shadow);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s;}
.icon-btn:active{transform:scale(.92);}
.genre-tabs{display:flex;gap:8px;padding:0 20px 12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.genre-tabs::-webkit-scrollbar{display:none;}
.genre-tab{flex-shrink:0;padding:8px 16px;border-radius:100px;border:2px solid #e8e4dc;background:var(--card);font-family:'Nunito',sans-serif;font-weight:700;font-size:14px;cursor:pointer;transition:all .2s;white-space:nowrap;}
.genre-tab.active{color:#fff;border-color:transparent;}
.age-filter{display:flex;gap:8px;padding:0 20px 16px;}
.age-btn{flex:1;padding:8px;border-radius:12px;border:2px solid #e8e4dc;background:var(--card);font-family:'Nunito',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .2s;text-align:center;}
.age-btn.active{background:var(--accent2);color:#fff;border-color:var(--accent2);}
.story-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 20px;}
.story-card{background:var(--card);border-radius:var(--radius);padding:18px 14px;box-shadow:var(--shadow);cursor:pointer;transition:transform .2s;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden;}
.story-card:active{transform:scale(.96);}
.story-card .emoji{font-size:36px;}
.story-card .title{font-weight:800;font-size:14px;line-height:1.3;}
.story-card .badges{display:flex;gap:4px;flex-wrap:wrap;}
.badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:100px;color:#fff;}
.create-card{background:linear-gradient(135deg,#ff6b4a 0%,#ee5a6f 50%,#6c5ce7 100%);color:#fff;text-align:center;justify-content:center;align-items:center;grid-column:1/-1;}
.create-card .emoji{font-size:40px;}
.create-card .title{font-size:18px;color:#fff;}
.my-badge{position:absolute;top:8px;right:8px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:100px;}
.reader{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);}
.reader-header{display:flex;align-items:center;padding:16px 20px;gap:12px;}
.reader-header h2{font-family:'Baloo 2',cursive;font-size:20px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.reader-content{flex:1;display:flex;flex-direction:column;padding:20px 28px;}
.scene{width:100%;height:180px;border-radius:20px;margin-bottom:16px;position:relative;overflow:hidden;flex-shrink:0;}
.scene-el{position:absolute;transition:all 0.5s ease;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.1));}
.page-title{font-family:'Baloo 2',cursive;font-size:16px;color:var(--muted);margin-bottom:12px;}
.story-text{font-size:19px;line-height:1.7;font-weight:600;overflow-y:auto;flex:1;}
.story-text .word{transition:background .15s,color .15s;padding:1px 3px;border-radius:4px;}
.story-text .word.active{background:var(--accent);color:#fff;}
.reader-controls{padding:16px 20px 24px;display:flex;flex-direction:column;gap:12px;}
.progress-bar{height:6px;background:#e8e4dc;border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .3s;}
.controls-row{display:flex;align-items:center;justify-content:center;gap:16px;}
.ctrl-btn{width:48px;height:48px;border-radius:50%;border:none;background:var(--card);box-shadow:var(--shadow);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s;}
.ctrl-btn:active{transform:scale(.9);}
.ctrl-btn.play{width:64px;height:64px;background:var(--accent);color:#fff;font-size:24px;}
.end-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;gap:16px;min-height:70vh;}
.end-screen .big-emoji{font-size:64px;}
.end-screen h2{font-family:'Baloo 2',cursive;font-size:28px;}
.stars{display:flex;gap:8px;}
.star{font-size:36px;cursor:pointer;transition:transform .2s;filter:grayscale(1) opacity(.3);}
.star.filled{filter:none;}
.star:active{transform:scale(1.3);}
.pill-btn{padding:14px 32px;border-radius:100px;border:none;font-family:'Nunito',sans-serif;font-weight:800;font-size:16px;cursor:pointer;transition:transform .15s;}
.pill-btn:active{transform:scale(.95);}
.pill-btn.primary{background:var(--accent);color:#fff;}
.pill-btn.secondary{background:var(--card);box-shadow:var(--shadow);}
.builder{padding:20px;}
.builder h2{font-family:'Baloo 2',cursive;font-size:24px;margin-bottom:4px;}
.builder-section{margin-bottom:20px;}
.builder-section label{display:block;font-weight:800;font-size:14px;margin-bottom:8px;color:var(--muted);}
.builder input[type="text"],.builder textarea,.builder select{width:100%;padding:12px 16px;border-radius:14px;border:2px solid #e8e4dc;font-family:'Nunito',sans-serif;font-size:15px;font-weight:600;background:var(--card);outline:none;transition:border-color .2s;}
.builder input:focus,.builder textarea:focus,.builder select:focus{border-color:var(--accent);}
.builder textarea{resize:vertical;min-height:80px;}
.pill-row{display:flex;flex-wrap:wrap;gap:8px;}
.pill{padding:8px 16px;border-radius:100px;border:2px solid #e8e4dc;background:var(--card);font-family:'Nunito',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .2s;}
.pill.active{color:#fff;border-color:transparent;}
.safety-note{background:#fff3e0;border-radius:14px;padding:14px;font-size:13px;font-weight:600;color:#e65100;text-align:center;margin-bottom:16px;}
.error-msg{background:#fde8e8;border-radius:14px;padding:14px;font-size:13px;font-weight:700;color:#c62828;text-align:center;margin-bottom:16px;}
.generating{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;text-align:center;}
.generating .spinner{width:48px;height:48px;border:4px solid #e8e4dc;border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:flex-end;justify-content:center;}
.modal{background:var(--bg);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:80vh;padding:24px;overflow-y:auto;}
.modal h3{font-family:'Baloo 2',cursive;font-size:22px;margin-bottom:16px;}
.voice-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;cursor:pointer;transition:background .15s;}
.voice-item:hover{background:rgba(0,0,0,.04);}
.voice-item.active{background:rgba(108,92,231,.1);}
.voice-name{flex:1;font-weight:700;font-size:14px;}
.voice-lang{font-size:12px;color:var(--muted);}
.preview-btn{padding:6px 12px;border-radius:100px;border:none;background:var(--accent2);color:#fff;font-weight:700;font-size:12px;cursor:pointer;}
.speed-section{margin-top:16px;}
.speed-section label{font-weight:800;font-size:14px;color:var(--muted);display:block;margin-bottom:8px;}
.speed-slider{width:100%;accent-color:var(--accent);}
`;

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function VoiceModal({show,onClose,allVoices,voice,setVoice,rate,setRate}){
  if(!show)return null;
  const preview=v=>{window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance("Once upon a time, a brave little fox set off on a great adventure. Would she find what she was looking for?");
    u.voice=v;u.rate=rate;u.pitch=0.97;window.speechSynthesis.speak(u);};
  const isEnhanced=v=>/enhanced|premium/i.test(v.name);
  return(<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <h3>🎙️ Choose a Voice</h3>
    <p style={{fontSize:13,color:"var(--muted)",fontWeight:600,marginBottom:12}}>Voices marked ✨ are high-quality enhanced voices and sound much more natural.</p>
    <div className="speed-section"><label>Speed: {rate.toFixed(2)}x</label><input type="range" className="speed-slider" min="0.6" max="1.1" step="0.01" value={rate} onChange={e=>setRate(+e.target.value)}/></div>
    <div style={{marginTop:16}}>{[...allVoices].sort((a,b)=>{const ae=/enhanced|premium/i.test(a.name)?0:1;const be=/enhanced|premium/i.test(b.name)?0:1;return ae-be||a.name.localeCompare(b.name);}).map((v,i)=>(<div key={i} className={`voice-item ${voice?.name===v.name?"active":""}`} onClick={()=>setVoice(v)}>
      <div style={{flex:1}}><div className="voice-name">{isEnhanced(v)?"✨ ":""}{v.name}</div><div className="voice-lang">{v.lang}{isEnhanced(v)?" · Enhanced":""}</div></div>
      <button className="preview-btn" onClick={e=>{e.stopPropagation();preview(v);}}>▶ Preview</button>
    </div>))}</div>
    <div style={{marginTop:20,textAlign:"center"}}><button className="pill-btn primary" onClick={onClose}>Done</button></div>
  </div></div>);
}

function BuilderScreen({onBack,onStoryCreated}){
  const[heroName,setHeroName]=useState("");const[heroType,setHeroType]=useState(HERO_TYPES[0]);
  const[obstacle,setObstacle]=useState("");const[genre,setGenre]=useState("adventure");
  const[age,setAge]=useState("4-7");const[duration,setDuration]=useState("5");
  const[lesson,setLesson]=useState("Be brave");
  const[customLesson,setCustomLesson]=useState("");const[extras,setExtras]=useState("");
  const[loading,setLoading]=useState(false);const[error,setError]=useState("");

  // Limit durations for young kids
  const availableDurations=age==="2-4"?DURATIONS.filter(d=>d.minutes<=5):DURATIONS;
  // Reset duration if current selection is no longer available
  useEffect(()=>{if(!availableDurations.find(d=>d.id===duration))setDuration(availableDurations[0].id);},[age]);

  const handleCreate=async()=>{
    if(!heroName.trim()){setError("Give your hero a name!");return;}
    setError("");setLoading(true);
    try{
      const result=generateStoryOffline({heroName:heroName.trim(),heroType:heroType.split(" ").slice(1).join(" "),obstacle,genre,age,lesson:lesson==="Write my own…"?customLesson:lesson,duration});
      const gc=GENRES.find(g=>g.id===genre);
      const story={id:"gen_"+Date.now(),title:result.title,emoji:result.emoji||"✨",color:gc?.color||"#6366f1",genre,age,pages:result.pages,generated:true,duration};
      await new Promise(r=>setTimeout(r,800));
      onStoryCreated(story);
    }catch(e){setError("Failed: "+e.message);}finally{setLoading(false);}
  };
  if(loading)return(<div className="generating"><div className="spinner"/><h2 style={{fontFamily:"'Baloo 2',cursive"}}>Creating your story…</h2><p style={{color:"var(--muted)",fontWeight:600}}>Mixing up something magical…</p></div>);
  return(<div className="builder">
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button className="icon-btn" onClick={onBack}>←</button><h2>✨ Create a Story</h2></div>
    <div className="safety-note">🛡️ All stories are kid-safe and age-appropriate.</div>
    {error&&<div className="error-msg">{error}</div>}
    <div className="builder-section"><label>Hero's Name</label><input type="text" placeholder="e.g. Luna, Max, Captain Sparkle…" value={heroName} onChange={e=>setHeroName(e.target.value)}/></div>
    <div className="builder-section"><label>Hero Type</label><div className="pill-row">{HERO_TYPES.map(h=><button key={h} className={`pill ${heroType===h?"active":""}`} style={heroType===h?{background:"var(--accent)"}:{}} onClick={()=>setHeroType(h)}>{h}</button>)}</div></div>
    <div className="builder-section"><label>Obstacle / Challenge (optional)</label><input type="text" placeholder="e.g. a big storm, a lost friend…" value={obstacle} onChange={e=>setObstacle(e.target.value)}/></div>
    <div className="builder-section"><label>Genre</label><div className="pill-row">{BUILDER_GENRES.map(g=><button key={g.id} className={`pill ${genre===g.id?"active":""}`} style={genre===g.id?{background:g.color}:{}} onClick={()=>setGenre(g.id)}>{g.emoji} {g.label}</button>)}</div></div>
    <div className="builder-section"><label>Reading Level</label><div className="pill-row">{AGE_GROUPS.map(a=><button key={a.id} className={`pill ${age===a.id?"active":""}`} style={age===a.id?{background:"var(--accent2)"}:{}} onClick={()=>setAge(a.id)}>{a.label}</button>)}</div></div>
    <div className="builder-section"><label>Story Length</label><div className="pill-row">{availableDurations.map(d=><button key={d.id} className={`pill ${duration===d.id?"active":""}`} style={duration===d.id?{background:"#e67e22"}:{}} onClick={()=>setDuration(d.id)}><span style={{display:"block",lineHeight:1.3}}>{d.label}<br/><span style={{fontSize:11,opacity:0.85}}>{d.desc}</span></span></button>)}</div></div>
    <div className="builder-section"><label>Lesson / Moral</label><select value={lesson} onChange={e=>setLesson(e.target.value)}>{LESSONS.map(l=><option key={l} value={l}>{l}</option>)}</select>{lesson==="Write my own…"&&<input type="text" placeholder="Type your lesson…" style={{marginTop:8}} value={customLesson} onChange={e=>setCustomLesson(e.target.value)}/>}</div>
    <div className="builder-section"><label>Extra Details (optional)</label><textarea placeholder="e.g. set in space, hero loves pizza…" value={extras} onChange={e=>setExtras(e.target.value)}/></div>
    <button className="pill-btn primary" style={{width:"100%",padding:16,fontSize:18}} onClick={handleCreate}>✨ Create My Story!</button>
  </div>);
}

// ─── SCENE ILLUSTRATIONS ─────────────────────────────────────────────────────

const SCENE_DATA = {
  adventure: {
    bgs: [
      "linear-gradient(180deg, #87CEEB 0%, #B4E4FF 40%, #7CB342 60%, #558B2F 100%)",
      "linear-gradient(180deg, #64B5F6 0%, #90CAF9 35%, #66BB6A 55%, #2E7D32 100%)",
      "linear-gradient(180deg, #FF9E80 0%, #FFE0B2 30%, #81C784 60%, #388E3C 100%)",
      "linear-gradient(180deg, #FF7043 0%, #FFAB91 25%, #CE93D8 50%, #5E35B1 100%)",
      "linear-gradient(180deg, #42A5F5 0%, #E3F2FD 40%, #A5D6A7 60%, #1B5E20 100%)",
      "linear-gradient(180deg, #FFA726 0%, #FFE0B2 35%, #66BB6A 60%, #33691E 100%)",
    ],
    layers: [
      [{e:"☀️",x:80,y:8,s:32},{e:"☁️",x:15,y:12,s:28},{e:"☁️",x:55,y:6,s:22},{e:"🌲",x:8,y:52,s:36},{e:"🌲",x:22,y:55,s:30},{e:"🦅",x:65,y:20,s:20},{e:"🌿",x:85,y:65,s:20}],
      [{e:"⛰️",x:10,y:35,s:44},{e:"⛰️",x:50,y:38,s:38},{e:"🌲",x:30,y:55,s:28},{e:"🦅",x:40,y:15,s:18},{e:"☁️",x:70,y:10,s:24},{e:"🌸",x:75,y:65,s:16}],
      [{e:"🌅",x:50,y:20,s:40},{e:"🌴",x:12,y:48,s:36},{e:"🌴",x:85,y:50,s:32},{e:"🦜",x:28,y:28,s:18},{e:"🌊",x:50,y:75,s:28}],
      [{e:"🌙",x:78,y:10,s:28},{e:"⭐",x:15,y:8,s:14},{e:"⭐",x:40,y:12,s:10},{e:"⭐",x:60,y:5,s:12},{e:"🏕️",x:45,y:55,s:36},{e:"🌲",x:15,y:50,s:32},{e:"🔥",x:48,y:68,s:16}],
      [{e:"☀️",x:75,y:10,s:30},{e:"🗺️",x:20,y:55,s:28},{e:"🧭",x:60,y:60,s:22},{e:"🌲",x:5,y:48,s:34},{e:"🦋",x:45,y:30,s:16},{e:"💎",x:80,y:58,s:18}],
      [{e:"🌤️",x:70,y:8,s:30},{e:"⛵",x:50,y:55,s:32},{e:"🌊",x:25,y:70,s:24},{e:"🌊",x:70,y:72,s:22},{e:"🐚",x:15,y:65,s:16},{e:"🦀",x:85,y:68,s:14}],
    ],
  },
  fantasy: {
    bgs: [
      "linear-gradient(180deg, #1A237E 0%, #4A148C 40%, #7B1FA2 70%, #CE93D8 100%)",
      "linear-gradient(180deg, #0D47A1 0%, #311B92 40%, #6A1B9A 70%, #E1BEE7 100%)",
      "linear-gradient(180deg, #4A148C 0%, #880E4F 40%, #E91E63 70%, #F8BBD0 100%)",
      "linear-gradient(180deg, #1B2631 0%, #2E4053 30%, #7D3C98 60%, #D2B4DE 100%)",
      "linear-gradient(180deg, #0D47A1 0%, #1565C0 35%, #7E57C2 60%, #B39DDB 100%)",
      "linear-gradient(180deg, #311B92 0%, #4527A0 30%, #E040FB 70%, #F3E5F5 100%)",
    ],
    layers: [
      [{e:"🌙",x:75,y:10,s:34},{e:"⭐",x:15,y:8,s:14},{e:"⭐",x:30,y:15,s:10},{e:"⭐",x:55,y:5,s:12},{e:"⭐",x:88,y:18,s:8},{e:"🏰",x:40,y:45,s:48},{e:"✨",x:20,y:40,s:16},{e:"✨",x:70,y:35,s:14}],
      [{e:"🌙",x:20,y:8,s:30},{e:"⭐",x:50,y:6,s:12},{e:"⭐",x:75,y:12,s:10},{e:"🐉",x:55,y:40,s:40},{e:"✨",x:30,y:30,s:18},{e:"✨",x:80,y:45,s:14},{e:"🔮",x:15,y:60,s:22}],
      [{e:"🌟",x:50,y:8,s:28},{e:"⭐",x:20,y:12,s:12},{e:"⭐",x:80,y:10,s:10},{e:"🧙",x:30,y:48,s:36},{e:"📖",x:65,y:55,s:24},{e:"✨",x:50,y:35,s:16},{e:"🦄",x:78,y:52,s:28}],
      [{e:"🌙",x:82,y:6,s:28},{e:"⭐",x:10,y:10,s:14},{e:"⭐",x:40,y:5,s:10},{e:"🧚",x:45,y:35,s:32},{e:"🌸",x:20,y:55,s:18},{e:"🌸",x:65,y:60,s:16},{e:"🦋",x:80,y:40,s:16},{e:"✨",x:35,y:25,s:12}],
      [{e:"⭐",x:25,y:8,s:14},{e:"⭐",x:60,y:12,s:10},{e:"⭐",x:85,y:6,s:12},{e:"🏰",x:15,y:42,s:40},{e:"🌈",x:55,y:30,s:36},{e:"🦄",x:75,y:50,s:28},{e:"✨",x:40,y:55,s:14}],
      [{e:"🌙",x:18,y:8,s:32},{e:"⭐",x:45,y:5,s:12},{e:"⭐",x:70,y:10,s:10},{e:"🐉",x:25,y:38,s:38},{e:"💎",x:60,y:50,s:22},{e:"✨",x:80,y:35,s:16},{e:"✨",x:45,y:60,s:12}],
    ],
  },
  friendship: {
    bgs: [
      "linear-gradient(180deg, #BBDEFB 0%, #FFF9C4 35%, #C8E6C9 60%, #81C784 100%)",
      "linear-gradient(180deg, #B3E5FC 0%, #FFECB3 30%, #DCEDC8 60%, #8BC34A 100%)",
      "linear-gradient(180deg, #F8BBD0 0%, #FCE4EC 30%, #E8F5E9 60%, #66BB6A 100%)",
      "linear-gradient(180deg, #E1BEE7 0%, #FFF3E0 35%, #C8E6C9 60%, #43A047 100%)",
      "linear-gradient(180deg, #B2EBF2 0%, #FFFDE7 35%, #DCEDC8 60%, #7CB342 100%)",
      "linear-gradient(180deg, #FFE0B2 0%, #FFF8E1 30%, #E8F5E9 60%, #4CAF50 100%)",
    ],
    layers: [
      [{e:"☀️",x:78,y:8,s:30},{e:"🏠",x:18,y:48,s:36},{e:"🏡",x:55,y:50,s:34},{e:"🌳",x:38,y:45,s:30},{e:"🌻",x:75,y:62,s:18},{e:"🌻",x:85,y:65,s:14}],
      [{e:"🌤️",x:72,y:6,s:28},{e:"🌳",x:10,y:45,s:34},{e:"🌳",x:85,y:48,s:30},{e:"🌸",x:30,y:60,s:16},{e:"🌸",x:50,y:63,s:14},{e:"🦋",x:45,y:30,s:16},{e:"💛",x:60,y:25,s:18}],
      [{e:"☀️",x:50,y:5,s:28},{e:"🌈",x:50,y:22,s:40},{e:"🏫",x:35,y:50,s:38},{e:"🌳",x:8,y:48,s:30},{e:"🌺",x:80,y:60,s:16},{e:"🐕",x:70,y:62,s:18}],
      [{e:"🌅",x:50,y:15,s:36},{e:"🏠",x:20,y:50,s:32},{e:"🌳",x:55,y:46,s:32},{e:"❤️",x:40,y:30,s:16},{e:"🌻",x:75,y:58,s:18},{e:"🐱",x:82,y:62,s:16}],
      [{e:"☀️",x:82,y:8,s:28},{e:"⛲",x:45,y:50,s:34},{e:"🌳",x:10,y:44,s:32},{e:"🌳",x:78,y:46,s:28},{e:"🌺",x:25,y:62,s:16},{e:"🌺",x:65,y:64,s:14},{e:"🦋",x:55,y:28,s:14}],
      [{e:"🌤️",x:15,y:8,s:26},{e:"🏡",x:30,y:48,s:36},{e:"🌻",x:60,y:58,s:20},{e:"🌻",x:72,y:62,s:16},{e:"🐕",x:15,y:60,s:20},{e:"💛",x:50,y:22,s:16}],
    ],
  },
  silly: {
    bgs: [
      "linear-gradient(135deg, #FF6F00 0%, #FFD600 25%, #00E676 50%, #2979FF 75%, #D500F9 100%)",
      "linear-gradient(135deg, #F50057 0%, #FF9100 25%, #FFEA00 50%, #00E5FF 75%, #651FFF 100%)",
      "linear-gradient(180deg, #E040FB 0%, #FF4081 25%, #FFAB40 50%, #69F0AE 75%, #40C4FF 100%)",
      "linear-gradient(135deg, #00BCD4 0%, #CDDC39 25%, #FF9800 50%, #E91E63 75%, #9C27B0 100%)",
      "linear-gradient(180deg, #FFEB3B 0%, #FF5722 30%, #9C27B0 60%, #2196F3 100%)",
      "linear-gradient(135deg, #76FF03 0%, #FFEA00 25%, #FF3D00 50%, #AA00FF 75%, #00B0FF 100%)",
    ],
    layers: [
      [{e:"🙃",x:20,y:15,s:28,r:-180},{e:"🎪",x:50,y:40,s:44},{e:"🎈",x:75,y:20,s:22},{e:"🎈",x:85,y:28,s:18},{e:"🤡",x:15,y:55,s:24},{e:"🎉",x:70,y:58,s:18}],
      [{e:"🦄",x:40,y:35,s:40},{e:"🌈",x:50,y:10,s:36},{e:"🎵",x:15,y:25,s:18},{e:"🎵",x:75,y:20,s:14},{e:"💫",x:25,y:50,s:16},{e:"🍭",x:80,y:55,s:20}],
      [{e:"🐔",x:30,y:45,s:32},{e:"👑",x:32,y:30,s:18},{e:"🎂",x:65,y:50,s:28},{e:"🎈",x:15,y:18,s:20},{e:"🎈",x:82,y:15,s:22},{e:"🎊",x:50,y:20,s:18}],
      [{e:"🤪",x:45,y:10,s:30},{e:"🍕",x:20,y:45,s:28},{e:"🍝",x:65,y:48,s:26},{e:"🎸",x:80,y:30,s:22},{e:"💃",x:15,y:30,s:24},{e:"🎪",x:50,y:55,s:30}],
      [{e:"🙃",x:50,y:8,s:26,r:-180},{e:"🏠",x:35,y:40,s:34,r:-180},{e:"☁️",x:20,y:68,s:24},{e:"☁️",x:70,y:72,s:20},{e:"🐦",x:60,y:60,s:16,r:-180},{e:"😂",x:80,y:35,s:22}],
      [{e:"🎈",x:10,y:10,s:20},{e:"🎈",x:30,y:15,s:18},{e:"🎈",x:55,y:8,s:22},{e:"🎈",x:80,y:12,s:16},{e:"🎂",x:45,y:45,s:38},{e:"🎉",x:20,y:55,s:20},{e:"🎊",x:72,y:52,s:18}],
    ],
  },
  mystery: {
    bgs: [
      "linear-gradient(180deg, #1A237E 0%, #283593 35%, #37474F 65%, #263238 100%)",
      "linear-gradient(180deg, #0D47A1 0%, #1565C0 30%, #455A64 60%, #37474F 100%)",
      "linear-gradient(180deg, #212121 0%, #37474F 35%, #455A64 65%, #546E7A 100%)",
      "linear-gradient(180deg, #1B2631 0%, #2C3E50 35%, #34495E 65%, #5D6D7E 100%)",
      "linear-gradient(180deg, #263238 0%, #37474F 30%, #546E7A 60%, #78909C 100%)",
      "linear-gradient(180deg, #0D47A1 0%, #1976D2 35%, #455A64 65%, #263238 100%)",
    ],
    layers: [
      [{e:"🌙",x:78,y:8,s:28},{e:"⭐",x:20,y:10,s:10},{e:"⭐",x:45,y:5,s:8},{e:"🏚️",x:40,y:42,s:44},{e:"🌫️",x:15,y:60,s:28},{e:"🌫️",x:70,y:62,s:24},{e:"🦇",x:65,y:22,s:16}],
      [{e:"🌙",x:15,y:6,s:26},{e:"🔍",x:45,y:40,s:38},{e:"👣",x:25,y:60,s:18},{e:"👣",x:38,y:62,s:16},{e:"👣",x:50,y:64,s:14},{e:"🌫️",x:75,y:55,s:26},{e:"🦉",x:80,y:25,s:18}],
      [{e:"⭐",x:30,y:8,s:10},{e:"⭐",x:60,y:5,s:8},{e:"🔦",x:35,y:35,s:30},{e:"📝",x:65,y:45,s:24},{e:"🕯️",x:20,y:50,s:20},{e:"🗝️",x:78,y:55,s:18},{e:"🕸️",x:85,y:18,s:22}],
      [{e:"🌙",x:82,y:6,s:24},{e:"🏠",x:35,y:42,s:40},{e:"🔍",x:60,y:50,s:28},{e:"📎",x:20,y:55,s:16},{e:"🐾",x:72,y:65,s:16},{e:"🌫️",x:50,y:68,s:22}],
      [{e:"⭐",x:15,y:8,s:12},{e:"⭐",x:50,y:5,s:10},{e:"📕",x:40,y:40,s:32},{e:"🔍",x:55,y:38,s:26},{e:"💡",x:75,y:25,s:22},{e:"🗝️",x:22,y:55,s:18}],
      [{e:"☀️",x:75,y:8,s:28},{e:"😊",x:35,y:45,s:30},{e:"🎉",x:55,y:42,s:26},{e:"📖",x:20,y:55,s:22},{e:"✅",x:75,y:55,s:20},{e:"🌳",x:8,y:48,s:28}],
    ],
  },
  science: {
    bgs: [
      "linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 35%, #E8EAF6 65%, #C5CAE9 100%)",
      "linear-gradient(180deg, #E1F5FE 0%, #B3E5FC 30%, #E0F7FA 60%, #B2EBF2 100%)",
      "linear-gradient(180deg, #F3E5F5 0%, #E1BEE7 35%, #EDE7F6 60%, #D1C4E9 100%)",
      "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 35%, #F1F8E9 60%, #DCEDC8 100%)",
      "linear-gradient(180deg, #FFFDE7 0%, #FFF9C4 30%, #FFF3E0 60%, #FFE0B2 100%)",
      "linear-gradient(180deg, #E0F2F1 0%, #B2DFDB 35%, #E0F7FA 60%, #80DEEA 100%)",
    ],
    layers: [
      [{e:"🔬",x:40,y:38,s:40},{e:"🧪",x:70,y:45,s:28},{e:"⚗️",x:18,y:50,s:24},{e:"💡",x:55,y:12,s:22},{e:"⚡",x:80,y:20,s:16},{e:"🫧",x:25,y:22,s:14},{e:"🫧",x:35,y:15,s:10}],
      [{e:"🌱",x:30,y:50,s:32},{e:"🌱",x:50,y:48,s:28},{e:"🌻",x:70,y:42,s:34},{e:"☀️",x:78,y:8,s:28},{e:"💧",x:42,y:28,s:16},{e:"💧",x:55,y:25,s:12},{e:"🐛",x:18,y:60,s:16}],
      [{e:"🔭",x:35,y:40,s:38},{e:"🌙",x:65,y:15,s:28},{e:"⭐",x:20,y:10,s:14},{e:"⭐",x:45,y:8,s:10},{e:"⭐",x:80,y:12,s:12},{e:"🪐",x:78,y:30,s:22}],
      [{e:"🌋",x:40,y:38,s:44},{e:"🧪",x:15,y:50,s:24},{e:"💥",x:42,y:20,s:22},{e:"🫧",x:60,y:28,s:16},{e:"🫧",x:70,y:22,s:12},{e:"🫧",x:55,y:15,s:10}],
      [{e:"🧲",x:35,y:42,s:34},{e:"⚡",x:50,y:25,s:20},{e:"💡",x:72,y:35,s:24},{e:"📊",x:15,y:50,s:22},{e:"🔋",x:80,y:55,s:18},{e:"⚙️",x:55,y:58,s:16}],
      [{e:"🌍",x:45,y:35,s:42},{e:"☀️",x:78,y:8,s:26},{e:"🚀",x:20,y:25,s:24},{e:"⭐",x:15,y:10,s:12},{e:"⭐",x:60,y:8,s:10},{e:"🛸",x:75,y:28,s:18}],
    ],
  },
  animals: {
    bgs: [
      "linear-gradient(180deg, #81D4FA 0%, #B3E5FC 35%, #A5D6A7 55%, #66BB6A 75%, #388E3C 100%)",
      "linear-gradient(180deg, #4FC3F7 0%, #B3E5FC 30%, #C8E6C9 55%, #81C784 75%, #2E7D32 100%)",
      "linear-gradient(180deg, #80DEEA 0%, #B2EBF2 30%, #80CBC4 55%, #4DB6AC 75%, #00897B 100%)",
      "linear-gradient(180deg, #90CAF9 0%, #BBDEFB 35%, #C5E1A5 55%, #9CCC65 75%, #558B2F 100%)",
      "linear-gradient(180deg, #FFE082 0%, #FFF8E1 25%, #C8E6C9 50%, #66BB6A 75%, #2E7D32 100%)",
      "linear-gradient(180deg, #FFAB91 0%, #FFCCBC 30%, #A5D6A7 55%, #66BB6A 75%, #1B5E20 100%)",
    ],
    layers: [
      [{e:"☀️",x:80,y:6,s:28},{e:"🌳",x:8,y:42,s:36},{e:"🌳",x:88,y:45,s:32},{e:"🌸",x:25,y:58,s:16},{e:"🌸",x:45,y:62,s:14},{e:"🐰",x:35,y:55,s:24},{e:"🦋",x:60,y:25,s:16}],
      [{e:"☁️",x:20,y:8,s:24},{e:"☁️",x:60,y:5,s:20},{e:"🌿",x:10,y:55,s:22},{e:"🐦",x:70,y:22,s:20},{e:"🐿️",x:40,y:52,s:22},{e:"🍄",x:25,y:60,s:16},{e:"🌻",x:78,y:56,s:20}],
      [{e:"🌤️",x:75,y:6,s:26},{e:"🌊",x:50,y:65,s:28},{e:"🐢",x:30,y:55,s:26},{e:"🐸",x:60,y:58,s:22},{e:"🌿",x:12,y:50,s:22},{e:"🪷",x:45,y:60,s:16},{e:"🦆",x:72,y:55,s:18}],
      [{e:"🌙",x:78,y:8,s:26},{e:"⭐",x:25,y:10,s:10},{e:"⭐",x:50,y:6,s:8},{e:"🦉",x:35,y:38,s:30},{e:"🌳",x:30,y:42,s:38},{e:"🦊",x:65,y:55,s:24},{e:"🌿",x:82,y:58,s:18}],
      [{e:"☀️",x:15,y:6,s:26},{e:"🐝",x:45,y:22,s:16},{e:"🐝",x:55,y:18,s:14},{e:"🌻",x:30,y:48,s:28},{e:"🌻",x:50,y:50,s:24},{e:"🌻",x:68,y:52,s:26},{e:"🐛",x:80,y:60,s:14}],
      [{e:"🌈",x:50,y:12,s:36},{e:"🌳",x:8,y:42,s:34},{e:"🌳",x:85,y:44,s:30},{e:"🐻",x:35,y:52,s:28},{e:"🦌",x:60,y:50,s:26},{e:"🌸",x:48,y:62,s:14},{e:"🐦",x:22,y:25,s:16}],
    ],
  },
  sports: {
    bgs: [
      "linear-gradient(180deg, #42A5F5 0%, #90CAF9 35%, #66BB6A 55%, #43A047 70%, #2E7D32 100%)",
      "linear-gradient(180deg, #64B5F6 0%, #BBDEFB 30%, #81C784 55%, #4CAF50 70%, #388E3C 100%)",
      "linear-gradient(180deg, #29B6F6 0%, #81D4FA 30%, #AED581 55%, #7CB342 70%, #558B2F 100%)",
      "linear-gradient(180deg, #FF7043 0%, #FFAB91 25%, #81C784 50%, #43A047 70%, #1B5E20 100%)",
      "linear-gradient(180deg, #42A5F5 0%, #E3F2FD 35%, #4DB6AC 55%, #00897B 70%, #004D40 100%)",
      "linear-gradient(180deg, #FFA726 0%, #FFE0B2 30%, #AED581 55%, #689F38 70%, #33691E 100%)",
    ],
    layers: [
      [{e:"☀️",x:80,y:6,s:28},{e:"⚽",x:40,y:48,s:30},{e:"🥅",x:75,y:42,s:34},{e:"🏃",x:25,y:50,s:26},{e:"🌳",x:5,y:40,s:30},{e:"👏",x:60,y:18,s:18}],
      [{e:"🏀",x:45,y:35,s:30},{e:"🏟️",x:45,y:50,s:48},{e:"☁️",x:20,y:8,s:22},{e:"☁️",x:65,y:5,s:18},{e:"🎉",x:75,y:22,s:18},{e:"👟",x:20,y:62,s:16}],
      [{e:"🌤️",x:78,y:6,s:26},{e:"🏊",x:45,y:50,s:32},{e:"🌊",x:30,y:60,s:24},{e:"🌊",x:60,y:58,s:22},{e:"🏅",x:20,y:28,s:22},{e:"🎉",x:75,y:35,s:16}],
      [{e:"⚾",x:40,y:30,s:26},{e:"🏟️",x:50,y:52,s:44},{e:"☀️",x:82,y:6,s:26},{e:"🌳",x:5,y:42,s:28},{e:"🎺",x:75,y:25,s:18},{e:"🏆",x:20,y:22,s:22}],
      [{e:"🚲",x:40,y:45,s:32},{e:"🏔️",x:70,y:28,s:38},{e:"☁️",x:25,y:8,s:22},{e:"☀️",x:80,y:6,s:24},{e:"🌲",x:8,y:42,s:28},{e:"🦅",x:55,y:15,s:16}],
      [{e:"🏆",x:45,y:35,s:40},{e:"🎉",x:20,y:25,s:20},{e:"🎊",x:70,y:22,s:18},{e:"⭐",x:30,y:12,s:14},{e:"⭐",x:60,y:8,s:12},{e:"⭐",x:45,y:5,s:10},{e:"👏",x:80,y:45,s:18}],
    ],
  },
};

function SceneIllustration({ genre, pageIdx }) {
  const data = SCENE_DATA[genre] || SCENE_DATA.adventure;
  const bgIdx = pageIdx % data.bgs.length;
  const layerIdx = pageIdx % data.layers.length;
  return (
    <div className="scene" style={{ background: data.bgs[bgIdx] }}>
      {data.layers[layerIdx].map((el, i) => (
        <div key={i} className="scene-el" style={{
          left: `${el.x}%`, top: `${el.y}%`,
          fontSize: el.s || 24,
          transform: `translate(-50%,-50%)${el.r ? ` rotate(${el.r}deg)` : ""}`,
        }}>{el.e}</div>
      ))}
    </div>
  );
}

function ReaderScreen({story,onBack,speech}){
  const[pageIdx,setPageIdx]=useState(0);const[rating,setRating]=useState(0);const[finished,setFinished]=useState(false);
  const pages=story.pages;const page=pages[pageIdx];
  const readPage=()=>{speech.speak(page[1],()=>{if(pageIdx<pages.length-1)setPageIdx(p=>p+1);else setFinished(true);});};
  useEffect(()=>{speech.stop();},[pageIdx]);useEffect(()=>()=>speech.stop(),[]);
  if(finished)return(<div className="reader"><div className="end-screen">
    <div className="big-emoji">🎉</div><h2>The End!</h2><p style={{color:"var(--muted)",fontWeight:600}}>How did you like this story?</p>
    <div className="stars">{[1,2,3,4,5].map(n=><span key={n} className={`star ${n<=rating?"filled":""}`} onClick={()=>setRating(n)}>⭐</span>)}</div>
    <button className="pill-btn primary" onClick={()=>{setPageIdx(0);setFinished(false);setRating(0);}}>📖 Read Again</button>
    <button className="pill-btn secondary" onClick={onBack}>← Back to Library</button>
  </div></div>);
  const tw=page[1].split(/\s+/);
  return(<div className="reader">
    <div className="reader-header"><button className="icon-btn" onClick={()=>{speech.stop();onBack();}}>←</button><h2>{story.emoji} {story.title}</h2></div>
    <div className="reader-content"><SceneIllustration genre={story.genre} pageIdx={pageIdx}/><div className="page-title">{page[0]}</div><div className="story-text">{tw.map((w,i)=><span key={i} className={`word ${speech.speaking&&i===speech.wordIndex?"active":""}`}>{w}{" "}</span>)}</div></div>
    <div className="reader-controls"><div className="progress-bar"><div className="progress-fill" style={{width:`${((pageIdx+1)/pages.length)*100}%`}}/></div>
    <div className="controls-row"><button className="ctrl-btn" disabled={pageIdx===0} onClick={()=>{speech.stop();setPageIdx(p=>p-1);}}>⏮</button><button className="ctrl-btn play" onClick={()=>{if(speech.speaking)speech.stop();else readPage();}}>{speech.speaking?"⏸":"▶️"}</button><button className="ctrl-btn" disabled={pageIdx>=pages.length-1} onClick={()=>{speech.stop();setPageIdx(p=>p+1);}}>⏭</button></div></div>
  </div>);
}

function LibraryScreen({stories,onSelect,onCreateNew,setShowVoice}){
  const[gf,setGf]=useState("all");const[af,setAf]=useState(null);
  const filtered=stories.filter(s=>{if(gf!=="all"&&s.genre!==gf)return false;if(af&&s.age!==af)return false;return true;});
  return(<>
    <div className="header"><h1>📚 StoryTime</h1><div className="header-btns"><button className="icon-btn" onClick={()=>setShowVoice(true)}>🎙️</button></div></div>
    <div className="genre-tabs">{GENRES.map(g=><button key={g.id} className={`genre-tab ${gf===g.id?"active":""}`} style={gf===g.id?{background:g.color,borderColor:g.color,color:"#fff"}:{}} onClick={()=>setGf(g.id)}>{g.emoji} {g.label}</button>)}</div>
    <div className="age-filter">{AGE_GROUPS.map(a=><button key={a.id} className={`age-btn ${af===a.id?"active":""}`} onClick={()=>setAf(af===a.id?null:a.id)}>{a.label}</button>)}</div>
    <div className="story-grid">
      <div className="story-card create-card" onClick={onCreateNew}><div className="emoji">✨</div><div className="title">Create a New Story</div></div>
      {filtered.map(s=><div key={s.id} className="story-card" onClick={()=>onSelect(s)}>
        {s.generated&&<div className="my-badge">MY STORY</div>}
        <div className="emoji">{s.emoji}</div><div className="title">{s.title}</div>
        <div className="badges"><span className="badge" style={{background:s.color}}>{GENRES.find(g=>g.id===s.genre)?.label}</span><span className="badge" style={{background:"#6c5ce7"}}>{AGE_GROUPS.find(a=>a.id===s.age)?.label}</span></div>
      </div>)}
    </div>
  </>);
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App(){
  const[screen,setScreen]=useState("library");const[cur,setCur]=useState(null);
  const[stories,setStories]=useState(ALL_STORIES);const[showVoice,setShowVoice]=useState(false);
  const[loaded,setLoaded]=useState(false);const speech=useSpeech();
  useEffect(()=>{loadSaved().then(saved=>{if(saved.length)setStories([...saved,...ALL_STORIES]);setLoaded(true);});},[]);
  const handleSelect=s=>{setCur(s);setScreen("reader");};
  const handleBack=()=>{setScreen("library");setCur(null);};
  const handleCreated=async s=>{setStories(prev=>{const next=[s,...prev];saveToDisk(next.filter(x=>x.generated));return next;});setCur(s);setScreen("reader");};
  if(!loaded)return(<><style>{css}</style><div className="generating"><div className="spinner"/><p style={{color:"var(--muted)",fontWeight:600}}>Loading…</p></div></>);
  return(<><style>{css}</style><div className="app">
    {screen==="library"&&<LibraryScreen stories={stories} onSelect={handleSelect} onCreateNew={()=>setScreen("builder")} setShowVoice={setShowVoice}/>}
    {screen==="reader"&&cur&&<ReaderScreen story={cur} onBack={handleBack} speech={speech}/>}
    {screen==="builder"&&<BuilderScreen onBack={()=>setScreen("library")} onStoryCreated={handleCreated}/>}
  </div><VoiceModal show={showVoice} onClose={()=>setShowVoice(false)} allVoices={speech.allVoices} voice={speech.voice} setVoice={speech.setVoice} rate={speech.rate} setRate={speech.setRate}/></>);
}
