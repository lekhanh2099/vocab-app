import { db } from "../../db/database";
import type { Sense, StudyCardRecord, StudyCardType } from "../../domain/models";
import { loadActiveCourseScope, selectionSkills, type StudyPoolSelection } from "../study/pool";
import { ensureStudyCard, type ReviewRating } from "../../services/srs/scheduler";

export interface DailySession {
  due: StudyCardRecord[];
  fresh: StudyCardRecord[];
  cards: StudyCardRecord[];
}

export interface StudySessionEntry {
  id: string;
  lexemeId: string;
  senseId: string;
  type: StudyCardType;
  card?: StudyCardRecord;
  /** Only scheduled entries may move dueAt / FSRS. */
  scheduled: boolean;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function take<T>(items: T[], limit: number): T[] {
  return limit === 0 ? items : items.slice(0, Math.max(0, limit));
}

function entryFromCard(card: StudyCardRecord, scheduled: boolean): StudySessionEntry {
  return { id: card.id, lexemeId: card.lexemeId, senseId: card.senseId, type: card.type, card, scheduled };
}

async function senseIdsForSelection(selection: StudyPoolSelection): Promise<Set<string> | undefined> {
  if (selection.kind === "manual") {
    const lexemeIds = new Set(selection.lexemeIds ?? []);
    if (!lexemeIds.size) return new Set<string>();
    const senses = await db.senses.toArray();
    return new Set(senses.filter((sense) => lexemeIds.has(sense.lexemeId)).map((sense) => sense.id));
  }
  if (selection.kind !== "course" || !selection.bookId) return undefined;
  const lessonIds = new Set(selection.lessonIds ?? (selection.lessonId ? [selection.lessonId] : []));
  const occurrences = await db.occurrences.where("bookId").equals(selection.bookId).toArray();
  return new Set(occurrences.filter((item) => !lessonIds.size || lessonIds.has(item.lessonId)).map((item) => item.senseId));
}

function filterCardsBySense(cards: StudyCardRecord[], senseIds?: Set<string>): StudyCardRecord[] {
  return senseIds ? cards.filter((card) => senseIds.has(card.senseId)) : cards;
}

export async function buildDailySession(limit = 0): Promise<DailySession> {
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

  let candidates = allSenses.filter((sense) => !existingSenseIds.has(sense.id));
  if ((settings?.newCardScope ?? "active") === "active") {
    const active = loadActiveCourseScope();
    if (active) {
      const activeSenseIds = await senseIdsForSelection(active);
      if (activeSenseIds) candidates = candidates.filter((sense) => activeSenseIds.has(sense.id));
    }
  }
  const fresh = await Promise.all(candidates.slice(0, newLimit).map((sense) => ensureStudyCard(sense, "recognition")));
  const cards = take([...dueLimited, ...fresh], limit);
  const cardIds = new Set(cards.map((card) => card.id));
  return { due: dueLimited.filter((card) => cardIds.has(card.id)), fresh: fresh.filter((card) => cardIds.has(card.id)), cards };
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

async function virtualEntries(selection: StudyPoolSelection, senseIds: Set<string>, existingCards: StudyCardRecord[]): Promise<StudySessionEntry[]> {
  const skills = selectionSkills(selection);
  const existingByKey = new Map(existingCards.map((card) => [`${card.senseId}:${card.type}`, card]));
  const usageSenseIds = skills.includes("usage")
    ? new Set((await db.contexts.filter((item) => item.verified === true).toArray()).map((item) => item.senseId).filter((id): id is string => Boolean(id)))
    : new Set<string>();
  const senses = await db.senses.bulkGet([...senseIds]);
  return senses.flatMap((sense): StudySessionEntry[] => {
    if (!sense) return [];
    return skills.flatMap((type): StudySessionEntry[] => {
      if (type === "usage" && !usageSenseIds.has(sense.id)) return [];
      const card = existingByKey.get(`${sense.id}:${type}`);
      return [{ id: card?.id ?? `practice:${sense.id}:${type}`, lexemeId: sense.lexemeId, senseId: sense.id, type, card, scheduled: false }];
    });
  });
}

export async function buildStudySession(selection: StudyPoolSelection, limit = 10): Promise<StudySessionEntry[]> {
  const skillSet = new Set(selectionSkills(selection));
  const withSkills = (cards: StudyCardRecord[]) => cards.filter((card) => skillSet.has(card.type));
  if (selection.kind === "daily") {
    const daily = await buildDailySession(0);
    return take(withSkills(daily.cards).map((card) => entryFromCard(card, true)), limit);
  }
  if (selection.kind === "weak") return take(withSkills(await getWeakCards(500)).map((card) => entryFromCard(card, false)), limit);

  const allCards = await db.studyCards.toArray();
  if (selection.kind === "favorites") {
    const favorites = new Set((await db.favorites.toArray()).map((item) => item.lexemeId));
    return take(shuffle(withSkills(allCards).filter((card) => favorites.has(card.lexemeId))).map((card) => entryFromCard(card, false)), limit);
  }
  if (selection.kind === "random") return take(shuffle(withSkills(allCards)).map((card) => entryFromCard(card, false)), limit);

  const senseIds = await senseIdsForSelection(selection) ?? new Set<string>();
  const scopedCards = filterCardsBySense(withSkills(allCards), senseIds);
  if (selection.kind === "course" && (selection.courseMode ?? "smart") === "smart") {
    return take(scopedCards.filter((card) => card.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt).map((card) => entryFromCard(card, true)), limit);
  }
  if (selection.kind === "course" && selection.courseMode === "learned") {
    return take(shuffle(scopedCards).map((card) => entryFromCard(card, false)), limit);
  }

  return take(shuffle(await virtualEntries(selection, senseIds, allCards)), limit);
}

export async function recordStudyPractice(entry: StudySessionEntry, rating: ReviewRating): Promise<void> {
  if (entry.scheduled) throw new Error("Scheduled study entries must use reviewStudyCard().");
  if (rating !== "again" && rating !== "hard") return;
  const introduced = entry.card || await db.studyCards.where("senseId").equals(entry.senseId).first();
  if (!introduced) return;
  await db.wordFlags.put({
    lexemeId: entry.lexemeId,
    flag: "needs-review",
    note: rating === "again" ? "Quên trong extra practice" : "Khó trong extra practice",
    updatedAt: new Date().toISOString()
  });
}

export async function firstSenseForLexeme(lexemeId: string): Promise<Sense | undefined> {
  return db.senses.where("lexemeId").equals(lexemeId).first();
}
