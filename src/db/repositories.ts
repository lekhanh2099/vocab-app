import { db } from "./database";
import type { Book, Lesson, Sense, StudyCardType, VocabularyRow } from "../domain/models";
import { deriveCardMastery } from "../services/srs/mastery";

export async function getVocabularyRows(): Promise<VocabularyRow[]> {
  const [lexemes, readings, senses, occurrences, books, lessons, favorites, cards] = await Promise.all([
    db.lexemes.toArray(), db.readings.toArray(), db.senses.toArray(), db.occurrences.toArray(), db.books.toArray(), db.lessons.toArray(),
    db.favorites.toArray(), db.studyCards.toArray()
  ]);
  const readingMap = groupBy(readings, (item) => item.lexemeId);
  const senseMap = groupBy(senses, (item) => item.lexemeId);
  const occurrenceMap = groupBy(occurrences, (item) => item.lexemeId);
  const cardMap = groupBy(cards, (item) => item.lexemeId);
  const favoriteIds = new Set(favorites.map((item) => item.lexemeId));
  const bookMap = new Map(books.map((item) => [item.id, item]));
  const lessonMap = new Map(lessons.map((item) => [item.id, item]));

  return lexemes.map((lexeme) => {
    const wordOccurrences = occurrenceMap.get(lexeme.id) ?? [];
    const wordCards = cardMap.get(lexeme.id) ?? [];
    const wordReadings = readingMap.get(lexeme.id) ?? [];
    const wordSenses = senseMap.get(lexeme.id) ?? [];
    const cardMastery: Partial<Record<StudyCardType, number>> = {};
    for (const type of ["recognition", "recall", "sound", "usage"] as StudyCardType[]) {
      const typed = wordCards.filter((card) => card.type === type);
      if (!typed.length) continue;
      // Core cards are sense-scoped. Two meanings sharing one pronunciation must not mask each other.
      // Usage only exists for senses with a verified context, so evaluate the cards that actually exist.
      const expected = type === "usage" ? typed.length : Math.max(1, wordSenses.length);
      cardMastery[type] = typed.length < expected ? 0 : Math.min(...typed.map(deriveCardMastery));
    }
    return {
      lexeme,
      readings: wordReadings,
      senses: wordSenses,
      occurrences: wordOccurrences,
      books: uniqueBy(wordOccurrences.map((item) => bookMap.get(item.bookId)).filter(Boolean) as Book[], (item) => item.id),
      lessons: uniqueBy(wordOccurrences.map((item) => lessonMap.get(item.lessonId)).filter(Boolean) as Lesson[], (item) => item.id),
      favorite: favoriteIds.has(lexeme.id),
      cardMastery
    } satisfies VocabularyRow;
  });
}

export async function getVocabularyRow(lexemeId: string): Promise<VocabularyRow | undefined> {
  return (await getVocabularyRows()).find((row) => row.lexeme.id === lexemeId);
}

export async function toggleFavorite(lexemeId: string): Promise<boolean> {
  const existing = await db.favorites.get(lexemeId);
  if (existing) {
    await db.favorites.delete(lexemeId);
    return false;
  }
  await db.favorites.put({ lexemeId, createdAt: new Date().toISOString() });
  return true;
}

export async function getPrimarySense(lexemeId: string): Promise<Sense | undefined> {
  return db.senses.where("lexemeId").equals(lexemeId).first();
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const list = map.get(value) ?? [];
    list.push(item);
    map.set(value, list);
  }
  return map;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
