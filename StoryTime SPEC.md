# StoryTime — Production Spec & Claude Code Build Guide
### Version 2.0 — Updated April 2026

---

## How to Use This Document

Drop this file and `StoryTime.jsx` (your working prototype) into your project folder. When you run Claude Code, it reads these as context and knows exactly what you're building. Work through phases in order. Don't skip ahead.

---

## Product Vision

**StoryTime** is a premium children's read-along app for ages 2–10. Parents subscribe. Kids get personalized AI-generated stories with professional narration, word-by-word highlighting, AI illustrations, sound effects, and interactive visual features. Think "Audible meets a personal author and illustrator for your kid."

**What makes this special**: Every story is unique to the child — their name, their interests, their reading level — with beautiful illustrations and immersive audio. No two kids get the same experience.

---

## Revenue Model

**Freemium with hard paywall.**

- **Free tier**: 5 sample stories (curated from the best built-in stories). Full read-along experience. Purpose: demonstrate quality, convert to paid.
- **Premium** ($5.99/month or $44.99/year): Unlimited AI-generated stories, premium narrator voice, AI illustrations, sound effects, saved story library, reading history.
- **Family Plan** ($8.99/month): Up to 4 child profiles, each with their own preferences and library.

The 80 built-in stories from the prototype become the premium library — free users only see 5 of them.

---

## What Already Exists (Prototype)

A working React prototype (`StoryTime.jsx`) with:

- Library with 80 stories across 8 genres, genre/age filtering
- Reader with word-by-word highlighting, sentence-by-sentence narration with pitch variation
- Story Builder with hero name, type, genre, obstacle, age level, lesson/moral
- Offline template engine (5 narrative arc shapes × 8 genre worlds)
- Procedural CSS gradient + emoji illustrations (6 per genre)
- Voice modal with enhanced voice detection and speed control
- Persistent storage for custom stories

**What the prototype doesn't have**: Backend, auth, payments, AI story generation, AI illustrations, sound effects, visual effects, flexible page lengths, user profiles.

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                   FRONTEND                         │
│   Next.js app hosted on Vercel                    │
│                                                    │
│   - Library (free: 5 stories / premium: all)      │
│   - Reader (highlighting, audio, illustrations,   │
│     sound effects, visual effects)                │
│   - Story Builder (AI-powered)                    │
│   - Child Profiles                                │
│   - Parent Dashboard                              │
│   - Auth (Clerk) + Payments (Stripe)              │
└────────────────┬──────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│              API ROUTES (Vercel Functions)          │
│                                                    │
│  /api/generate-story    → Anthropic Claude API    │
│  /api/generate-images   → Image API (see below)   │
│  /api/generate-voice    → OpenAI TTS API          │
│  /api/generate-sfx      → Sound effect service    │
│  /api/webhooks/stripe   → Subscription events     │
│  /api/webhooks/clerk    → User sync               │
└────────────────┬──────────────────────────────────┘
                 │
    ┌────────────┼────────────┬──────────┐
    ▼            ▼            ▼          ▼
┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐
│Supabase│ │Anthropic │ │Image   │ │OpenAI  │
│Database│ │Claude API│ │Gen API │ │TTS API │
│+Storage│ │(stories) │ │(illus) │ │(voice) │
└────────┘ └──────────┘ └────────┘ └────────┘
```

---

## AI Illustration Strategy

### Recommended: Multi-Provider via fal.ai

Use fal.ai as a unified API gateway — one API key, one integration, access to all the best models. This lets you swap models without code changes.

**Primary model: Google Nano Banana 2 (Gemini Image)**
- $0.06 per image on fal.ai
- Best overall quality and prompt adherence
- Character consistency for up to 5 characters without fine-tuning
- Fast generation (~3-5 seconds)

**Budget alternative: Google Imagen 4 Fast**
- $0.02 per image
- Best price-to-quality ratio
- Good enough for most children's illustrations
- Great for scaling when costs matter

**Premium alternative: GPT Image 1.5 (OpenAI)**
- $0.04 per image (via OpenAI API directly)
- Highest quality benchmark score (Elo 1,264)
- Excellent text rendering if you want words in illustrations
- Best for complex, detailed prompts

### Illustration Style Prompt (Consistent Across All Stories)

```
Warm, friendly children's book illustration in soft watercolor style.
Simple shapes, rounded edges, warm natural lighting.
Gentle color palette with soft blues, greens, and warm yellows.
No text in the image. No scary or dark elements.
Characters have large, expressive eyes and friendly expressions.
Style is consistent with a modern children's picture book for ages 2-8.

Scene: {page_description}
Characters: {character_descriptions}
Mood: {mood}
Setting: {setting_description}
```

### Character Consistency Approach

This is the hardest problem in AI illustration. Options:

1. **Nano Banana 2**: Built-in multi-character consistency. Best out-of-box solution.
2. **Reference image approach**: Generate one "character sheet" image first, then pass it as reference for each page.
3. **Style-locked prompts**: Include very detailed character descriptions in every prompt (hair color, clothing, etc.) and specify "same character as previous pages."

For MVP, option 3 is simplest. Graduate to option 1 or 2 as you scale.

### Cost Per Story (Illustrations Only)

| Duration | Pages (avg) | Nano Banana ($0.06/img) | Imagen Fast ($0.02/img) |
|----------|-------------|------------------------|------------------------|
| 🌙 3 min | ~7 | $0.42 | $0.14 |
| ⭐ 5 min | ~11 | $0.66 | $0.22 |
| 📖 10 min | ~20 | $1.20 | $0.40 |
| 🌟 15 min | ~30 | $1.80 | $0.60 |
| 👑 20 min | ~38 | $2.28 | $0.76 |

**Recommendation**: Use Imagen 4 Fast as default. Longer stories (15-20 min) are a strong premium differentiator — they cost more to generate, which justifies the subscription.

---

## Story Length & Duration

### Duration-Based Story Length

Parents think in minutes, not pages. The Story Builder lets parents choose how long the story should take to read aloud.

**Duration options in the builder:**

| Option | Label | Description | Target Words |
|--------|-------|-------------|-------------|
| 🌙 Quick | 3 min | "Perfect for a short bedtime" | ~400 |
| ⭐ Short | 5 min | "A cozy read" | ~650 |
| 📖 Medium | 10 min | "A full story" | ~1,300 |
| 🌟 Long | 15 min | "A real adventure" | ~1,950 |
| 👑 Epic | 20 min | "Car ride or lazy Sunday" | ~2,600 |

**Age-based constraints:**
- Ages 2–4: Only Quick (3 min) and Short (5 min) available. Attention spans are tiny.
- Ages 4–7: All options available.
- Ages 7–10: All options available.

**How it maps to pages (TTS at ~135 words/minute + 4 sec/page transition):**

| Duration | Pages (ages 2-4) | Pages (ages 4-7) | Pages (ages 7-10) |
|----------|-----------------|------------------|-------------------|
| 3 min | 8-10 | 6-8 | 5-6 |
| 5 min | 12-16 | 10-12 | 8-10 |
| 10 min | — | 18-22 | 14-18 |
| 15 min | — | 28-32 | 22-26 |
| 20 min | — | 36-42 | 28-34 |

The built-in 80 stories are all ~3-5 minute Quick/Short stories. AI-generated stories unlock all durations.

### Claude Prompt for Story Generation

```
You are a beloved children's story author. Write a read-along story.

Hero: {heroName} (a {heroType})
Genre: {genre}
Reading level: {ageDescription}
Obstacle: {obstacle}
Lesson: {lesson}
Special requests: {extras}

TARGET LENGTH: {targetWords} words total (approximately {duration} minutes of read-aloud time).

IMPORTANT RULES:
- Write approximately {targetWords} words total
- Break the story into pages. Each page = one scene or moment (each page gets its own illustration)
- Each page should be {wordsPerPage} words
- Age-appropriate vocabulary and sentence length
- Warm, gentle tone. Never scary. Always hopeful.
- Weave the lesson naturally — never preach
- Include sensory details (sounds, colors, textures, smells)
- The story needs a clear beginning, rising action, climax, and satisfying resolution
- For longer stories (10+ min), include subplots, secondary characters, and richer world-building
- For ages 2-4: very simple words, 1-2 short sentences per page
- For ages 4-7: richer vocabulary, 2-4 sentences per page
- For ages 7-10: complex narrative, 3-6 sentences per page

For each page, also provide an illustration prompt describing the visual scene.

Return valid JSON:
{
  "title": "...",
  "emoji": "...",
  "pages": [
    {
      "label": "Page 1",
      "text": "story text for this page...",
      "scene": "illustration prompt: what should the picture show",
      "mood": "peaceful|exciting|funny|mysterious|warm|triumphant",
      "sounds": ["birds chirping", "wind rustling"]
    },
    ...
  ]
}
```

---

## Sound Effects & Audio Design

### Sound Effect Categories

Each page can trigger ambient and spot sound effects based on the story content.

**Ambient layers** (loop quietly under narration):
- Forest: birds, rustling leaves, gentle wind
- Ocean: waves, seagulls, water lapping
- Night: crickets, gentle wind, owl hoots
- Rain: rainfall, thunder in distance
- Indoor: fireplace crackling, clock ticking
- Magical: soft shimmer, mystical hum

**Spot effects** (triggered at moments):
- Footsteps (grass, stone, wood, snow)
- Door opening/closing
- Splash
- Animal sounds (dog bark, cat meow, bird call)
- Magical sparkle / wand sound
- Whoosh (running, flying)
- Gentle laugh
- Applause / celebration

### Implementation Approach

**Phase 1 (MVP)**: Pre-built sound library. Map the `mood` and `sounds` fields from the AI response to a curated set of ~30 royalty-free sound effects. Use Howler.js for web audio playback with crossfading between pages.

**Phase 2**: AI-generated sound effects using ElevenLabs Sound Effects API or similar. Each page gets a custom audio atmosphere generated from the scene description.

**Sound sources** (royalty-free):
- Freesound.org (CC0 sounds, free)
- Pixabay Sound Effects (free commercial use)
- Epidemic Sound ($15/month for commercial license)

### Audio Layering Architecture

```
┌─────────────────────────────────────┐
│           Audio Mixer                │
│                                     │
│  Layer 1: Narration (TTS voice)    │  ← loudest
│  Layer 2: Ambient (looping bg)     │  ← quiet, fades between pages
│  Layer 3: Spot SFX (triggered)     │  ← medium, timed to narration
│  Layer 4: Music (optional bg)      │  ← very quiet, gentle melody
│                                     │
│  Master volume control for parents  │
└─────────────────────────────────────┘
```

---

## Visual Effects & Interactive Features

### Page Transition Effects
- Gentle page-turn animation (CSS 3D transform)
- Fade-through-white between scenes
- Slide transitions matching story direction (left-to-right for forward motion)

### In-Page Visual Effects (CSS/Canvas)
- **Sparkle particles**: For magical moments (CSS animation, lightweight)
- **Falling leaves/snow/rain**: Particle overlay matching weather in story
- **Glowing text**: Key words pulse softly during dramatic moments
- **Floating elements**: Small emoji or shapes drift gently across illustration
- **Celebration confetti**: Story completion celebration

### Interactive Reading Features (Future)
- **Tap-to-read mode**: Child taps each word to advance (builds reading skills)
- **Hidden objects**: Tap illustration to find hidden items (engagement)
- **Word collection**: New vocabulary words get "collected" in a word jar
- **Reading streaks**: Visual reward for consecutive days of reading

---

## Phase-by-Phase Build Plan

### Phase 1: Project Setup & Web App (Week 1)

Extract prototype into a proper Next.js project.

**Tell Claude Code:**
> "Read SPEC.md and StoryTime.jsx. Set up a Next.js project with TypeScript and Tailwind. Break the single JSX file into proper components: LibraryScreen, ReaderScreen, BuilderScreen, VoiceModal, SceneIllustration, and separate files for data (stories, genres, scene data), hooks (useSpeech), and the template engine. Keep all functionality identical. Deploy to Vercel."

**File structure:**
```
src/
  app/
    page.tsx
    layout.tsx
    api/
      generate-story/route.ts
      generate-images/route.ts
      generate-voice/route.ts
      webhooks/
        stripe/route.ts
        clerk/route.ts
  components/
    library/
      LibraryScreen.tsx
      StoryCard.tsx
      GenreTabs.tsx
      AgeFilter.tsx
    reader/
      ReaderScreen.tsx
      SceneIllustration.tsx
      WordHighlighter.tsx
      AudioPlayer.tsx
      SoundEffects.tsx
      VisualEffects.tsx
      ReadingControls.tsx
    builder/
      BuilderScreen.tsx
      HeroSelector.tsx
      GenrePicker.tsx
    shared/
      VoiceModal.tsx
      ParentalGate.tsx
  hooks/
    useSpeech.ts
    useAudio.ts
    useSoundEffects.ts
  data/
    stories.ts
    genres.ts
    sceneData.ts
    soundLibrary.ts
  lib/
    storyEngine.ts       (offline fallback)
    anthropic.ts          (Claude API client)
    imageGen.ts           (illustration API client)
    tts.ts                (voice API client)
    stripe.ts
    supabase.ts
  types/
    story.ts
    user.ts
```

---

### Phase 2: Database, Auth & Profiles (Week 2)

**Database schema (Supabase):**

```sql
-- Users (synced from Clerk)
create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text,
  name text,
  subscription_status text default 'free',  -- free, premium, family
  subscription_ends_at timestamptz,
  created_at timestamptz default now()
);

-- Child profiles (1 for premium, up to 4 for family)
create table child_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  age integer,
  avatar_emoji text default '🧒',
  preferences jsonb default '{}',  -- favorite genres, interests, etc.
  created_at timestamptz default now()
);

-- Stories (both built-in and AI-generated)
create table stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),        -- null for built-in stories
  child_profile_id uuid references child_profiles(id),
  title text not null,
  emoji text,
  genre text not null,
  age_group text not null,
  pages jsonb not null,            -- [{label, text, scene, mood, sounds}]
  hero_name text,
  hero_type text,
  lesson text,
  extras text,                     -- freeform extras field
  illustration_urls jsonb,         -- ["https://...", ...] per page
  audio_urls jsonb,                -- narration audio URLs per page
  is_generated boolean default true,
  is_built_in boolean default false,
  page_count integer,
  created_at timestamptz default now()
);

-- Reading history
create table readings (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid references child_profiles(id),
  story_id uuid references stories(id),
  pages_read integer default 0,
  total_pages integer,
  completed boolean default false,
  rating integer,                  -- 1-5 stars
  read_at timestamptz default now()
);

-- Story generation credits (for tracking free tier)
create table generation_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  stories_generated integer default 0,
  reset_at timestamptz              -- monthly reset for free tier
);
```

**Tell Claude Code:**
> "Set up Supabase as my database with these tables. Add Clerk authentication with email and Google sign-in. Create a child profile selector screen that shows after login. Sync Clerk users to Supabase via webhook. The library should only show 5 built-in stories for free users, and show a paywall card for the rest."

---

### Phase 3: AI Story Generation (Week 3)

Wire up Claude API for real story generation with flexible page counts.

**Tell Claude Code:**
> "Create an API route at /api/generate-story that calls the Anthropic Claude API using the prompt template in SPEC.md. The response should include page text, illustration scene descriptions, mood tags, and sound effect suggestions. Story length should be flexible — minimum 6 pages, with longer stories for older readers. Save the generated story to Supabase. Keep the offline template engine as a fallback if the API fails. Gate this behind premium subscription — free users can't generate stories."

---

### Phase 4: AI Illustrations (Week 4)

**Tell Claude Code:**
> "Create an API route at /api/generate-images that takes a story ID, reads the scene descriptions from each page, and generates illustrations using fal.ai's API with the Nano Banana 2 model. Use the illustration style prompt from SPEC.md for consistency. Store the generated images in Supabase Storage. Update the reader to display AI illustrations instead of the emoji scenes, falling back to emoji scenes while images load. Generate images asynchronously — show the story immediately with emoji scenes, then swap in AI illustrations as they complete."

**Cost controls:**
- Cache all generated images permanently
- Generate at 512x512 (cheaper) for initial view, 1024x1024 for premium
- Queue image generation — don't block story reading
- Show emoji scenes as instant fallback (they're already charming)

---

### Phase 5: Payments (Week 5)

**Tell Claude Code:**
> "Add Stripe subscription payments with three tiers: Free (5 built-in stories only), Premium at $5.99/month or $44.99/year (unlimited AI stories, premium voice, AI illustrations), and Family at $8.99/month (up to 4 child profiles). Create a pricing page. Add a Stripe checkout flow. Create a webhook that updates subscription_status in Supabase. Add a parental gate (simple math problem like '3 + 4 = ?') before any purchase flow. Show remaining free story count for free users."

---

### Phase 6: Premium Voice (Week 5-6)

**Tell Claude Code:**
> "Add an API route at /api/generate-voice that generates narration audio using OpenAI's TTS API with the 'nova' voice at 0.9x speed. Generate audio page by page and cache in Supabase Storage. In the reader, premium users hear the AI voice via HTML5 audio. Free users keep browser SpeechSynthesis. Keep word highlighting working — estimate word timing from audio duration divided by word count."

---

### Phase 7: Sound Effects (Week 6-7)

**Tell Claude Code:**
> "Add a sound effects system to the reader. Download these royalty-free ambient sounds from Pixabay: forest, ocean, rain, night, indoor, magical. Map each story page's mood and sounds fields to the appropriate ambient layer and spot effects. Use Howler.js for audio playback. Crossfade ambient sounds between pages. Add a volume control in settings and a master mute button. Spot effects should trigger at the start of narration for each page."

---

### Phase 8: Visual Effects (Week 7-8)

**Tell Claude Code:**
> "Add visual effects to the reader. Create a particle system component that renders sparkles, falling leaves, snow, or rain as a CSS animation overlay on the illustration based on the page's mood field. 'magical' mood gets sparkles, 'peaceful' gets floating leaves, 'exciting' gets subtle energy particles. Add a gentle page-turn animation between pages. Add a confetti celebration when a story is completed. Keep all effects lightweight — no heavy canvas rendering, CSS animations only."

---

### Phase 9: Native App Wrappers (Week 8-9)

**Tell Claude Code:**
> "Set up Capacitor to wrap the Next.js app as iOS and Android native apps. Configure app icons, splash screens, and app metadata for a children's app. Create a privacy policy page. Add a parental gate (math problem) before any external links or purchase flows. Prepare for App Store submission with 'Made for Kids' designation."

**App Store checklist:**
- Privacy policy URL
- COPPA compliance declaration
- Age rating: 4+
- Parental gate on all purchases and external links
- No behavioral advertising
- No third-party tracking of children
- Data collection disclosure

---

### Phase 10: Parent Dashboard (Week 9-10)

**Tell Claude Code:**
> "Create a parent dashboard accessible via a parental gate. Show: reading history per child (stories read, time spent, pages completed), favorite genres, reading streaks (consecutive days), and story ratings. Show a simple chart of reading activity over the past 30 days. Allow parents to manage child profiles, set preferred genres, and view/delete generated stories."

---

## Environment Variables

```bash
# .env.local (NEVER commit this file)

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI Story Generation
ANTHROPIC_API_KEY=sk-ant-...

# AI Illustrations (choose one or use fal.ai for access to all)
FAL_API_KEY=...                           # fal.ai unified API
# OR direct APIs:
# GOOGLE_AI_API_KEY=...                   # Nano Banana / Imagen
# OPENAI_API_KEY=sk-...                   # GPT Image 1.5

# Voice
OPENAI_API_KEY=sk-...                     # Also used for TTS

# Payments
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_STRIPE_PRICE_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_FAMILY=price_...
```

---

## Cost Model (Updated)

### Per-Story Generation Cost (using Imagen Fast for illustrations)

| Component | 🌙 3 min | ⭐ 5 min | 📖 10 min | 🌟 15 min | 👑 20 min |
|-----------|---------|---------|----------|----------|----------|
| Story text (Claude) | $0.01 | $0.02 | $0.03 | $0.05 | $0.06 |
| Illustrations | $0.14 | $0.22 | $0.40 | $0.60 | $0.76 |
| Voice narration | $0.01 | $0.01 | $0.02 | $0.03 | $0.04 |
| Sound effects | $0.00 | $0.00 | $0.00 | $0.00 | $0.00 |
| **Total** | **$0.16** | **$0.25** | **$0.45** | **$0.68** | **$0.86** |

### Monthly Infrastructure at Scale

| Users | Paid (10%) | Stories/mo | Gen Cost | Hosting | Revenue | Margin |
|-------|-----------|-----------|----------|---------|---------|--------|
| 500 | 50 | 500 | $140 | $0 | $300 | 53% |
| 2,000 | 200 | 2,000 | $560 | $20 | $1,200 | 52% |
| 10,000 | 1,000 | 10,000 | $2,800 | $50 | $6,000 | 53% |
| 50,000 | 5,000 | 50,000 | $14,000 | $200 | $30,000 | 53% |

Margins improve if you cache aggressively (repeat readings cost $0) and use Imagen Fast as default.

---

## GitHub Setup (Do This First)

GitHub is where your code lives. Think of it as a cloud backup for your project that tracks every change, lets you revert mistakes, and later lets collaborators work with you. **Your code is private by default.**

### Step 1: Create a GitHub Account

1. Go to github.com and click "Sign up"
2. Use your business email
3. Free account is fine — you don't need a paid plan

### Step 2: Create Your Private Repository

1. After signing in, click the green "New" button (or go to github.com/new)
2. Fill in:
   - **Repository name**: `storytime`
   - **Description**: "StoryTime — Children's read-along app"
   - **Visibility**: Select **Private** (this is critical — it means only you can see it)
   - Check "Add a README file"
   - Under ".gitignore template" select **Node**
3. Click "Create repository"

That's it. You now have a private, backed-up home for your code.

### What You Need to Know About GitHub

**It's private.** Nobody can see your code unless you explicitly invite them. You control this in Settings → Collaborators. You can change a repo from private to public (or back) at any time.

**It tracks every change.** Every time Claude Code "commits" something, it's creating a snapshot you can always go back to. Think of it as unlimited undo for your entire project. If Claude makes a change that breaks things, you can revert to before that change.

**It's your backup.** Your code lives on GitHub's servers AND your local machine. If your laptop dies, your code is safe.

**Common terms you'll hear Claude Code use:**
- **Commit** = saving a snapshot of your current code with a description ("Added voice modal")
- **Push** = uploading your commits from your machine to GitHub
- **Pull** = downloading the latest code from GitHub to your machine
- **Branch** = a separate copy of your code for trying things out without affecting the main version
- **Repo** (repository) = your project folder on GitHub

You don't need to memorize these. Claude Code handles all of it. You just approve when it asks.

### Step 3: Install Git on Your Computer

Git is the tool that connects your computer to GitHub. Check if you already have it:

**Mac**: Open Terminal (search "Terminal" in Spotlight) and type:
```bash
git --version
```
If it shows a version number, you're set. If it asks you to install Xcode Command Line Tools, click "Install."

**Windows**: Download Git from git-scm.com. Use all the default settings during installation.

### Step 4: Connect Git to GitHub

Open your terminal (Terminal on Mac, Git Bash on Windows) and run these two commands with your info:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Use the same email you used for GitHub. This just labels your commits with your name.

When Claude Code first tries to push to GitHub, it will prompt you to authenticate. Follow the prompts — it will open a browser window where you sign into GitHub and authorize access. This only happens once.

---

## Getting Started with Claude Code

### Prerequisites

1. GitHub account + private repo created (see above)
2. Git installed on your computer (see above)
3. Install Node.js from nodejs.org (download the LTS version, use default settings)
4. A Claude Pro or Max subscription ($20+/month at claude.ai)
5. Claude mobile app installed on your phone (iOS App Store or Google Play — search "Claude by Anthropic")

### Recommended: Use Claude Code Desktop App

Download the Claude Desktop app from claude.ai/download. After installing:

1. Open the app and sign in with your Claude account
2. Click the **Code** tab
3. It will ask you to select a project folder — choose or create a `storytime` folder on your computer
4. Copy your `CLAUDE.md`, `SPEC.md`, and `StoryTime.jsx` files into that folder

The Desktop app gives you a visual interface where you can see file changes, diffs, and project structure without needing to read terminal output.

### Set Up Mobile Access (Remote Control)

This lets you monitor and steer Claude Code from your phone while it runs on your computer. Start a task at your desk, then check progress from the couch, approve changes from bed, or redirect while you're out.

**How to connect your phone to a Desktop session:**

1. In your Claude Code Desktop session, enable Remote Control (look for the Remote Control option in the session menu, or type `/remote` if using the CLI)
2. A URL and QR code will appear on your screen
3. Open the Claude app on your phone and scan the QR code, or open the URL in any browser
4. Done — your phone and desktop are now in sync

**What you can do from your phone:**
- Watch Claude's progress in real time as it writes code
- Send messages to redirect or answer Claude's questions
- Approve or reject changes Claude proposes
- Start new tasks while away from your desk

**Important notes:**
- Your computer must stay awake and the session must stay open. If your laptop sleeps, the session pauses. Keep it plugged in when working remotely.
- Your code never leaves your machine — your phone just sends/receives messages through Anthropic's secure servers. Same encryption Claude always uses.
- The conversation stays in sync. You can type from your desktop OR your phone interchangeably — it's one continuous session.

**Recommended workflow:**
1. Sit at your desk, start a Claude Code session, enable Remote Control
2. Kick off a big task: "Build out Phase 2 — set up Supabase and Clerk authentication"
3. Walk away. Check your phone periodically.
4. When Claude asks a question or needs approval, respond from your phone
5. Come back to your desk to review the full changes visually

### Alternative: Use Claude Code on the Web

If you don't want to install anything:

1. Go to claude.ai/code in your browser
2. Connect your GitHub account when prompted
3. Select your `storytime` repository
4. Upload `CLAUDE.md`, `SPEC.md`, and `StoryTime.jsx` to the repo first (you can drag-and-drop files on github.com)

The web version runs everything in the cloud — your computer doesn't even need to stay on.

### First Session

Whether you're using Desktop or Web, paste this as your first message:

> "Read SPEC.md and StoryTime.jsx in this project. I'm building a children's read-along app called StoryTime. The JSX file is a fully working prototype. I need to turn it into a production app following the phased plan in the spec. Let's start with Phase 1: set up a Next.js project with TypeScript and Tailwind, break the prototype into proper components, and deploy to Vercel. Walk me through every step — I'm not a developer so explain anything that might be confusing."

### Working Style Tips

1. **One phase at a time.** Don't skip ahead. Each phase builds on the last.
2. **Test constantly.** After every significant change, ask Claude Code to run the dev server and check it in your browser at localhost:3000.
3. **Commit after every working feature.** Tell Claude Code: "Help me commit this with a descriptive message and push to GitHub."
4. **When something breaks**, copy the full error message and paste it to Claude Code. Don't try to fix it yourself.
5. **Ask questions.** If Claude Code does something you don't understand, ask "Explain what you just did and why." You'll learn fast this way.
6. **Before going live**, tell Claude Code: "Do a full security review of this project. It's a children's app that handles payments and kid data. Check for exposed API keys, missing input validation, COPPA compliance gaps, and any other security issues."

### When to Hire Help

- **Before launch**: Pay a developer $1-2K for a security/architecture review
- **COPPA compliance**: Consult a privacy lawyer ($500-1000, one-time)
- **App Store submission**: Consider a consultant if Apple rejects you (common for kids' apps)

---

## Pre-Launch Checklist

- [ ] GitHub account created + private repo set up
- [ ] Claude Desktop app installed + mobile app connected via Remote Control
- [ ] Domain purchased
- [ ] LLC formed
- [ ] Privacy policy written (COPPA-compliant)
- [ ] Terms of service written
- [ ] Stripe account verified
- [ ] Apple Developer account ($99/year)
- [ ] Google Play Console ($25 one-time)
- [ ] Security review completed
- [ ] Parental gates on all purchase/external link flows
- [ ] Content moderation: all AI outputs reviewed for kid-safety
- [ ] Analytics: privacy-safe, no child tracking (use Plausible or Fathom, not Google Analytics)
- [ ] Test with 5-10 real families
- [ ] App Store screenshots and description prepared

---

## What Makes This Business Win

Your moat isn't the technology. Your moat is:

1. **Personalization depth** — The extras field is your secret weapon. "My kid loves dinosaurs and her best friend is named Zoe" → a story with dinosaurs and Zoe. No template engine can do this. Only an LLM can.

2. **Trust** — Parents are paying for safety. Every AI output must be reviewed. Every illustration must be kid-appropriate. This is your brand promise.

3. **The reading experience** — Highlighting + good voice + illustrations + sound effects, all synchronized. The combination is the product, not any single piece.

4. **Data flywheel** — Over time you learn what each child loves. Recommend stories. Suggest new genres. Track reading progress. This data makes the product stickier.

5. **Emotional connection** — Kids will ask for "their" stories by name. Parents will share them. The stories become part of the family's life. That's not something you churn from.

Build for parents who want their kids reading more. Everything else follows from that.
