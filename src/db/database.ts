import Dexie, { type Table } from "dexie";
import type {
  AppSettingsRecord, Book, ContextItem, DatasetMetaRecord, FavoriteRecord, GameEventRecord, GameSessionRecord,
  Lesson, Lexeme, Occurrence, Reading, ReviewLogRecord, Sense, StudyCardRecord, WordFlagRecord
} from "../domain/models";

export class VocabDatabase extends Dexie {
  books!: Table<Book, string>;
  lessons!: Table<Lesson, string>;
  lexemes!: Table<Lexeme, string>;
  readings!: Table<Reading, string>;
  senses!: Table<Sense, string>;
  occurrences!: Table<Occurrence, string>;
  contexts!: Table<ContextItem, string>;
  studyCards!: Table<StudyCardRecord, string>;
  reviewLogs!: Table<ReviewLogRecord, number>;
  favorites!: Table<FavoriteRecord, string>;
  wordFlags!: Table<WordFlagRecord, [string, string]>;
  gameSessions!: Table<GameSessionRecord, string>;
  gameEvents!: Table<GameEventRecord, number>;
  settings!: Table<AppSettingsRecord, string>;
  datasetMeta!: Table<DatasetMetaRecord, string>;

  constructor() {
    super("vocab-universe");
    this.version(1).stores({
      books: "id",
      lessons: "id, bookId, [bookId+index]",
      lexemes: "id, hanzi, searchKey",
      readings: "id, lexemeId, pinyinKey",
      senses: "id, lexemeId, readingId, kind",
      occurrences: "id, lexemeId, senseId, bookId, lessonId, [bookId+lessonId]",
      contexts: "id, lexemeId, senseId, sourceType",
      studyCards: "id, lexemeId, senseId, type, dueAt, [type+dueAt]",
      reviewLogs: "++id, cardId, lexemeId, senseId, reviewedAt, type, gameMode",
      favorites: "lexemeId",
      wordFlags: "[lexemeId+flag], lexemeId, flag",
      gameSessions: "id, mode, startedAt",
      gameEvents: "++id, sessionId, lexemeId, at",
      settings: "id",
      datasetMeta: "id"
    });
  }
}

export const db = new VocabDatabase();
