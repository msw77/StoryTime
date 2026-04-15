# Story Sound Effects

Drop `.mp3` files into this folder named exactly as the sound cue. Missing
files are silent no-ops — the scaffold won't crash if a cue is unavailable.

## Current cue list

Each file should be short (under ~2 seconds) and mixed quiet so it sits
under the narration rather than fighting it. The hook plays them at ~45%
volume already, so don't pre-quiet them too much.

| Filename           | What to look for on freesound.org                        |
|--------------------|----------------------------------------------------------|
| `footsteps.mp3`    | 3–4 soft footsteps on grass/wood/dirt (whichever fits)   |
| `door-close.mp3`   | A wooden door closing, not slamming                      |
| `door-creak.mp3`   | An old hinge creak (spooky stories)                      |
| `splash.mp3`       | Small water splash, not a dive                           |
| `knock.mp3`        | Three soft knocks on a wooden door                       |
| `wind.mp3`         | A short breezy gust (not a long howl)                    |
| `ink-stamp.mp3`    | A rubber stamp or ink stamp thud                         |
| `giggle.mp3`       | Short child giggle                                       |
| `heart-beat.mp3`   | Two soft heartbeats                                      |
| `whoosh.mp3`       | Quick cartoon swoosh / magic poof                        |

## Where to get them

- https://freesound.org/ — filter by license "Creative Commons 0" so you
  can use them commercially without attribution
- https://pixabay.com/sound-effects/ — also royalty-free
- https://mixkit.co/free-sound-effects/ — curated, all free

## How to add more

1. Add a new filename to this table and drop the `.mp3` in this folder.
2. Add the cue name to the `SoundCue` union in `src/types/story.ts`.
3. Reference it from story moments in `src/data/stories.ts` or from AI
   story generation later.
