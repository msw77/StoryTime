# CLAUDE.md — Project Context for Claude Code

## About Me

I'm a non-technical founder building this app. I'm business-minded and smart but I don't have a programming background. This is my first software project.

**What this means for how you should work with me:**
- Explain technical concepts in plain English when they come up
- Don't assume I know terminal commands, git workflows, or programming jargon
- When you make changes, briefly tell me what you did and why
- If something could break or has risk, warn me before doing it
- When there are choices to make, explain the tradeoffs simply so I can decide
- If I ask you to do something that's a bad idea, tell me honestly

## About This Project

**StoryTime** is a children's read-along app for ages 2–10. Parents subscribe, kids get personalized AI-generated stories with professional narration, word highlighting, AI illustrations, and sound effects.

**Business model:** Freemium. 5 free sample stories, premium subscription at $5.99/month.

**Target audience:** Parents of young children who want their kids reading more.

**Key constraints:**
- Everything must be kid-safe. Content moderation is non-negotiable.
- COPPA compliance is required (children's privacy law)
- The app needs to work great on phones — most parents will use it on mobile with their kids

## Technical Decisions Already Made

- **Framework:** Next.js with TypeScript and Tailwind
- **Database:** Supabase (Postgres + file storage)
- **Auth:** Clerk
- **Payments:** Stripe
- **AI Stories:** Anthropic Claude API
- **AI Illustrations:** fal.ai (Nano Banana 2 primary, Imagen 4 Fast for budget)
- **AI Voice:** OpenAI TTS API (nova voice)
- **Hosting:** Vercel
- **Native apps:** Capacitor wrappers (later phase)

## Project Files

- `SPEC.md` — Full production specification with phased build plan. This is the source of truth for what we're building.
- `StoryTime.jsx` — Working React prototype with all current features. This is the code to extract and refactor into proper components.

## How I Want to Work

- **Follow the phases in SPEC.md in order.** Don't skip ahead.
- **Commit frequently** with clear messages after each working feature.
- **Push to GitHub** after every commit so I always have a backup.
- **Test after every change.** Run the dev server and tell me to check my browser.
- **Keep it simple.** If there's a simpler way to do something that works, prefer that over the clever way.
- **Security matters extra here.** This is a children's app. Flag anything that could be a security or privacy concern.

## Things I'll Need Help With

- Terminal commands (explain what they do before running them)
- Understanding error messages (translate them for me)
- Knowing when something is working vs when it just looks like it's working
- Deployment and environment variables
- Git operations beyond basic commit/push
- Debugging when things break

## Things I Can Handle

- Making product decisions (features, pricing, UX)
- Writing copy and content
- Testing the app as a user
- Managing accounts (GitHub, Vercel, Stripe, etc.)
- Giving clear feedback on what's working and what's not
