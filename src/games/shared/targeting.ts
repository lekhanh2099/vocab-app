import type { VocabularyRow } from "../../domain/models";
import { normalizeSearch } from "../../features/search/normalize";

export function targetPinyin(row: VocabularyRow): string {
  return row.readings[0]?.pinyin ?? "";
}

export function targetSense(row: VocabularyRow) {
  return (row.targetSenseId ? row.senses.find((sense) => sense.id === row.targetSenseId) : undefined) ?? row.senses[0];
}

export function targetMeaning(row: VocabularyRow): string {
  const sense = targetSense(row);
  return sense?.meaningVi || sense?.hanViet || "";
}

export function gameTargetKey(row: VocabularyRow): string {
  return `${row.lexeme.id}:${row.readings[0]?.id ?? "no-reading"}:${row.targetSenseId ?? "default-sense"}`;
}

/**
 * A game target is one lexeme + one reading. This prevents polyphonic entries
 * such as 传 chuán / zhuàn from being silently flattened to the first reading.
 */
export function expandRowsByReading(rows: VocabularyRow[]): VocabularyRow[] {
  if (!Array.isArray(rows)) throw new TypeError("expandRowsByReading expected VocabularyRow[]");
  return rows.flatMap((row) => row.readings.map((reading) => {
    const senses = row.senses.filter((sense) => sense.readingId === reading.id);
    const occurrences = row.occurrences.filter((occurrence) => occurrence.readingId === reading.id);
    const bookIds = new Set(occurrences.map((occurrence) => occurrence.bookId));
    const lessonIds = new Set(occurrences.map((occurrence) => occurrence.lessonId));
    return {
      ...row,
      readings: [reading],
      senses,
      occurrences,
      targetSenseId: row.targetSenseId && senses.some((sense) => sense.id === row.targetSenseId) ? row.targetSenseId : undefined,
      books: row.books.filter((book) => bookIds.has(book.id)),
      lessons: row.lessons.filter((lesson) => lessonIds.has(lesson.id))
    } satisfies VocabularyRow;
  }).filter((row) => row.senses.length > 0));
}

export function normalizedMeaningKey(row: VocabularyRow): string {
  return normalizeSearch(targetMeaning(row));
}

/**
 * Reverse-recall prompts must have exactly one valid Hanzi answer in the pool.
 * If two lexemes share the same Vietnamese gloss, multiple-choice/typing would
 * otherwise grade a linguistically valid answer as wrong.
 */
export function filterUnambiguousMeaningTargets(rows: VocabularyRow[]): VocabularyRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizedMeaningKey(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.filter((row) => {
    const key = normalizedMeaningKey(row);
    return Boolean(key) && counts.get(key) === 1;
  });
}
