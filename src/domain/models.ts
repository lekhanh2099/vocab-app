import type { Card as FsrsCard } from "ts-fsrs";

export type StudyCardType = "recognition" | "recall" | "sound" | "usage";
export type GameMode = "flashcard" | "meaning" | "hanviet" | "reverse" | "pinyin" | "audio" | "speed" | "match" | "boss" | "falling" | "shooter" | "audio-bomb" | "context" | "source" | "duplicates";

export interface Book { id: string; nameVi: string; titleZh: string; lessonLabel: string; }
export interface Lesson { id: string; bookId: string; index: number; label: string; title: string; }
export interface Lexeme { id: string; hanzi: string; searchKey: string; }
export interface Reading { id: string; lexemeId: string; pinyin: string; pinyinKey: string; variants: string[]; }
export interface Sense { id: string; lexemeId: string; readingId: string; meaningVi: string; hanViet: string; pos: string; kind: string; }
export interface Occurrence {
  id: string; lexemeId: string; readingId: string; senseId: string; bookId: string; lessonId: string;
  rawHanzi: string; rawPinyin: string; rawMeaningVi: string; rawHanViet: string; rawPos: string; kind: string; needsReview: boolean;
}
export interface ContextItem {
  id: string; lexemeId: string; senseId?: string; sentenceZh: string; pinyin?: string; translationVi?: string;
  sourceType: "book" | "verified" | "generated"; sourceBookId?: string; sourceLessonId?: string; verified: boolean;
}
export interface StudyCardRecord {
  id: string; lexemeId: string; senseId: string; type: StudyCardType; fsrs: FsrsCard; dueAt: number; createdAt: string; updatedAt: string;
}
export interface ReviewLogRecord {
  id?: number; cardId: string; lexemeId: string; senseId: string; type: StudyCardType; reviewedAt: string;
  rating: 1 | 2 | 3 | 4; correct: boolean; responseMs?: number; hinted?: boolean; gameMode?: GameMode;
}
export interface FavoriteRecord { lexemeId: string; createdAt: string; }
export interface WordFlagRecord { lexemeId: string; flag: "leech" | "needs-review"; note?: string; updatedAt: string; }
export interface GameSessionRecord { id: string; mode: GameMode; startedAt: string; endedAt?: string; correct: number; wrong: number; total: number; stageId?: string; score?: number; bestCombo?: number; stars?: number; poolKey?: string; }
export interface GameEventRecord { id?: number; sessionId: string; lexemeId: string; at: string; correct: boolean; responseMs?: number; }
export interface AppSettingsRecord {
  id: "app"; newPerDay: number; reviewPerDay: number; requestRetention: number; audioRate: number; audioVoiceURI?: string; audioStrategy: "quality" | "offline"; audioPreferLocal?: boolean;
  fallingToneMode: "plain" | "numbers"; reducedMotion: boolean;
}
export interface DatasetMetaRecord { id: "dataset"; version: string; generatedAt: string; seededAt: string; }

export interface VocabularyRow {
  lexeme: Lexeme; readings: Reading[]; senses: Sense[]; occurrences: Occurrence[];
  books: Book[]; lessons: Lesson[]; favorite: boolean; cardMastery: Partial<Record<StudyCardType, number>>;
  /** Sense explicitly targeted by a game/SRS pool. Prevents reviewing the wrong sense on multi-sense readings. */
  targetSenseId?: string;
}
