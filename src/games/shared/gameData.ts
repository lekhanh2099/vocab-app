import { db } from "../../db/database";
import { getVocabularyRows } from "../../db/repositories";
import type { GameMode, GameSessionRecord, StudyCardType, VocabularyRow } from "../../domain/models";
import { ensureStudyCard, ratingForAutomaticAnswer, reviewStudyCard } from "../../services/srs/scheduler";
import { expandRowsByReading, gameTargetKey, targetMeaning, targetPinyin, targetSense } from "./targeting";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export interface PlayableRowsOptions {
  limit?: number;
  bookId?: string;
  lessonId?: string;
  poolMode?: "smart" | "weak" | "favorites" | "random-learned" | "all";
  allowNew?: boolean;
  skills?: StudyCardType[];
  /** Keep all senses on rows when the caller needs to resolve a verified context to its exact sense. */
  preserveSenses?: boolean;
}

export async function getPlayableRows(input: number | PlayableRowsOptions = 60): Promise<VocabularyRow[]> {
  const options: PlayableRowsOptions = typeof input === "number" ? { limit: input } : input;
  const limit = options.limit ?? 60;
  let rows = expandRowsByReading((await getVocabularyRows()).filter((row) => row.senses.length > 0 && row.readings.length > 0));

  if (options.bookId || options.lessonId) {
    rows = rows.map((row) => {
      const occurrences = row.occurrences.filter((item) => (!options.bookId || item.bookId === options.bookId) && (!options.lessonId || item.lessonId === options.lessonId));
      const senseIds = new Set(occurrences.map((item) => item.senseId));
      const lessonIds = new Set(occurrences.map((item) => item.lessonId));
      const bookIds = new Set(occurrences.map((item) => item.bookId));
      return {
        ...row,
        occurrences,
        senses: row.senses.filter((sense) => senseIds.has(sense.id)),
        books: row.books.filter((book) => bookIds.has(book.id)),
        lessons: row.lessons.filter((lesson) => lessonIds.has(lesson.id))
      };
    }).filter((row) => row.senses.length > 0 && row.occurrences.length > 0);
  }

  const [cards, recentLogs, settings, flags] = await Promise.all([
    db.studyCards.toArray(),
    db.reviewLogs.orderBy("reviewedAt").reverse().limit(1000).toArray(),
    db.settings.get("app"),
    db.wordFlags.toArray()
  ]);
  const now = Date.now();
  const skillSet = options.skills?.length ? new Set(options.skills) : undefined;
  const relevantCards = skillSet ? cards.filter((card) => skillSet.has(card.type)) : cards;
  const dueSenseIds = new Set(relevantCards.filter((card) => card.dueAt <= now).map((card) => card.senseId));
  // "Introduced" is intentionally skill-agnostic: Random learned / Favorites may practice any word the learner has already met.
  const introducedSenseIds = new Set(cards.map((card) => card.senseId));
  const skillIntroducedSenseIds = new Set(relevantCards.map((card) => card.senseId));
  const practiceSenseIds = skillSet ? skillIntroducedSenseIds : introducedSenseIds;
  const flaggedLexemeIds = new Set(flags.filter((item) => item.flag === "leech" || item.flag === "needs-review").map((item) => item.lexemeId));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const introducedToday = new Set(cards.filter((card) => new Date(card.createdAt).getTime() >= start.getTime()).map((card) => card.senseId)).size;
  const remainingNew = Math.max(0, (settings?.newPerDay ?? 20) - introducedToday);

  const weakScore = new Map<string, number>();
  for (const log of recentLogs) {
    if (skillSet && !skillSet.has(log.type)) continue;
    const delta = !log.correct ? 1 : log.hinted ? 0.5 : -0.2;
    weakScore.set(log.lexemeId, (weakScore.get(log.lexemeId) ?? 0) + delta);
  }
  const eligibleSense = (row: VocabularyRow, ids: Set<string>) => row.senses.find((sense) => ids.has(sense.id));
  const focusSense = (row: VocabularyRow, senseId?: string): VocabularyRow => {
    const sense = (senseId ? row.senses.find((item) => item.id === senseId) : undefined) ?? targetSense(row);
    if (!sense) return row;
    const occurrences = row.occurrences.filter((item) => item.senseId === sense.id);
    const bookIds = new Set(occurrences.map((item) => item.bookId));
    const lessonIds = new Set(occurrences.map((item) => item.lessonId));
    return {
      ...row,
      targetSenseId: sense.id,
      senses: [sense],
      occurrences: occurrences.length ? occurrences : row.occurrences,
      books: occurrences.length ? row.books.filter((book) => bookIds.has(book.id)) : row.books,
      lessons: occurrences.length ? row.lessons.filter((lesson) => lessonIds.has(lesson.id)) : row.lessons
    };
  };
  const isIntroduced = (row: VocabularyRow) => Boolean(eligibleSense(row, practiceSenseIds));
  const isDue = (row: VocabularyRow) => Boolean(eligibleSense(row, dueSenseIds));
  const isWeak = (row: VocabularyRow) => isIntroduced(row) && ((weakScore.get(row.lexeme.id) ?? 0) > 1 || flaggedLexemeIds.has(row.lexeme.id));
  const mode = options.poolMode ?? "smart";

  if (mode === "all") return shuffle(options.preserveSenses ? rows : rows.map((row) => focusSense(row))).slice(0, limit);
  if (mode === "favorites") return shuffle(rows.filter((row) => row.favorite && isIntroduced(row)).map((row) => focusSense(row, eligibleSense(row, practiceSenseIds)?.id))).slice(0, limit);
  if (mode === "random-learned") return shuffle(rows.filter(isIntroduced).map((row) => focusSense(row, eligibleSense(row, practiceSenseIds)?.id))).slice(0, limit);

  const due = shuffle(rows.filter(isDue).map((row) => focusSense(row, eligibleSense(row, dueSenseIds)?.id)));
  if (mode === "weak") return shuffle(rows.filter(isWeak).map((row) => focusSense(row, eligibleSense(row, practiceSenseIds)?.id))).slice(0, limit);
  const fresh = options.allowNew
    ? shuffle(rows.filter((row) => !isIntroduced(row)).map((row) => focusSense(row))).slice(0, remainingNew)
    : [];
  // Smart game sessions are scheduler-safe: ONLY the requested skill(s) that are actually due.
  // Weak / Random / Favorites / full-course are deliberate extra practice and never advance FSRS.
  return [...due, ...fresh].slice(0, limit);
}

export const primaryMeaning = targetMeaning;
export const primaryPinyin = targetPinyin;
export { gameTargetKey };

const reviewQueues = new Map<string, Promise<void>>();

export async function recordGameAnswer(
  row: VocabularyRow,
  type: StudyCardType,
  correct: boolean,
  responseMs: number,
  mode: GameMode,
  hinted = false,
  senseId?: string
): Promise<void> {
  const sense = (senseId ? row.senses.find((item) => item.id === senseId) : undefined) ?? targetSense(row);
  if (!sense) return;
  const queueKey = `${sense.id}:${type}`;
  const previous = reviewQueues.get(queueKey) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    const card = await ensureStudyCard(sense, type);
    await reviewStudyCard(card.id, ratingForAutomaticAnswer(correct, hinted), { correct, responseMs, hinted, gameMode: mode });
  });
  reviewQueues.set(queueKey, task);
  try {
    await task;
  } finally {
    if (reviewQueues.get(queueKey) === task) reviewQueues.delete(queueKey);
  }
}

export async function recordPracticeAnswer(row: VocabularyRow, correct: boolean): Promise<void> {
  if (correct) return;
  // Exploration of a never-seen word is not a failure. Only flag words that have already been introduced.
  const sense = targetSense(row);
  if (!sense || !(await db.studyCards.where("senseId").equals(sense.id).count())) return;
  await db.wordFlags.put({
    lexemeId: row.lexeme.id,
    flag: "needs-review",
    note: "Sai trong free practice",
    updatedAt: new Date().toISOString()
  });
}

export async function beginGameSession(mode: GameMode, total: number, meta: Partial<Pick<GameSessionRecord, "stageId" | "poolKey">> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.gameSessions.put({ id, mode, total, correct: 0, wrong: 0, startedAt: new Date().toISOString(), ...meta });
  return id;
}

export async function logGameEvent(sessionId: string, row: VocabularyRow, correct: boolean, responseMs: number): Promise<void> {
  await db.transaction("rw", db.gameEvents, db.gameSessions, async () => {
    await db.gameEvents.add({ sessionId, lexemeId: row.lexeme.id, correct, responseMs, at: new Date().toISOString() });
    const session = await db.gameSessions.get(sessionId);
    if (session) {
      await db.gameSessions.update(sessionId, {
        correct: session.correct + (correct ? 1 : 0),
        wrong: session.wrong + (correct ? 0 : 1)
      });
    }
  });
}

export async function finishGameSession(sessionId: string, stats: Partial<Pick<GameSessionRecord, "score" | "bestCombo" | "stars">> = {}): Promise<void> {
  const session = await db.gameSessions.get(sessionId);
  if (session) await db.gameSessions.put({ ...session, ...stats, endedAt: new Date().toISOString() });
}
