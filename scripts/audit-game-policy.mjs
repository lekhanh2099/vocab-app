import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = [];
const expect = (condition, message) => { if (!condition) fail.push(message); };

const routes = {
  falling: 'src/routes/games/Falling.tsx',
  shooter: 'src/routes/games/Shooter.tsx',
  quiz: 'src/routes/games/Quiz.tsx',
  context: 'src/routes/games/ContextClash.tsx',
  boss: 'src/routes/games/Boss.tsx',
  speed: 'src/routes/games/Speed.tsx',
  match: 'src/routes/games/MatchGame.tsx'
};
for (const file of Object.values(routes)) expect(fs.existsSync(file), `missing game route: ${file}`);

const source = Object.fromEntries(Object.entries(routes).map(([key,file]) => [key, read(file)]));

// Every user-learning game must expose the shared scope selector.
for (const key of ['falling','shooter','quiz','context','boss','speed','match']) {
  expect(source[key].includes('GamePoolSelector'), `${key}: missing shared GamePoolSelector`);
}

// Only clean, skill-specific scheduled retrieval may advance FSRS.
for (const key of ['boss','speed','match']) {
  expect(!source[key].includes('recordGameAnswer'), `${key}: diagnostic/practice game must not call recordGameAnswer`);
  expect(source[key].includes('practiceOnly'), `${key}: selector must be marked practiceOnly`);
}
for (const key of ['falling','shooter','quiz','context']) {
  expect(source[key].includes('gamePoolAffectsFsrs') || key === 'shooter' && source[key].includes('affectsFsrs'), `${key}: missing FSRS pool guard`);
}

// Falling is productive sound recall only; Vietnamese typing was intentionally removed.
expect(!/Việt\s*[→-]+\s*(?:Pinyin|拼)/i.test(source.falling), 'falling: Vietnamese → Pinyin mode must stay removed');
expect(/type\s+Mode\s*=\s*\"han\"\s*\|\s*\"audio\"/.test(source.falling), 'falling: expected Han and Audio modes');

// Core arcade must use the shared pool policy and stage setup.
for (const key of ['falling','shooter']) {
  expect(source[key].includes('playableOptionsForSelection'), `${key}: must derive rows from shared pool policy`);
  expect(source[key].includes('arcadeStages') || source[key].includes('getArcadeStage'), `${key}: missing stage progression`);
}


// Falling must keep continuous ramp + reward layer; these are game-feel guarantees, not learning hints.
const fallingEngine = read('src/games/phaser/createFallingGame.ts');
const stages = read('src/games/shared/arcadeStages.ts');
const gamesHub = read('src/routes/Games.tsx');
expect(fallingEngine.includes('rampPerMinute'), 'falling: continuous time ramp missing');
expect(fallingEngine.includes('maybeAwardPowerUp'), 'falling: power-up reward layer missing');
expect(fallingEngine.includes('slowUntil') && fallingEngine.includes('shield'), 'falling: slow/shield effects missing');
expect(stages.includes('stageMissions'), 'arcade: stage mission evaluation missing');
expect(gamesHub.includes('Nhiệm vụ hôm nay'), 'game hub: daily mission board missing');
expect(!read('src/routes/Vocabulary.tsx').includes('createVirtualizer'), 'vocabulary: unstable virtualizer must stay removed');

// Context is source-safe: verified only.
expect(source.context.includes('verified === true'), 'context: must query verified contexts only');
expect(source.context.includes('preserveSenses: true'), 'context: must preserve exact senses');

// Reference drills are global/practice only.
expect(source.quiz.includes('isReferenceMode'), 'quiz: reference mode guard missing');

// Phaser rendering quality guard.
for (const file of ['src/games/phaser/createFallingGame.ts','src/games/phaser/createShooterGame.ts']) {
  const text = read(file);
  expect(/antialias\s*:\s*true/.test(text), `${file}: antialias must be enabled`);
  expect(/roundPixels\s*:\s*false/.test(text), `${file}: roundPixels must remain false for crisp scaled text/vector`);
}

if (fail.length) {
  console.error(`✗ game policy audit failed (${fail.length})`);
  fail.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
console.log('✓ shared game scope selector: 7/7 routes');
console.log('✓ FSRS write policy: core retrieval only');
console.log('✓ challenge games: practice/diagnostic only');
console.log('✓ Falling modes: Hanzi/Audio → Pinyin only');
console.log('✓ Context Clash: verified + exact-sense only');
console.log('✓ Phaser arcade rendering guards: crisp mode');
console.log('✓ Falling game system: continuous ramp + power-ups + missions');
console.log('✓ Vocabulary rendering: incremental, no blank virtualizer path');
