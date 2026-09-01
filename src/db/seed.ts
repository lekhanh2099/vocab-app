import seed from "../data/seed.json";
import { db } from "./database";
import type { AppSettingsRecord, ContextItem } from "../domain/models";
import { ensureStudyCard } from "../services/srs/scheduler";

interface CanonicalSeed {
  version: string;
  generatedAt: string;
  books: typeof seed.books;
  lessons: typeof seed.lessons;
  lexemes: typeof seed.lexemes;
  readings: typeof seed.readings;
  senses: typeof seed.senses;
  occurrences: typeof seed.occurrences;
  contexts: ContextItem[];
}

const canonical = seed as CanonicalSeed;

export const DEFAULT_SETTINGS: AppSettingsRecord = {
  id: "app",
  newPerDay: 20,
  reviewPerDay: 80,
  requestRetention: 0.9,
  audioRate: 0.9,
  audioStrategy: "offline",
  fallingToneMode: "plain",
  reducedMotion: false
};

export async function seedDatabase(): Promise<void> {
  const current = await db.datasetMeta.get("dataset");
  const settings = await db.settings.get("app");
  if (!settings) await db.settings.put(DEFAULT_SETTINGS);
  else if (settings.audioStrategy === undefined) await db.settings.put({ ...settings, audioStrategy: "offline", audioRate: settings.audioRate || 0.9 });
  if (current?.version === canonical.version) return;

  const customContexts = await db.contexts.filter((item) => item.sourceType !== "book").toArray();
  const validSenseIds = new Set(canonical.senses.map((item) => item.id));
  const validLexemeIds = new Set(canonical.lexemes.map((item) => item.id));
  const lexemeById = new Map(canonical.lexemes.map((item) => [item.id, item]));
  const sensesByLexeme = new Map<string, typeof canonical.senses>();
  for (const sense of canonical.senses) {
    const list = sensesByLexeme.get(sense.lexemeId) ?? [];
    list.push(sense); sensesByLexeme.set(sense.lexemeId, list);
  }
  const validCustomContexts = customContexts.flatMap((item) => {
    const lexeme = lexemeById.get(item.lexemeId);
    if (!lexeme || !item.sentenceZh.includes(lexeme.hanzi)) return [];
    if (item.senseId) return validSenseIds.has(item.senseId) ? [item] : [];
    const senses = sensesByLexeme.get(item.lexemeId) ?? [];
    return senses.length === 1 ? [{ ...item, senseId: senses[0]!.id }] : [];
  });
  await db.transaction(
    "rw",
    [db.books, db.lessons, db.lexemes, db.readings, db.senses, db.occurrences, db.contexts, db.studyCards, db.reviewLogs, db.favorites, db.wordFlags, db.gameEvents, db.datasetMeta],
    async () => {
      await Promise.all([
        db.books.clear(), db.lessons.clear(), db.lexemes.clear(), db.readings.clear(),
        db.senses.clear(), db.occurrences.clear(), db.contexts.clear()
      ]);
      await db.books.bulkPut(canonical.books);
      await db.lessons.bulkPut(canonical.lessons);
      await db.lexemes.bulkPut(canonical.lexemes);
      await db.readings.bulkPut(canonical.readings);
      await db.senses.bulkPut(canonical.senses);
      await db.occurrences.bulkPut(canonical.occurrences);
      if (canonical.contexts.length) await db.contexts.bulkPut(canonical.contexts);
      if (validCustomContexts.length) await db.contexts.bulkPut(validCustomContexts);

      const orphanCardIds = (await db.studyCards.toArray()).filter((card) => !validSenseIds.has(card.senseId) || !validLexemeIds.has(card.lexemeId)).map((card) => card.id);
      const orphanLogIds = (await db.reviewLogs.toArray()).filter((item) => !validSenseIds.has(item.senseId) || !validLexemeIds.has(item.lexemeId)).map((item) => item.id).filter((id): id is number => id !== undefined);
      const orphanFavoriteIds = (await db.favorites.toArray()).filter((item) => !validLexemeIds.has(item.lexemeId)).map((item) => item.lexemeId);
      const orphanFlagKeys = (await db.wordFlags.toArray()).filter((item) => !validLexemeIds.has(item.lexemeId)).map((item) => [item.lexemeId, item.flag] as [string, string]);
      const orphanEventIds = (await db.gameEvents.toArray()).filter((item) => !validLexemeIds.has(item.lexemeId)).map((item) => item.id).filter((id): id is number => id !== undefined);
      if (orphanCardIds.length) await db.studyCards.bulkDelete(orphanCardIds);
      if (orphanLogIds.length) await db.reviewLogs.bulkDelete(orphanLogIds);
      if (orphanFavoriteIds.length) await db.favorites.bulkDelete(orphanFavoriteIds);
      if (orphanFlagKeys.length) await db.wordFlags.bulkDelete(orphanFlagKeys);
      if (orphanEventIds.length) await db.gameEvents.bulkDelete(orphanEventIds);

      await db.datasetMeta.put({ id: "dataset", version: canonical.version, generatedAt: canonical.generatedAt, seededAt: new Date().toISOString() });
    }
  );
  const usageSenseIds = new Set([...canonical.contexts, ...validCustomContexts].map((item) => item.senseId).filter((id): id is string => Boolean(id)));
  for (const senseId of usageSenseIds) {
    const sense = await db.senses.get(senseId);
    if (sense) await ensureStudyCard(sense, "usage");
  }
}
