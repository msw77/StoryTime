"use client";

import { useState, useEffect, useCallback } from "react";

interface LoadingScreenProps {
  genre?: string;
  heroName?: string;
  /** "story" = writing the story, "illustrations" = generating first images */
  phase?: "story" | "illustrations";
  /** 0–100 progress value */
  progress?: number;
  /** Optional callback — when set, renders a "Read something else"
   *  button at the bottom of the screen. Tapping it navigates the user
   *  back to the library while the generation keeps running in the
   *  background. When it finishes, the parent auto-saves the story and
   *  fires a toast + ding. Omit this prop to render the original
   *  blocking-only loading experience. */
  onDetach?: () => void;
}

// ─── Riddles & Jokes (kid-tested, parent-approved) ───────────────────

const JOKES: { setup: string; punchline: string; genres?: string[] }[] = [
  // Classic riddles
  { setup: "What has hands but can't clap?", punchline: "A clock!" },
  { setup: "What has a head and a tail but no body?", punchline: "A coin!" },
  { setup: "What can you catch but never throw?", punchline: "A cold!" },
  { setup: "What gets wetter the more it dries?", punchline: "A towel!" },
  { setup: "What has legs but doesn't walk?", punchline: "A table!" },
  { setup: "What has ears but cannot hear?", punchline: "A cornfield!" },
  { setup: "What goes up but never comes down?", punchline: "Your age!" },
  { setup: "What has a neck but no head?", punchline: "A bottle!" },
  { setup: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?", punchline: "A map!" },
  { setup: "What building has the most stories?", punchline: "A library!" },
  { setup: "What has four wheels and flies?", punchline: "A garbage truck!" },
  { setup: "What can travel around the world while staying in a corner?", punchline: "A stamp!" },
  { setup: "What invention lets you look right through a wall?", punchline: "A window!" },
  { setup: "What can fill a room but takes up no space?", punchline: "Light!" },
  { setup: "What runs but never walks?", punchline: "Water!" },
  { setup: "What has one eye but cannot see?", punchline: "A needle!" },
  { setup: "What gets bigger the more you take away from it?", punchline: "A hole!" },
  { setup: "What has many keys but can't open a single lock?", punchline: "A piano!" },
  { setup: "What is full of holes but still holds water?", punchline: "A sponge!" },
  { setup: "What has a thumb and four fingers but is not alive?", punchline: "A glove!" },
  { setup: "What has words but never speaks?", punchline: "A book!" },
  { setup: "What comes down but never goes up?", punchline: "Rain!" },
  { setup: "What has branches but no leaves, trunk, or fruit?", punchline: "A bank!" },
  { setup: "What has a bottom at the top?", punchline: "A leg!" },
  { setup: "What kind of room has no doors or windows?", punchline: "A mushroom!" },
  { setup: "What has forests but no trees, cities but no people, and rivers but no water?", punchline: "A map!" },
  { setup: "What has teeth but cannot chew?", punchline: "A zipper!" },
  { setup: "What tastes better than it smells?", punchline: "Your tongue!" },
  { setup: "What begins with T, ends with T, and has T in it?", punchline: "A teapot!" },
  { setup: "What has to be broken before you can use it?", punchline: "An egg!" },
  { setup: "What can you hold without ever touching it?", punchline: "Your breath!" },
  { setup: "What gets sharper the more you use it?", punchline: "Your brain!" },
  { setup: "What kind of coat is always wet when you put it on?", punchline: "A coat of paint!" },
  { setup: "The more you take, the more you leave behind. What are they?", punchline: "Footsteps!" },

  // Adventure & pirates
  { setup: "What did the ocean say to the pirate?", punchline: "Nothing — it just waved!", genres: ["adventure"] },
  { setup: "Why do pirates take so long to learn the alphabet?", punchline: "Because they spend years at C!", genres: ["adventure"] },
  { setup: "What lies at the bottom of the ocean and twitches?", punchline: "A nervous wreck!", genres: ["adventure"] },
  { setup: "Where do sharks go on vacation?", punchline: "Finland!", genres: ["adventure"] },
  { setup: "How much did the pirate pay for his earrings?", punchline: "A buccaneer!", genres: ["adventure"] },
  { setup: "What's a pirate's favorite letter?", punchline: "You'd think it's R, but it's the C they love!", genres: ["adventure"] },
  { setup: "Why couldn't the sailors play cards?", punchline: "The captain was standing on the deck!", genres: ["adventure"] },
  { setup: "What did one tide pool say to the other?", punchline: "Show me your mussels!", genres: ["adventure"] },
  { setup: "What kind of sandwich can swim?", punchline: "A submarine!", genres: ["adventure"] },
  { setup: "Where do mountain climbers keep their money?", punchline: "In a snow bank!", genres: ["adventure"] },

  // Fantasy
  { setup: "Why did the wizard fail his test?", punchline: "He couldn't spell!", genres: ["fantasy"] },
  { setup: "What do you get when you cross a snowman and a vampire?", punchline: "Frostbite!", genres: ["fantasy"] },
  { setup: "Why do dragons sleep during the day?", punchline: "So they can fight knights!", genres: ["fantasy"] },
  { setup: "What's a witch's favorite subject in school?", punchline: "Spelling!", genres: ["fantasy"] },
  { setup: "What do you call a fairy who hasn't taken a bath?", punchline: "Stinker Bell!", genres: ["fantasy"] },
  { setup: "Why don't dragons like fast food?", punchline: "Because they can't catch it!", genres: ["fantasy"] },
  { setup: "What kind of photos do unicorns take?", punchline: "Selfies in the rainbow!", genres: ["fantasy"] },
  { setup: "How do you know a fairy is tired?", punchline: "She starts wand-ering off!", genres: ["fantasy"] },
  { setup: "What does a wizard say to a broken spell?", punchline: "Abra-ca-oops!", genres: ["fantasy"] },
  { setup: "Why did the dragon eat the knight?", punchline: "It was a light snack — only a tin of meat!", genres: ["fantasy"] },
  { setup: "What's a ghost's favorite dessert?", punchline: "Boo-berry pie!", genres: ["fantasy"] },
  { setup: "What do you call a friendly giant?", punchline: "Anything he wants!", genres: ["fantasy"] },

  // Animals
  { setup: "What do you call a sleeping dinosaur?", punchline: "A dino-snore!", genres: ["animals"] },
  { setup: "Why don't elephants use computers?", punchline: "Because they're afraid of the mouse!", genres: ["animals"] },
  { setup: "What do you call a fish without eyes?", punchline: "A fsh!", genres: ["animals"] },
  { setup: "How do bees get to school?", punchline: "On the school buzz!", genres: ["animals"] },
  { setup: "What do you call a bear with no teeth?", punchline: "A gummy bear!", genres: ["animals"] },
  { setup: "Why do cows wear bells?", punchline: "Because their horns don't work!", genres: ["animals"] },
  { setup: "What do you call an alligator in a vest?", punchline: "An in-vest-igator!", genres: ["animals"] },
  { setup: "What do you call a cow with no legs?", punchline: "Ground beef!", genres: ["animals"] },
  { setup: "Why are fish so smart?", punchline: "They live in schools!", genres: ["animals"] },
  { setup: "What do you call a dog magician?", punchline: "A labracadabrador!", genres: ["animals"] },
  { setup: "What do you call a pig that does karate?", punchline: "A pork chop!", genres: ["animals"] },
  { setup: "What kind of music do rabbits like?", punchline: "Hip hop!", genres: ["animals"] },
  { setup: "What do you call a snake that builds things?", punchline: "A boa constructor!", genres: ["animals"] },
  { setup: "Why do seagulls fly over the sea?", punchline: "Because if they flew over the bay, they'd be bagels!", genres: ["animals"] },
  { setup: "What's a cat's favorite color?", punchline: "Purr-ple!", genres: ["animals"] },
  { setup: "What do you call a lazy kangaroo?", punchline: "A pouch potato!", genres: ["animals"] },
  { setup: "What do frogs order at restaurants?", punchline: "French flies and a diet croak!", genres: ["animals"] },
  { setup: "What's a penguin's favorite relative?", punchline: "Aunt Arctica!", genres: ["animals"] },
  { setup: "Why don't oysters share their pearls?", punchline: "Because they're shellfish!", genres: ["animals"] },
  { setup: "What do you call a tired T-Rex?", punchline: "A dino-snore!", genres: ["animals"] },

  // Silly
  { setup: "Why did the banana go to the doctor?", punchline: "It wasn't peeling well!", genres: ["silly"] },
  { setup: "What did the zero say to the eight?", punchline: "Nice belt!", genres: ["silly"] },
  { setup: "Why did the teddy bear say no to dessert?", punchline: "Because she was already stuffed!", genres: ["silly"] },
  { setup: "What do you call cheese that isn't yours?", punchline: "Nacho cheese!", genres: ["silly"] },
  { setup: "Why couldn't the pony sing?", punchline: "Because she was a little horse!", genres: ["silly"] },
  { setup: "Why did the cookie go to the doctor?", punchline: "Because it felt crummy!", genres: ["silly"] },
  { setup: "What do you call a fake noodle?", punchline: "An impasta!", genres: ["silly"] },
  { setup: "Why did the scarecrow win an award?", punchline: "He was outstanding in his field!", genres: ["silly"] },
  { setup: "What kind of shoes do ninjas wear?", punchline: "Sneakers!", genres: ["silly"] },
  { setup: "Why did the math book look so sad?", punchline: "It had too many problems!", genres: ["silly"] },
  { setup: "What do you call a bear in the rain?", punchline: "A drizzly bear!", genres: ["silly"] },
  { setup: "Why don't skeletons fight each other?", punchline: "They don't have the guts!", genres: ["silly"] },
  { setup: "What did one wall say to the other?", punchline: "I'll meet you at the corner!", genres: ["silly"] },
  { setup: "Why did the picture go to jail?", punchline: "Because it was framed!", genres: ["silly"] },
  { setup: "What do you give a sick lemon?", punchline: "Lemon-aid!", genres: ["silly"] },
  { setup: "How do you organize a space party?", punchline: "You planet!", genres: ["silly"] },
  { setup: "Why did the egg hide?", punchline: "It was a little chicken!", genres: ["silly"] },
  { setup: "What do you call a dinosaur with an extensive vocabulary?", punchline: "A thesaurus!", genres: ["silly"] },

  // Science
  { setup: "Why can't you trust atoms?", punchline: "They make up everything!", genres: ["science"] },
  { setup: "How do scientists freshen their breath?", punchline: "With experi-mints!", genres: ["science"] },
  { setup: "What did the earth say to the other planets?", punchline: "You guys have no life!", genres: ["science"] },
  { setup: "Why did the sun go to school?", punchline: "To get a little brighter!", genres: ["science"] },
  { setup: "Why are chemists great at solving problems?", punchline: "They have all the solutions!", genres: ["science"] },
  { setup: "What did the scientist say when he found two isotopes of helium?", punchline: "HeHe!", genres: ["science"] },
  { setup: "Why did the physicist break up with biology?", punchline: "There was no chemistry!", genres: ["science"] },
  { setup: "What do planets like to read?", punchline: "Comet books!", genres: ["science"] },
  { setup: "Why is the moon so tired?", punchline: "Because it works the night shift!", genres: ["science"] },
  { setup: "How does the sun listen to music?", punchline: "On a ray-dio!", genres: ["science"] },

  // Mystery
  { setup: "What has keys but can't open locks?", punchline: "A piano!", genres: ["mystery"] },
  { setup: "What has many teeth but can't bite?", punchline: "A comb!", genres: ["mystery"] },
  { setup: "What can you break without touching it?", punchline: "A promise!", genres: ["mystery"] },
  { setup: "What disappears as soon as you say its name?", punchline: "Silence!", genres: ["mystery"] },
  { setup: "I'm tall when I'm young and short when I'm old. What am I?", punchline: "A candle!", genres: ["mystery"] },
  { setup: "What goes through towns and over hills but never moves?", punchline: "A road!", genres: ["mystery"] },
  { setup: "What has a face and two hands but no arms or legs?", punchline: "A clock!", genres: ["mystery"] },

  // Sports
  { setup: "Why are basketball players messy eaters?", punchline: "They're always dribbling!", genres: ["sports"] },
  { setup: "Why did the golfer wear two pairs of pants?", punchline: "In case he got a hole in one!", genres: ["sports"] },
  { setup: "Why is tennis such a loud sport?", punchline: "Because every player raises a racket!", genres: ["sports"] },
  { setup: "Why did the soccer ball quit the team?", punchline: "It was tired of being kicked around!", genres: ["sports"] },
  { setup: "What did the baseball glove say to the ball?", punchline: "Catch you later!", genres: ["sports"] },
  { setup: "Why can't you play basketball with pigs?", punchline: "They hog the ball!", genres: ["sports"] },
  { setup: "What's a skeleton's favorite sport?", punchline: "Skull-ball!", genres: ["sports"] },

  // History
  { setup: "How did the Vikings send messages?", punchline: "By Norse code!", genres: ["history"] },
  { setup: "Why were the early days of history called the Dark Ages?", punchline: "Because there were so many knights!", genres: ["history"] },
  { setup: "What did King Tut say when he got scared?", punchline: "I want my mummy!", genres: ["history"] },
  { setup: "Why did the knight run around his bedroom?", punchline: "He was trying to catch up on his sleep!", genres: ["history"] },
  { setup: "What's a pharaoh's favorite dance?", punchline: "The mummy shuffle!", genres: ["history"] },
  { setup: "Why did the Romans build straight roads?", punchline: "So their soldiers wouldn't go around the bend!", genres: ["history"] },

  // Friendship
  { setup: "What did the left hand say to the right hand?", punchline: "How does it feel to always be right?", genres: ["friendship"] },
  { setup: "What do you call two best friend bananas?", punchline: "A great pair!", genres: ["friendship"] },
  { setup: "Why did the two spiders get along?", punchline: "They were real web buddies!", genres: ["friendship"] },
  { setup: "What did one raindrop say to the other?", punchline: "Two's company, three's a cloud!", genres: ["friendship"] },
  { setup: "Why are peas such good friends?", punchline: "They're always in the same pod!", genres: ["friendship"] },

  // Food jokes
  { setup: "Why did the tomato turn red?", punchline: "Because it saw the salad dressing!" },
  { setup: "What do you call a sad strawberry?", punchline: "A blueberry!" },
  { setup: "Why did the grape stop in the middle of the road?", punchline: "Because it ran out of juice!" },
  { setup: "What's a scarecrow's favorite fruit?", punchline: "Straw-berries!" },
  { setup: "What did the baby corn say to the mama corn?", punchline: "Where's pop corn?" },
  { setup: "Why did the mushroom get invited to every party?", punchline: "Because he's a fun-gi!" },
  { setup: "What do you call a sleeping pizza?", punchline: "A piZZZZa!" },
  { setup: "Why was the cucumber mad?", punchline: "Because it was in a pickle!" },
  { setup: "What did the apple say to the pie?", punchline: "You've got some crust!" },
  { setup: "What do you call a peanut in a spacesuit?", punchline: "An astro-NUT!" },

  // School jokes
  { setup: "Why did the student eat his homework?", punchline: "Because the teacher said it was a piece of cake!" },
  { setup: "What's a snake's favorite subject?", punchline: "Hiss-tory!" },
  { setup: "Why did the clock go to the principal's office?", punchline: "For tocking too much!" },
  { setup: "What's the king of all school supplies?", punchline: "The ruler!" },
  { setup: "Why was 6 afraid of 7?", punchline: "Because 7, 8 (ate), 9!" },
  { setup: "Why is a fish so easy to weigh?", punchline: "Because it has its own scales!" },
  { setup: "What did the pencil say to the other pencil?", punchline: "Looking sharp!" },
  { setup: "Why can't your nose be 12 inches long?", punchline: "Because then it would be a foot!" },

  // Weather & nature
  { setup: "What did one volcano say to the other?", punchline: "I lava you!" },
  { setup: "What falls in winter but never gets hurt?", punchline: "Snow!" },
  { setup: "What bow can't be tied?", punchline: "A rainbow!" },
  { setup: "How do trees access the internet?", punchline: "They log in!" },
  { setup: "What did the big flower say to the little flower?", punchline: "Hey there, bud!" },
  { setup: "Why did the leaf go to the doctor?", punchline: "It was feeling green!" },
  { setup: "What do you call a snowman in July?", punchline: "A puddle!" },
  { setup: "Why do watermelons have fancy weddings?", punchline: "Because they cantaloupe!" },

  // Tongue twisters (shown as jokes — the "punchline" is the challenge)
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "Red lorry, yellow lorry, red lorry, yellow lorry!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "Rubber baby buggy bumpers!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "She sells seashells by the seashore!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "Fuzzy Wuzzy was a bear. Fuzzy Wuzzy had no hair!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "Toy boat, toy boat, toy boat!" },
  { setup: "🗣️ Tongue twister time! Say this 3 times fast:", punchline: "Unique New York, unique New York, you know you need unique New York!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "Peter Piper picked a peck of pickled peppers!" },
  { setup: "🗣️ Tongue twister time! Say this 5 times fast:", punchline: "How much wood would a woodchuck chuck if a woodchuck could chuck wood?" },
];

// ─── Fun Facts ───────────────────────────────────────────────────────

const FUN_FACTS: { fact: string; genres?: string[] }[] = [
  // General / reading / brain
  { fact: "Dr. Seuss wrote 'Green Eggs and Ham' using only 50 different words — on a bet!" },
  { fact: "Reading for just 20 minutes a day means you'll read about 1.8 million words per year!" },
  { fact: "Your brain creates its own movie when you read — it lights up the same areas as real experiences!" },
  { fact: "The longest word in English without a vowel is 'rhythms'!" },
  { fact: "Kids who are read to before bed fall asleep faster and sleep better!" },
  { fact: "There are more possible games of chess than atoms in the known universe!" },
  { fact: "A 'jiffy' is an actual unit of time — it's 1/100th of a second!" },
  { fact: "The dot over the letter 'i' is called a 'tittle'!" },
  { fact: "Your brain uses about 20% of your body's energy even though it's only 2% of your weight!" },
  { fact: "The word 'alphabet' comes from 'alpha' and 'beta' — the first two letters of the Greek alphabet!" },
  { fact: "The shortest complete sentence in English is 'I am.'" },
  { fact: "'E' is the most common letter in English — it appears in about 11% of all words!" },
  { fact: "The first book ever written on a typewriter was 'The Adventures of Tom Sawyer' by Mark Twain!" },
  { fact: "The longest English word without repeating a letter is 'uncopyrightable'!" },
  { fact: "A group of books waiting to be read is called a 'tsundoku' in Japanese!" },
  { fact: "The world's smallest book is smaller than a grain of salt — it has 22 pages!" },
  { fact: "Reading can lower your heart rate and reduce stress in just 6 minutes!" },

  // Adventure / geography / earth
  { fact: "The Mariana Trench is so deep that if you put Mount Everest inside it, the peak would still be underwater!", genres: ["adventure"] },
  { fact: "There are more trees on Earth than stars in the Milky Way — about 3 trillion!", genres: ["adventure"] },
  { fact: "Antarctica is the only continent with no ants!", genres: ["adventure"] },
  { fact: "Mount Everest grows about 4 millimeters taller every year!", genres: ["adventure"] },
  { fact: "The Pacific Ocean is bigger than all the land on Earth combined!", genres: ["adventure"] },
  { fact: "Russia is so big it spans 11 different time zones!", genres: ["adventure"] },
  { fact: "The Sahara Desert is bigger than the entire United States!", genres: ["adventure"] },
  { fact: "There's a waterfall under the ocean! It's near Mauritius in the Indian Ocean.", genres: ["adventure"] },
  { fact: "The Amazon rainforest produces about 20% of the world's oxygen — it's called the 'lungs of the planet'!", genres: ["adventure"] },
  { fact: "Iceland is actually green, and Greenland is actually icy — the Vikings named them backwards on purpose!", genres: ["adventure"] },
  { fact: "About 90% of the ocean is still unexplored — we know more about the surface of Mars!", genres: ["adventure"] },
  { fact: "The Dead Sea is so salty you can float on top of it without even trying!", genres: ["adventure"] },

  // Fantasy / mythology
  { fact: "The unicorn is the national animal of Scotland — it's been on the royal coat of arms for centuries!", genres: ["fantasy"] },
  { fact: "J.R.R. Tolkien created 14 complete languages for his Middle-earth world!", genres: ["fantasy"] },
  { fact: "In Norse mythology, a rainbow was a bridge called the Bifrost that connected Earth to the realm of the gods!", genres: ["fantasy"] },
  { fact: "The word 'dragon' comes from the Greek 'drakon,' which means 'huge serpent'!", genres: ["fantasy"] },
  { fact: "In ancient Japan, people believed that a fox could turn into a beautiful person by placing a leaf on its head!", genres: ["fantasy"] },
  { fact: "The myth of the phoenix — a bird that bursts into flames and is reborn — exists in cultures all around the world!", genres: ["fantasy"] },
  { fact: "Medusa had snakes for hair, but her sisters Stheno and Euryale were actually immortal!", genres: ["fantasy"] },
  { fact: "In Celtic folklore, fairies loved cream so much that people left bowls of it out overnight to keep them happy!", genres: ["fantasy"] },
  { fact: "The legend of Atlantis came from a story Plato wrote over 2,300 years ago!", genres: ["fantasy"] },

  // Animals
  { fact: "Octopuses have three hearts, blue blood, and nine brains!", genres: ["animals"] },
  { fact: "A group of flamingos is called a 'flamboyance'!", genres: ["animals"] },
  { fact: "Sea otters hold hands while sleeping so they don't drift apart!", genres: ["animals"] },
  { fact: "A snail can sleep for three years straight!", genres: ["animals"] },
  { fact: "Butterflies taste with their feet!", genres: ["animals"] },
  { fact: "Cows have best friends and get stressed when they're separated!", genres: ["animals"] },
  { fact: "A hummingbird's heart beats more than 1,200 times per minute!", genres: ["animals"] },
  { fact: "Elephants are the only mammals that can't jump!", genres: ["animals"] },
  { fact: "A group of owls is called a 'parliament'!", genres: ["animals"] },
  { fact: "Giraffes only sleep about 30 minutes a day — in short naps!", genres: ["animals"] },
  { fact: "Pandas do handstands when they want to mark their territory higher up!", genres: ["animals"] },
  { fact: "A shrimp's heart is in its head!", genres: ["animals"] },
  { fact: "Dolphins call each other by unique names using special whistles!", genres: ["animals"] },
  { fact: "A blue whale's tongue alone weighs as much as an elephant!", genres: ["animals"] },
  { fact: "Crows can remember human faces and hold grudges for years!", genres: ["animals"] },
  { fact: "Kangaroos can't walk backwards!", genres: ["animals"] },
  { fact: "A group of jellyfish is called a 'smack'!", genres: ["animals"] },
  { fact: "Sloths are so slow that algae grows on their fur!", genres: ["animals"] },
  { fact: "Axolotls can regrow their legs, tail, and even parts of their heart and brain!", genres: ["animals"] },
  { fact: "Horses can't vomit — their stomachs just don't work that way!", genres: ["animals"] },
  { fact: "A wood frog can freeze solid in winter, then thaw out alive in the spring!", genres: ["animals"] },
  { fact: "Tardigrades (water bears) can survive in space!", genres: ["animals"] },

  // Science / space / physics
  { fact: "A teaspoon of a neutron star would weigh about 6 billion tons!", genres: ["science"] },
  { fact: "Honey never spoils — archaeologists found 3,000-year-old honey in Egypt that was still perfectly good!", genres: ["science"] },
  { fact: "If you could fold a piece of paper 42 times, it would reach the moon!", genres: ["science"] },
  { fact: "Lightning is five times hotter than the surface of the sun!", genres: ["science"] },
  { fact: "One day on Venus is longer than a year on Venus!", genres: ["science"] },
  { fact: "There's a planet made largely of diamond — it's called 55 Cancri e!", genres: ["science"] },
  { fact: "A bolt of lightning contains enough energy to toast 100,000 slices of bread!", genres: ["science"] },
  { fact: "Jupiter has a storm called the Great Red Spot that has been raging for at least 350 years!", genres: ["science"] },
  { fact: "Your bones are 5 times stronger than steel of the same weight!", genres: ["science"] },
  { fact: "Hot water freezes faster than cold water — and nobody really knows why!", genres: ["science"] },
  { fact: "The only letter that doesn't appear on the periodic table is J!", genres: ["science"] },
  { fact: "Bananas are slightly radioactive — but not enough to hurt you!", genres: ["science"] },
  { fact: "Sound travels about 4 times faster in water than in air!", genres: ["science"] },
  { fact: "Saturn's moon Titan has rivers and lakes — but they're made of liquid methane, not water!", genres: ["science"] },
  { fact: "A day on Mars is only 37 minutes longer than a day on Earth!", genres: ["science"] },

  // Silly / body / world
  { fact: "It's impossible to hum while holding your nose! Try it!", genres: ["silly"] },
  { fact: "Bananas are berries, but strawberries aren't!", genres: ["silly"] },
  { fact: "A group of pugs is called a 'grumble'!", genres: ["silly"] },
  { fact: "You can't lick your own elbow. (Almost everyone who reads this tries!)", genres: ["silly"] },
  { fact: "Your stomach gets a whole new lining every 3 to 4 days!", genres: ["silly"] },
  { fact: "Humans share about 60% of their DNA with bananas!", genres: ["silly"] },
  { fact: "The longest hiccup attack lasted 68 years!", genres: ["silly"] },
  { fact: "Your tongue has its own unique print, just like your fingerprints!", genres: ["silly"] },
  { fact: "If you sneeze with your eyes open, they won't pop out — that's a myth!", genres: ["silly"] },
  { fact: "Cotton candy was invented by a dentist!", genres: ["silly"] },
  { fact: "The inventor of the frisbee was turned into a frisbee after he died — cremated and pressed into flying discs!", genres: ["silly"] },
  { fact: "There are more chickens than people on Earth!", genres: ["silly"] },

  // Mystery / weird
  { fact: "Sherlock Holmes has been played by over 250 different actors — more than any other character!", genres: ["mystery"] },
  { fact: "Koala fingerprints are so similar to human fingerprints that they've actually confused crime scene investigators!", genres: ["mystery"] },
  { fact: "Somewhere in the Bermuda Triangle, ships and planes really do go missing more often than elsewhere!", genres: ["mystery"] },
  { fact: "The Voynich Manuscript is a 600-year-old book in an unknown language nobody has ever decoded!", genres: ["mystery"] },
  { fact: "The Nazca Lines in Peru are giant drawings in the desert that can only be seen from the sky — made over 2,000 years ago!", genres: ["mystery"] },
  { fact: "In 1908, a mysterious explosion in Siberia flattened 80 million trees — and we still aren't 100% sure what caused it!", genres: ["mystery"] },

  // Sports
  { fact: "The first basketball game was played with a soccer ball and two peach baskets nailed to a balcony!", genres: ["sports"] },
  { fact: "A baseball only lasts an average of 7 pitches in a Major League game!", genres: ["sports"] },
  { fact: "Golf is the only sport that has been played on the moon!", genres: ["sports"] },
  { fact: "Soccer is the most popular sport in the world — more than 4 billion fans!", genres: ["sports"] },
  { fact: "Tennis was originally played with the palm of the hand instead of rackets!", genres: ["sports"] },
  { fact: "The Olympic gold medal is mostly made of silver — only plated with gold!", genres: ["sports"] },
  { fact: "The longest tennis match ever played lasted 11 hours and 5 minutes!", genres: ["sports"] },

  // History
  { fact: "Ancient Egyptians used stone pillows! They believed soft pillows were for the weak.", genres: ["history"] },
  { fact: "In medieval times, pineapples were so rare that people would rent them just to display at parties!", genres: ["history"] },
  { fact: "Cleopatra lived closer in time to us than to the building of the Great Pyramid!", genres: ["history"] },
  { fact: "The Great Wall of China took over 2,000 years to build — it was built by many different emperors!", genres: ["history"] },
  { fact: "Ancient Romans used crushed mouse brains as toothpaste!", genres: ["history"] },
  { fact: "The shortest war in history was between Britain and Zanzibar in 1896 — it lasted only 38 minutes!", genres: ["history"] },
  { fact: "In ancient Greece, throwing an apple at someone was considered a marriage proposal!", genres: ["history"] },
  { fact: "Vikings used melted beaver teeth as iron for their axes!", genres: ["history"] },
  { fact: "Napoleon was actually average height for his time — the 'short Napoleon' myth came from mixing up French and British inches!", genres: ["history"] },
  { fact: "The first alarm clock could only ring at 4 a.m.!", genres: ["history"] },

  // Friendship / social
  { fact: "Dolphins call each other by unique whistles — they basically have names for each other!", genres: ["friendship"] },
  { fact: "Studies show having a best friend at school makes kids happier AND better at learning!", genres: ["friendship"] },
  { fact: "Elephants hug each other with their trunks when they meet after being apart!", genres: ["friendship"] },
  { fact: "Laughter is contagious — your brain actually prepares your face to smile when you hear someone else laugh!", genres: ["friendship"] },
  { fact: "Prairie dogs greet each other by kissing!", genres: ["friendship"] },
  { fact: "Penguins give each other pebbles as gifts when they like someone!", genres: ["friendship"] },

  // Food / everyday
  { fact: "A strawberry isn't a berry, but a banana is!" },
  { fact: "Ketchup was once sold as medicine in the 1830s!" },
  { fact: "The stickers on fruit are actually edible — though they don't taste great!" },
  { fact: "Apples float because they're 25% air!" },
  { fact: "Astronauts can't cry properly in space because tears don't fall — they just float as bubbles!" },
  { fact: "There are more stars in the universe than grains of sand on all the beaches on Earth!" },
  { fact: "It takes about 12 bees their entire lifetime to make a single tablespoon of honey!" },
  { fact: "A day on Mercury lasts 59 Earth days — imagine waiting that long for bedtime!" },
  { fact: "Your body has enough iron in it to make a nail about 3 inches long!" },
  { fact: "Cats have over 100 vocal sounds — dogs only have about 10!" },
  { fact: "The average person walks about 100,000 miles in their lifetime — that's more than 4 trips around the Earth!" },
  { fact: "A cloud can weigh over a million pounds!" },
  { fact: "The shortest war in history lasted just 38 to 45 minutes!" },
  { fact: "A single bolt of lightning is hot enough to fry an egg — it's about 5 times hotter than the surface of the sun!" },
  { fact: "Wombat poop is cube-shaped so it doesn't roll away!" },
  { fact: "Cuttlefish have THREE hearts and green-blue blood!" },
  { fact: "The longest anyone has held their breath underwater is 24 minutes and 37 seconds!" },
  { fact: "A group of hedgehogs is called a 'prickle'!" },
  { fact: "The inventors of bubble wrap originally tried to sell it as wallpaper!" },
  { fact: "There's a basketball court on the top floor of the US Supreme Court — it's called 'the highest court in the land'!" },
];

// ─── Component ───────────────────────────────────────────────────────

// Total expected time in seconds for a full story generation (story + illustrations)
const TOTAL_EXPECTED_SECONDS = 75;

function formatEta(seconds: number): string {
  if (seconds <= 0) return "Any second now…";
  if (seconds < 10) return "A few seconds left…";
  if (seconds < 60) return `About ${Math.round(seconds / 5) * 5} seconds left`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round((seconds - mins * 60) / 10) * 10;
  if (secs === 0) return `About ${mins} minute${mins > 1 ? "s" : ""} left`;
  return `About ${mins}:${String(secs).padStart(2, "0")} left`;
}

export function LoadingScreen({ genre, heroName, progress = 0, onDetach }: LoadingScreenProps) {
  const [contentIndex, setContentIndex] = useState(0);
  const [showPunchline, setShowPunchline] = useState(false);
  const [isJoke, setIsJoke] = useState(true);
  const [fadeIn, setFadeIn] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Build genre-relevant content lists (genre-specific first, then general)
  const relevantJokes = genre
    ? [...JOKES.filter((j) => j.genres?.includes(genre)), ...JOKES.filter((j) => !j.genres)]
    : JOKES;

  const relevantFacts = genre
    ? [...FUN_FACTS.filter((f) => f.genres?.includes(genre)), ...FUN_FACTS.filter((f) => !f.genres)]
    : FUN_FACTS;

  // Shuffle on mount
  const [shuffledJokes] = useState(() =>
    [...relevantJokes].sort(() => Math.random() - 0.5)
  );
  const [shuffledFacts] = useState(() =>
    [...relevantFacts].sort(() => Math.random() - 0.5)
  );

  // Rotate content every 9 seconds (joke → fact → joke → fact)
  useEffect(() => {
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setShowPunchline(false);
        setContentIndex((prev) => prev + 1);
        setIsJoke((prev) => !prev);
        setFadeIn(true);
      }, 300);
    }, 9000);
    return () => clearInterval(interval);
  }, []);

  // Tick elapsed time every second (for ETA calculation)
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-reveal punchline after 4 seconds for jokes
  useEffect(() => {
    if (!isJoke) return;
    setShowPunchline(false);
    const timer = setTimeout(() => setShowPunchline(true), 4000);
    return () => clearTimeout(timer);
  }, [contentIndex, isJoke]);

  const jokeIdx = Math.floor(contentIndex / 2) % shuffledJokes.length;
  const factIdx = Math.floor(contentIndex / 2) % shuffledFacts.length;
  const currentJoke = shuffledJokes[jokeIdx];
  const currentFact = shuffledFacts[factIdx];

  // Slowly animate progress during the story phase so it feels alive
  const [fakeProgress, setFakeProgress] = useState(0);
  useEffect(() => {
    if (progress > 0) return; // Real progress has kicked in
    const timer = setInterval(() => {
      setFakeProgress((prev) => (prev >= 45 ? 45 : prev + 1));
    }, 350);
    return () => clearInterval(timer);
  }, [progress]);

  // Smooth animated progress — never goes backwards
  const [displayProgress, setDisplayProgress] = useState(0);
  const targetProgress = progress > 0 ? Math.max(progress, fakeProgress) : fakeProgress;

  useEffect(() => {
    if (targetProgress <= displayProgress) return;
    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev >= targetProgress) { clearInterval(timer); return prev; }
        return prev + 1;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [targetProgress, displayProgress]);

  const shownProgress = displayProgress;

  const progressLabel =
    shownProgress < 25
      ? "✏️ Writing the story…"
      : shownProgress < 50
        ? "📖 Finishing up the story…"
        : shownProgress < 80
          ? "🎨 Painting the pictures…"
          : "✨ Almost ready!";

  // Estimate time remaining. Use real progress if > 5%, otherwise fall back
  // to the expected total duration.
  const etaLabel = (() => {
    if (shownProgress >= 99) return "Any second now…";
    if (shownProgress > 5) {
      const ratePerSec = shownProgress / Math.max(elapsedSec, 1);
      const remainingPct = 100 - shownProgress;
      const estSec = remainingPct / Math.max(ratePerSec, 0.5);
      // Clamp to reasonable range
      return formatEta(Math.min(Math.max(estSec, 3), 180));
    }
    return formatEta(Math.max(TOTAL_EXPECTED_SECONDS - elapsedSec, 15));
  })();

  // ── Detach button press state ──────────────────────────────────────
  // When tapped, show a confirmation message briefly before navigating
  // away — gives the user visual proof their tap registered and the
  // story will be saved. Short delay so the message is visible.
  const [detaching, setDetaching] = useState(false);
  const handleDetach = useCallback(() => {
    if (!onDetach || detaching) return;
    setDetaching(true);
    setTimeout(() => onDetach(), 1200);
  }, [onDetach, detaching]);

  // Rotating sparkle emoji for the hero name (feels more alive than
  // a static spinner for a kids' app).
  const sparkles = ["✨", "🌟", "💫", "⭐"];
  const sparkle = sparkles[Math.floor(elapsedSec / 2) % sparkles.length];

  return (
    <div className="generating">
      {/* ── Top: animated header + progress ─────────────────────── */}
      <div className="loading-top">
        <div className="loading-sparkle" aria-hidden="true">{sparkle}</div>
        <h2 className="loading-title">
          {heroName ? `Creating ${heroName}'s story…` : "Creating your story…"}
        </h2>
        <div className="loading-progress-wrap">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${shownProgress}%` }}
            />
          </div>
          <p className="loading-progress-label">{progressLabel}</p>
          <p className="loading-eta">{etaLabel}</p>
        </div>
      </div>

      {/* ── Middle: jokes & riddles (flex-grows to fill) ─────── */}
      <div className="loading-middle">
        <div className={`fun-card ${fadeIn ? "fade-in" : "fade-out"}`}>
          {isJoke ? (
            <div className="fun-joke">
              <div className="fun-label">😄 Riddle time!</div>
              <div className="fun-setup">{currentJoke.setup}</div>
              <div className="fun-divider" />
              {showPunchline ? (
                <div className="fun-punchline">{currentJoke.punchline}</div>
              ) : (
                <button
                  className="fun-reveal-btn"
                  onClick={() => setShowPunchline(true)}
                >
                  Tap to reveal the answer!
                </button>
              )}
            </div>
          ) : (
            <div className="fun-fact">
              <div className="fun-label">🧠 Did you know?</div>
              <div className="fun-text">{currentFact.fact}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: detach button ───────────────────────────────── */}
      {onDetach && (
        <div className="loading-detach">
          {detaching ? (
            <div className="loading-detach-confirm">
              ✅ The story will be in My Stories soon!
            </div>
          ) : (
            <button
              type="button"
              className="loading-detach-btn"
              onClick={handleDetach}
            >
              <span className="loading-detach-line1">Read something else</span>
              <span className="loading-detach-line2">you&apos;ll get a ding when it&apos;s ready</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
