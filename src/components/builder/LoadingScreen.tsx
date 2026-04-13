"use client";

import { useState, useEffect } from "react";

interface LoadingScreenProps {
  genre?: string;
  heroName?: string;
  /** "story" = writing the story, "illustrations" = generating first images */
  phase?: "story" | "illustrations";
  /** 0–100 progress value */
  progress?: number;
}

// ─── Riddles & Jokes (kid-tested, parent-approved) ───────────────────

const JOKES: { setup: string; punchline: string; genres?: string[] }[] = [
  // Classics that actually make kids laugh
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

  // Adventure
  { setup: "What did the ocean say to the pirate?", punchline: "Nothing — it just waved!", genres: ["adventure"] },
  { setup: "Why do pirates take so long to learn the alphabet?", punchline: "Because they spend years at C!", genres: ["adventure"] },
  { setup: "What lies at the bottom of the ocean and twitches?", punchline: "A nervous wreck!", genres: ["adventure"] },
  { setup: "Where do sharks go on vacation?", punchline: "Finland!", genres: ["adventure"] },

  // Fantasy
  { setup: "Why did the wizard fail his test?", punchline: "He couldn't spell!", genres: ["fantasy"] },
  { setup: "What do you get when you cross a snowman and a vampire?", punchline: "Frostbite!", genres: ["fantasy"] },
  { setup: "Why do dragons sleep during the day?", punchline: "So they can fight knights!", genres: ["fantasy"] },
  { setup: "What's a witch's favorite subject in school?", punchline: "Spelling!", genres: ["fantasy"] },

  // Animals
  { setup: "What do you call a sleeping dinosaur?", punchline: "A dino-snore!", genres: ["animals"] },
  { setup: "Why don't elephants use computers?", punchline: "Because they're afraid of the mouse!", genres: ["animals"] },
  { setup: "What do you call a fish without eyes?", punchline: "A fsh!", genres: ["animals"] },
  { setup: "How do bees get to school?", punchline: "On the school buzz!", genres: ["animals"] },
  { setup: "What do you call a bear with no teeth?", punchline: "A gummy bear!", genres: ["animals"] },
  { setup: "Why do cows wear bells?", punchline: "Because their horns don't work!", genres: ["animals"] },
  { setup: "What do you call an alligator in a vest?", punchline: "An in-vest-igator!", genres: ["animals"] },

  // Silly
  { setup: "Why did the banana go to the doctor?", punchline: "It wasn't peeling well!", genres: ["silly"] },
  { setup: "What did the zero say to the eight?", punchline: "Nice belt!", genres: ["silly"] },
  { setup: "Why did the teddy bear say no to dessert?", punchline: "Because she was already stuffed!", genres: ["silly"] },
  { setup: "What do you call cheese that isn't yours?", punchline: "Nacho cheese!", genres: ["silly"] },
  { setup: "Why couldn't the pony sing?", punchline: "Because she was a little horse!", genres: ["silly"] },

  // Science
  { setup: "Why can't you trust atoms?", punchline: "They make up everything!", genres: ["science"] },
  { setup: "How do scientists freshen their breath?", punchline: "With experi-mints!", genres: ["science"] },
  { setup: "What did the earth say to the other planets?", punchline: "You guys have no life!", genres: ["science"] },
  { setup: "Why did the sun go to school?", punchline: "To get a little brighter!", genres: ["science"] },

  // Mystery
  { setup: "What has keys but can't open locks?", punchline: "A piano!", genres: ["mystery"] },
  { setup: "What has many teeth but can't bite?", punchline: "A comb!", genres: ["mystery"] },
  { setup: "What can you break without touching it?", punchline: "A promise!", genres: ["mystery"] },

  // Sports
  { setup: "Why are basketball players messy eaters?", punchline: "They're always dribbling!", genres: ["sports"] },
  { setup: "Why did the golfer wear two pairs of pants?", punchline: "In case he got a hole in one!", genres: ["sports"] },
  { setup: "Why is tennis such a loud sport?", punchline: "Because every player raises a racket!", genres: ["sports"] },

  // History
  { setup: "How did the Vikings send messages?", punchline: "By Norse code!", genres: ["history"] },
  { setup: "Why were the early days of history called the Dark Ages?", punchline: "Because there were so many knights!", genres: ["history"] },
  { setup: "What did King Tut say when he got scared?", punchline: "I want my mummy!", genres: ["history"] },

  // Friendship
  { setup: "What did the left hand say to the right hand?", punchline: "How does it feel to always be right?", genres: ["friendship"] },
  { setup: "What do you call two best friend bananas?", punchline: "A great pair!", genres: ["friendship"] },
];

// ─── Fun Facts ───────────────────────────────────────────────────────

const FUN_FACTS: { fact: string; genres?: string[] }[] = [
  // General
  { fact: "Dr. Seuss wrote 'Green Eggs and Ham' using only 50 different words — on a bet!" },
  { fact: "Reading for just 20 minutes a day means you'll read about 1.8 million words per year!" },
  { fact: "Your brain creates its own movie when you read — it lights up the same areas as real experiences!" },
  { fact: "The longest word in English without a vowel is 'rhythms'!" },
  { fact: "Kids who are read to before bed fall asleep faster and sleep better!" },
  { fact: "There are more possible games of chess than atoms in the known universe!" },
  { fact: "A 'jiffy' is an actual unit of time — it's 1/100th of a second!" },
  { fact: "The dot over the letter 'i' is called a 'tittle'!" },

  // Adventure
  { fact: "The Mariana Trench is so deep that if you put Mount Everest inside it, the peak would still be underwater!", genres: ["adventure"] },
  { fact: "There are more trees on Earth than stars in the Milky Way — about 3 trillion!", genres: ["adventure"] },
  { fact: "Antarctica is the only continent with no ants!", genres: ["adventure"] },

  // Fantasy
  { fact: "The unicorn is the national animal of Scotland — it's been on the royal coat of arms for centuries!", genres: ["fantasy"] },
  { fact: "J.R.R. Tolkien created 14 complete languages for his Middle-earth world!", genres: ["fantasy"] },
  { fact: "In Norse mythology, a rainbow was a bridge called the Bifrost that connected Earth to the realm of the gods!", genres: ["fantasy"] },

  // Animals
  { fact: "Octopuses have three hearts, blue blood, and nine brains!", genres: ["animals"] },
  { fact: "A group of flamingos is called a 'flamboyance'!", genres: ["animals"] },
  { fact: "Sea otters hold hands while sleeping so they don't drift apart!", genres: ["animals"] },
  { fact: "A snail can sleep for three years straight!", genres: ["animals"] },
  { fact: "Butterflies taste with their feet!", genres: ["animals"] },
  { fact: "Cows have best friends and get stressed when they're separated!", genres: ["animals"] },

  // Science
  { fact: "A teaspoon of a neutron star would weigh about 6 billion tons!", genres: ["science"] },
  { fact: "Honey never spoils — archaeologists found 3,000-year-old honey in Egypt that was still perfectly good!", genres: ["science"] },
  { fact: "If you could fold a piece of paper 42 times, it would reach the moon!", genres: ["science"] },
  { fact: "Lightning is five times hotter than the surface of the sun!", genres: ["science"] },

  // Silly
  { fact: "It's impossible to hum while holding your nose! Try it!", genres: ["silly"] },
  { fact: "Bananas are berries, but strawberries aren't!", genres: ["silly"] },
  { fact: "A group of pugs is called a 'grumble'!", genres: ["silly"] },
  { fact: "You can't lick your own elbow. (Almost everyone who reads this tries!)", genres: ["silly"] },

  // Mystery
  { fact: "Sherlock Holmes has been played by over 250 different actors — more than any other character!", genres: ["mystery"] },
  { fact: "Koala fingerprints are so similar to human fingerprints that they've actually confused crime scene investigators!", genres: ["mystery"] },

  // Sports
  { fact: "The first basketball game was played with a soccer ball and two peach baskets nailed to a balcony!", genres: ["sports"] },
  { fact: "A baseball only lasts an average of 7 pitches in a Major League game!", genres: ["sports"] },

  // History
  { fact: "Ancient Egyptians used stone pillows! They believed soft pillows were for the weak.", genres: ["history"] },
  { fact: "In medieval times, pineapples were so rare that people would rent them just to display at parties!", genres: ["history"] },
  { fact: "Cleopatra lived closer in time to us than to the building of the Great Pyramid!", genres: ["history"] },

  // Friendship
  { fact: "Dolphins call each other by unique whistles — they basically have names for each other!", genres: ["friendship"] },
  { fact: "Studies show having a best friend at school makes kids happier AND better at learning!", genres: ["friendship"] },
];

const LOADING_MESSAGES = [
  "Mixing up something magical…",
  "Sprinkling in some imagination…",
  "Adding a dash of adventure…",
  "Weaving words together…",
  "Cooking up a great story…",
  "Painting with words…",
  "Choosing the perfect words…",
  "Stirring in the good stuff…",
  "Almost there…",
];

// ─── Component ───────────────────────────────────────────────────────

const ILLUSTRATION_MESSAGES = [
  "Painting the first picture…",
  "Adding colors and details…",
  "Drawing your character…",
  "Almost ready to read…",
];

export function LoadingScreen({ genre, heroName, phase = "story", progress = 0 }: LoadingScreenProps) {
  const [contentIndex, setContentIndex] = useState(0);
  const [showPunchline, setShowPunchline] = useState(false);
  const [isJoke, setIsJoke] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

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

  // Rotate loading message every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 4000);
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

  // Smooth animated progress (catches up to actual progress gradually)
  const [displayProgress, setDisplayProgress] = useState(0);
  useEffect(() => {
    if (progress <= displayProgress) return;
    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev >= progress) { clearInterval(timer); return prev; }
        return prev + 1;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [progress, displayProgress]);

  // Slowly animate progress even during the story phase so it feels alive
  const [fakeProgress, setFakeProgress] = useState(0);
  useEffect(() => {
    if (progress > 0) return; // Real progress has kicked in
    const timer = setInterval(() => {
      setFakeProgress((prev) => (prev >= 45 ? 45 : prev + 1));
    }, 350);
    return () => clearInterval(timer);
  }, [progress]);

  const shownProgress = progress > 0 ? displayProgress : fakeProgress;

  const progressLabel =
    shownProgress < 25
      ? "✏️ Writing the story…"
      : shownProgress < 50
        ? "📖 Finishing up the story…"
        : shownProgress < 80
          ? "🎨 Painting the pictures…"
          : "✨ Almost ready!";

  return (
    <div className="generating">
      <div className="loading-top">
        <div className="spinner" />
        <h2 style={{ fontFamily: "'Baloo 2',cursive" }}>
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
        </div>

        <p className="loading-msg">
          {phase === "illustrations"
            ? ILLUSTRATION_MESSAGES[loadingMsg % ILLUSTRATION_MESSAGES.length]
            : LOADING_MESSAGES[loadingMsg]}
        </p>
      </div>

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
  );
}
