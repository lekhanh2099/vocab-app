import { createEmptyCard, fsrs, Rating, type Grade } from "ts-fsrs";
import { db } from "../../db/database";
import type { GameMode, ReviewLogRecord, Sense, StudyCardRecord, StudyCardType } from "../../domain/models";

export type ReviewRating = "again" | "hard" | "good" | "easy";

const ratingMap: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy
};

export async function ensureStudyCard(sense: Sense, type: StudyCardType): Promise<StudyCardRecord> {
  const id = `${sense.id}:${type}`;
  const existing = await db.studyCards.get(id);
  if (existing) return existing;
  const now = new Date();
  const fsrsCard = createEmptyCard(now);
  const record: StudyCardRecord = {
    id,
    lexemeId: sense.lexemeId,
    senseId: sense.id,
    type,
    fsrs: fsrsCard,
    dueAt: new Date(fsrsCard.due).getTime(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  await db.studyCards.add(record);
  return record;
}

export async function ensureCoreStudyCards(sense: Sense): Promise<StudyCardRecord[]> {
  return Promise.all([
    ensureStudyCard(sense, "recognition"),
    ensureStudyCard(sense, "recall"),
    ensureStudyCard(sense, "sound")
  ]);
}

export async function reviewStudyCard(
  cardId: string,
  rating: ReviewRating,
  options: { correct?: boolean; responseMs?: number; hinted?: boolean; gameMode?: GameMode } = {}
): Promise<StudyCardRecord> {
  const settings = await db.settings.get("app");
  const scheduler = fsrs({ request_retention: settings?.requestRetention ?? 0.9, enable_fuzz: true });
  const current = await db.studyCards.get(cardId);
  if (!current) throw new Error(`Study card not found: ${cardId}`);
  const reviewedAt = new Date();
  const result = scheduler.next(current.fsrs, reviewedAt, ratingMap[rating]);
  const updated: StudyCardRecord = {
    ...current,
    fsrs: result.card,
    dueAt: new Date(result.card.due).getTime(),
    updatedAt: reviewedAt.toISOString()
  };
  const log: ReviewLogRecord = {
    cardId: current.id,
    lexemeId: current.lexemeId,
    senseId: current.senseId,
    type: current.type,
    reviewedAt: reviewedAt.toISOString(),
    rating: ratingMap[rating] as 1 | 2 | 3 | 4,
    correct: options.correct ?? rating !== "again",
    responseMs: options.responseMs,
    hinted: options.hinted,
    gameMode: options.gameMode
  };
  await db.transaction("rw", db.studyCards, db.reviewLogs, async () => {
    await db.studyCards.put(updated);
    await db.reviewLogs.add(log);
  });
  if ((options.correct ?? rating !== "again") && !options.hinted) await db.wordFlags.delete([current.lexemeId, "needs-review"]);
  await updateLeechFlag(current.lexemeId);
  return updated;
}

async function updateLeechFlag(lexemeId: string): Promise<void> {
  const logs = await db.reviewLogs.where("lexemeId").equals(lexemeId).toArray();
  if (logs.length < 8) return;
  // A retry-success is still a struggle. Count it at half weight so automatic
  // Hard outcomes can surface weak words instead of looking fully correct.
  const struggle = logs.reduce((sum, item) => sum + (!item.correct ? 1 : item.hinted ? 0.5 : 0), 0);
  const ratio = struggle / logs.length;
  if (ratio >= 0.4) {
    await db.wordFlags.put({ lexemeId, flag: "leech", note: `${struggle.toFixed(1)}/${logs.length} lượt khó/sai`, updatedAt: new Date().toISOString() });
  } else if (logs.length >= 12 && ratio < 0.25) {
    await db.wordFlags.delete([lexemeId, "leech"]);
  }
}

export function ratingForAutomaticAnswer(correct: boolean, hinted = false): ReviewRating {
  if (!correct) return "again";
  return hinted ? "hard" : "good";
}
