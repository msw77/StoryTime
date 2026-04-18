import { readFileSync } from "fs";

for (const [label, path] of [
  ["classics 2-4 ", "./src/data/classicStories2to4.ts"],
  ["classics 4-7 ", "./src/data/classicStories4to7.ts"],
  ["classics 7-10", "./src/data/classicStories7to10.ts"],
]) {
  const text = readFileSync(path, "utf-8");
  const count = (text.match(/"vocabWords":\s*\[/g) || []).length;
  const stories = (text.match(/"id":\s*"classic_/g) || []).length;
  const comp = (text.match(/"comprehensionQuestions":\s*\[/g) || []).length;
  console.log(`${label} | ${stories} stories | ${count} pages | ${comp} stories w/ comprehension Qs`);
}

const g = JSON.parse(readFileSync("./src/data/generatedStories.json", "utf-8"));
let bWith = 0, bPages = 0, bComp = 0;
for (const id of Object.keys(g)) {
  if (Array.isArray(g[id].comprehensionQuestions) && g[id].comprehensionQuestions.length > 0) bComp++;
  for (const p of g[id].pages || []) {
    bPages++;
    if (Array.isArray(p.vocabWords) && p.vocabWords.length > 0) bWith++;
  }
}
console.log(`builtin       | ${Object.keys(g).length} stories | ${bWith}/${bPages} pages | ${bComp} w/ Qs`);
