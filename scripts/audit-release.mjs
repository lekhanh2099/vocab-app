import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "tests"];
let files = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
};
sourceRoots.forEach(walk);

let imports = 0;
const missing = [];
const importRe = /from\s+["'](\.{1,2}\/[^"']+)["']|import\s+["'](\.{1,2}\/[^"']+)["']/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  while ((match = importRe.exec(text))) {
    const rel = match[1] || match[2];
    imports += 1;
    const base = path.resolve(path.dirname(file), rel);
    const candidates = [
      base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.json`,
      path.join(base, "index.ts"), path.join(base, "index.tsx")
    ];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) missing.push(`${file}: ${rel}`);
  }
}

const vocab = fs.readFileSync("src/routes/Vocabulary.tsx", "utf8");
const falling = fs.readFileSync("src/games/phaser/createFallingGame.ts", "utf8");
const games = fs.readFileSync("src/routes/Games.tsx", "utf8");
const checks = [
  [!vocab.includes("createVirtualizer"), "Vocabulary must not use the removed virtualizer"],
  [vocab.includes("IntersectionObserver"), "Vocabulary incremental loader missing"],
  [falling.includes("rampPerMinute"), "Falling continuous ramp missing"],
  [falling.includes("maybeAwardPowerUp"), "Falling power-up system missing"],
  [falling.includes("shield") && falling.includes("slowUntil"), "Falling power-up effects missing"],
  [games.includes("Nhiệm vụ hôm nay"), "Daily mission board missing"],
  [missing.length === 0, `Missing relative imports: ${missing.join(", ")}`]
];
const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  console.error(`✗ static release audit failed (${failed.length})`);
  failed.forEach(([, msg]) => console.error(`  - ${msg}`));
  process.exit(1);
}
console.log(`✓ static release audit: ${files.length} TS/TSX files`);
console.log(`✓ relative imports: ${imports}, missing 0`);
console.log("✓ Vocabulary incremental loader");
console.log("✓ Falling continuous ramp + power-ups");
console.log("✓ Daily mission board");
