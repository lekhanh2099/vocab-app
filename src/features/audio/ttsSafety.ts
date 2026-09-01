import { db } from "../../db/database";
import type { VocabularyRow } from "../../domain/models";

let safeLexemeIdsPromise: Promise<Set<string>> | undefined;

/**
 * Bare-Hanzi browser TTS cannot reliably disambiguate polyphonic characters.
 * We therefore only use native SpeechSynthesis as an audio stimulus when the
 * canonical dataset has exactly one reading for that lexeme. Polyphonic words
 * can still train the sound/pinyin skill using an explicit pinyin prompt.
 */
export function getTtsSafeLexemeIds(): Promise<Set<string>> {
  if (!safeLexemeIdsPromise) {
    safeLexemeIdsPromise = db.readings.toArray().then((readings) => {
      const counts = new Map<string, number>();
      for (const reading of readings) counts.set(reading.lexemeId, (counts.get(reading.lexemeId) ?? 0) + 1);
      return new Set([...counts].filter(([, count]) => count === 1).map(([lexemeId]) => lexemeId));
    });
  }
  return safeLexemeIdsPromise;
}

export async function isTtsSafeLexeme(lexemeId: string): Promise<boolean> {
  return (await getTtsSafeLexemeIds()).has(lexemeId);
}

export async function filterTtsSafeTargets(rows: VocabularyRow[]): Promise<VocabularyRow[]> {
  const safeIds = await getTtsSafeLexemeIds();
  return rows.filter((row) => safeIds.has(row.lexeme.id));
}
