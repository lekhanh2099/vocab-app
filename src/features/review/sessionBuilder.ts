import { db } from "../../db/database";
import type { StudyCardRecord } from "../../domain/models";
import { ensureStudyCard } from "../../services/srs/scheduler";

export interface DailySession {
  due: StudyCardRecord[];
  fresh: StudyCardRecord[];
  cards: StudyCardRecord[];
}

export async function buildDailySession(): Promise<DailySession> {
  const settings = await db.settings.get("app");
  const now = Date.now();
  const configuredReviewLimit = settings?.reviewPerDay ?? 80;
  const configuredNewLimit = settings?.newPerDay ?? 20;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const reviewedToday = await db.reviewLogs.where("reviewedAt").aboveOrEqual(start.toISOString()).count();
  const reviewLimit = Math.max(0, configuredReviewLimit - reviewedToday);

  const due = await db.studyCards.where("dueAt").belowOrEqual(now).sortBy("dueAt");
  const dueLimited = due.slice(0, reviewLimit);

  const allSenses = await db.senses.toArray();
  const existingCards = await db.studyCards.toArray();
  const introducedToday = new Set(existingCards.filter((card) => card.createdAt >= start.toISOString()).map((card) => card.senseId)).size;
  const newLimit = Math.max(0, configuredNewLimit - introducedToday);
  const existingSenseIds = new Set(existingCards.map((card) => card.senseId));
  const firstSenseByReading = new Map<string, (typeof allSenses)[number]>();
  for (const sense of allSenses) if (!firstSenseByReading.has(sense.readingId)) firstSenseByReading.set(sense.readingId, sense);
  const newSenses = Array.from(firstSenseByReading.values()).filter((sense) => !existingSenseIds.has(sense.id)).slice(0, newLimit);
  const fresh = await Promise.all(newSenses.map((sense) => ensureStudyCard(sense, "recognition")));

  return { due: dueLimited, fresh, cards: [...dueLimited, ...fresh] };
}

export async function getWeakCards(limit = 80): Promise<StudyCardRecord[]> {
  const [logs, cards, leeches] = await Promise.all([
    db.reviewLogs.orderBy("reviewedAt").reverse().limit(1000).toArray(),
    db.studyCards.toArray(),
    db.wordFlags.where("flag").equals("leech").toArray()
  ]);
  const leechIds = new Set(leeches.map((item) => item.lexemeId));
  const score = new Map<string, number>();
  for (const log of logs) score.set(log.cardId, (score.get(log.cardId) ?? 0) + (!log.correct ? 1 : log.hinted ? 0.5 : -0.25));
  return cards
    .sort((a, b) => Number(leechIds.has(b.lexemeId)) - Number(leechIds.has(a.lexemeId)) || (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    .filter((card) => leechIds.has(card.lexemeId) || (score.get(card.id) ?? 0) > 0)
    .slice(0, limit);
}
