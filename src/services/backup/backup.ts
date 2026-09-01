import { db } from "../../db/database";
import { ensureStudyCard } from "../srs/scheduler";
import type {
  AppSettingsRecord,
  ContextItem,
  FavoriteRecord,
  GameEventRecord,
  GameSessionRecord,
  ReviewLogRecord,
  StudyCardRecord,
  WordFlagRecord
} from "../../domain/models";

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  studyCards: StudyCardRecord[];
  reviewLogs: ReviewLogRecord[];
  favorites: FavoriteRecord[];
  wordFlags: WordFlagRecord[];
  settings: AppSettingsRecord[];
  gameSessions: GameSessionRecord[];
  gameEvents: GameEventRecord[];
  contexts: ContextItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseBackupPayload(value: unknown): BackupPayload {
  if (!isRecord(value) || value.version !== 1) throw new Error("Backup không đúng version 1.");

  const arrayFields = [
    "studyCards", "reviewLogs", "favorites", "wordFlags", "settings", "gameSessions", "gameEvents"
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) throw new Error(`Backup thiếu mảng ${field}.`);
    if (!value[field].every(isRecord)) throw new Error(`Backup có dữ liệu ${field} không hợp lệ.`);
  }

  const contexts = value.contexts === undefined ? [] : value.contexts;
  if (!Array.isArray(contexts) || !contexts.every(isRecord)) throw new Error("Backup contexts không hợp lệ.");

  return {
    version: 1,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    studyCards: value.studyCards as unknown as StudyCardRecord[],
    reviewLogs: value.reviewLogs as unknown as ReviewLogRecord[],
    favorites: value.favorites as unknown as FavoriteRecord[],
    wordFlags: value.wordFlags as unknown as WordFlagRecord[],
    settings: value.settings as unknown as AppSettingsRecord[],
    gameSessions: value.gameSessions as unknown as GameSessionRecord[],
    gameEvents: value.gameEvents as unknown as GameEventRecord[],
    contexts: contexts as unknown as ContextItem[]
  };
}

export async function createBackup(): Promise<BackupPayload> {
  const [studyCards, reviewLogs, favorites, wordFlags, settings, gameSessions, gameEvents, contexts] = await Promise.all([
    db.studyCards.toArray(), db.reviewLogs.toArray(), db.favorites.toArray(), db.wordFlags.toArray(), db.settings.toArray(),
    db.gameSessions.toArray(), db.gameEvents.toArray(), db.contexts.filter((item) => item.sourceType !== "book").toArray()
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), studyCards, reviewLogs, favorites, wordFlags, settings, gameSessions, gameEvents, contexts };
}

function reviveStudyCard(record: StudyCardRecord): StudyCardRecord {
  if (!record?.id || !record.fsrs) throw new Error("Backup có study card thiếu id/FSRS.");
  const due = record.fsrs.due instanceof Date ? record.fsrs.due : new Date(record.fsrs.due);
  const lastReviewRaw = record.fsrs.last_review;
  const last_review = lastReviewRaw == null
    ? lastReviewRaw
    : lastReviewRaw instanceof Date
      ? lastReviewRaw
      : new Date(lastReviewRaw);
  if (Number.isNaN(due.getTime()) || (last_review instanceof Date && Number.isNaN(last_review.getTime()))) {
    throw new Error(`FSRS date không hợp lệ ở card ${record.id}`);
  }
  return {
    ...record,
    dueAt: due.getTime(),
    fsrs: { ...record.fsrs, due, last_review }
  };
}

async function validateContexts(input: unknown): Promise<ContextItem[]> {
  if (!Array.isArray(input) || !input.length) return [];
  const [lexemes, senses] = await Promise.all([db.lexemes.toArray(), db.senses.toArray()]);
  const lexemeMap = new Map(lexemes.map((item) => [item.id, item]));
  const senseMap = new Map(senses.map((item) => [item.id, item]));
  const readingIdsByLexeme = new Map<string, Set<string>>();
  const sensesByLexeme = new Map<string, typeof senses>();
  for (const sense of senses) {
    const set = readingIdsByLexeme.get(sense.lexemeId) ?? new Set<string>();
    set.add(sense.readingId);
    readingIdsByLexeme.set(sense.lexemeId, set);
    const list = sensesByLexeme.get(sense.lexemeId) ?? [];
    list.push(sense);
    sensesByLexeme.set(sense.lexemeId, list);
  }
  const valid: ContextItem[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const item = raw as unknown as Partial<ContextItem>;
    if (item.verified !== true || !item.id || !item.lexemeId || !item.sentenceZh?.trim()) continue;
    const lexeme = lexemeMap.get(item.lexemeId);
    if (!lexeme) continue;
    const sentenceZh = item.sentenceZh.trim();
    if (!sentenceZh.includes(lexeme.hanzi) || sentenceZh.length < lexeme.hanzi.length + 2) continue;
    let resolvedSenseId = item.senseId;
    if (resolvedSenseId) {
      const sense = senseMap.get(resolvedSenseId);
      if (!sense || sense.lexemeId !== item.lexemeId) continue;
    } else {
      const candidates = sensesByLexeme.get(item.lexemeId) ?? [];
      // Usage is sense-specific. Auto-attach only when the lexeme truly has one sense;
      // polyphonic OR polysemous entries must name senseId explicitly.
      if (candidates.length !== 1 || (readingIdsByLexeme.get(item.lexemeId)?.size ?? 0) !== 1) continue;
      resolvedSenseId = candidates[0]!.id;
    }
    const key = `${item.lexemeId}|${item.senseId ?? ""}|${sentenceZh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({
      id: item.id,
      lexemeId: item.lexemeId,
      senseId: resolvedSenseId,
      sentenceZh,
      pinyin: item.pinyin?.trim() || undefined,
      translationVi: item.translationVi?.trim() || undefined,
      sourceType: "verified",
      sourceBookId: item.sourceBookId,
      sourceLessonId: item.sourceLessonId,
      verified: true
    });
  }
  return valid;
}

export async function restoreBackup(input: unknown): Promise<void> {
  const payload = parseBackupPayload(input);
  const [validLexemes, validSenses, currentSettings, contexts] = await Promise.all([
    db.lexemes.toArray(),
    db.senses.toArray(),
    db.settings.toArray(),
    validateContexts(payload.contexts)
  ]);
  const lexemeIds = new Set(validLexemes.map((item) => item.id));
  const senseIds = new Set(validSenses.map((item) => item.id));

  const revivedCards = payload.studyCards
    .map(reviveStudyCard)
    .filter((card) => lexemeIds.has(card.lexemeId) && senseIds.has(card.senseId));
  const cardIds = new Set(revivedCards.map((card) => card.id));
  const reviewLogs = payload.reviewLogs.filter((log) =>
    Boolean(log?.cardId && lexemeIds.has(log.lexemeId) && senseIds.has(log.senseId) && cardIds.has(log.cardId))
  );
  const favorites = payload.favorites.filter((item) => Boolean(item?.lexemeId && lexemeIds.has(item.lexemeId)));
  const wordFlags = payload.wordFlags.filter((item) => Boolean(item?.lexemeId && lexemeIds.has(item.lexemeId)));
  const gameEvents = payload.gameEvents.filter((item) => Boolean(item?.lexemeId && lexemeIds.has(item.lexemeId)));
  const gameSessions = payload.gameSessions.filter((item) => Boolean(item?.id && item?.mode));
  const settings = payload.settings.filter((item) => item?.id === "app");
  const settingsToRestore = settings.length ? settings : currentSettings;

  await db.transaction(
    "rw",
    [db.studyCards, db.reviewLogs, db.favorites, db.wordFlags, db.settings, db.gameSessions, db.gameEvents, db.contexts],
    async () => {
      const customContextIds = (await db.contexts.filter((item) => item.sourceType !== "book").primaryKeys()) as string[];
      await Promise.all([
        db.studyCards.clear(), db.reviewLogs.clear(), db.favorites.clear(), db.wordFlags.clear(), db.settings.clear(),
        db.gameSessions.clear(), db.gameEvents.clear(), customContextIds.length ? db.contexts.bulkDelete(customContextIds) : Promise.resolve()
      ]);
      if (revivedCards.length) await db.studyCards.bulkPut(revivedCards);
      if (reviewLogs.length) await db.reviewLogs.bulkPut(reviewLogs);
      if (favorites.length) await db.favorites.bulkPut(favorites);
      if (wordFlags.length) await db.wordFlags.bulkPut(wordFlags);
      if (settingsToRestore.length) await db.settings.bulkPut(settingsToRestore);
      if (gameSessions.length) await db.gameSessions.bulkPut(gameSessions);
      if (gameEvents.length) await db.gameEvents.bulkPut(gameEvents);
      if (contexts.length) await db.contexts.bulkPut(contexts);
    }
  );
  for (const senseId of new Set(contexts.map((item) => item.senseId).filter((id): id is string => Boolean(id)))) {
    const sense = await db.senses.get(senseId);
    if (sense) await ensureStudyCard(sense, "usage");
  }
}

export async function importContextPack(items: unknown): Promise<number> {
  const valid = await validateContexts(items);
  if (!valid.length) return 0;
  await db.contexts.bulkPut(valid);
  for (const senseId of new Set(valid.map((item) => item.senseId).filter((id): id is string => Boolean(id)))) {
    const sense = await db.senses.get(senseId);
    if (sense) await ensureStudyCard(sense, "usage");
  }
  return valid.length;
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
