import { readFileSync } from "fs";

const g = JSON.parse(readFileSync("./src/data/generatedStories.json", "utf-8"));

const missingVocab = [];
const missingComp = [];

for (const id of Object.keys(g)) {
  const story = g[id];
  const age = story.age;
  const pages = story.pages || [];
  const anyVocab = pages.some((p) => Array.isArray(p.vocabWords) && p.vocabWords.length > 0);
  if (!anyVocab) missingVocab.push({ id, title: story.title, age });

  // 2-4 age by design has no comprehensionQuestions
  if (age !== "2-4") {
    const hasComp = Array.isArray(story.comprehensionQuestions) && story.comprehensionQuestions.length > 0;
    if (!hasComp) missingComp.push({ id, title: story.title, age });
  }
}

console.log(`Missing vocab entirely (${missingVocab.length} stories):`);
for (const s of missingVocab) console.log(`  ${s.id} — ${s.title} (${s.age})`);

console.log(`\nMissing comprehensionQuestions (${missingComp.length} stories):`);
for (const s of missingComp) console.log(`  ${s.id} — ${s.title} (${s.age})`);
