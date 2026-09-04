import { createSignal } from "solid-js";
import type { StudyCardType } from "../../domain/models";

export type StudyPoolKind = "daily" | "weak" | "favorites" | "random" | "course" | "manual";
export type CoursePoolMode = "smart" | "learned" | "all";
export type StudySessionSize = 5 | 10 | 20 | 0;

export interface StudyPoolSelection {
  kind: StudyPoolKind;
  bookId?: string;
  /** Legacy single-lesson field kept so old localStorage and URLs remain readable. */
  lessonId?: string;
  lessonIds?: string[];
  lexemeIds?: string[];
  courseMode?: CoursePoolMode;
  skills?: StudyCardType[];
  label?: string;
}

export type GamePoolSelection = StudyPoolSelection;
export type GamePoolKind = StudyPoolKind;

export interface SavedStudySet {
  id: string;
  name: string;
  selection: StudyPoolSelection;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STUDY_POOL: StudyPoolSelection = { kind: "daily" };
export const DEFAULT_GAME_POOL = DEFAULT_STUDY_POOL;

const STORAGE_KEY = "vocab-universe:study-pool:v3";
const LEGACY_GAME_POOL_KEY = "vocab-universe:game-pool:v2";
const ACTIVE_COURSE_KEY = "vocab-universe:active-course:v1";
const SESSION_SIZE_KEY = "vocab-universe:study-session-size:v1";
const SAVED_SETS_KEY = "vocab-universe:saved-study-sets:v1";

const kinds: StudyPoolKind[] = ["daily", "weak", "favorites", "random", "course", "manual"];
const courseModes: CoursePoolMode[] = ["smart", "learned", "all"];
const coreSkills: StudyCardType[] = ["recognition", "recall", "sound"];

function uniq(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
  return out.length ? out : undefined;
}

function normalizeSkills(values: unknown): StudyCardType[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values.filter((value): value is StudyCardType => ["recognition", "recall", "sound", "usage"].includes(String(value)));
  return out.length ? [...new Set(out)] : undefined;
}

export function normalizeStudyPoolSelection(value: unknown): StudyPoolSelection {
  if (!value || typeof value !== "object") return { ...DEFAULT_STUDY_POOL };
  const input = value as Partial<StudyPoolSelection>;
  const kind = kinds.includes(input.kind as StudyPoolKind) ? input.kind as StudyPoolKind : "daily";
  const lessonIds = uniq(input.lessonIds) ?? (typeof input.lessonId === "string" && input.lessonId ? [input.lessonId] : undefined);
  const courseMode = courseModes.includes(input.courseMode as CoursePoolMode) ? input.courseMode as CoursePoolMode : "smart";
  const selection: StudyPoolSelection = {
    kind,
    bookId: typeof input.bookId === "string" && input.bookId ? input.bookId : undefined,
    lessonId: lessonIds?.length === 1 ? lessonIds[0] : undefined,
    lessonIds,
    lexemeIds: uniq(input.lexemeIds),
    courseMode,
    skills: normalizeSkills(input.skills),
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : undefined
  };
  if (kind === "daily" || kind === "weak" || kind === "favorites" || kind === "random") {
    delete selection.bookId;
    delete selection.lessonId;
    delete selection.lessonIds;
    delete selection.lexemeIds;
    delete selection.label;
    delete selection.courseMode;
  }
  if (kind === "course") {
    delete selection.lexemeIds;
    delete selection.label;
  }
  if (kind === "manual") {
    delete selection.bookId;
    delete selection.lessonId;
    delete selection.lessonIds;
    selection.courseMode = "all";
  }
  return selection;
}

export function loadStudyPoolSelection(): StudyPoolSelection {
  if (typeof localStorage === "undefined") return { ...DEFAULT_STUDY_POOL };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_GAME_POOL_KEY);
    return normalizeStudyPoolSelection(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_STUDY_POOL };
  }
}

export function saveStudyPoolSelection(next: StudyPoolSelection): StudyPoolSelection {
  const normalized = normalizeStudyPoolSelection(next);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      if (normalized.kind === "course" && normalized.bookId) localStorage.setItem(ACTIVE_COURSE_KEY, JSON.stringify(normalized));
    } catch { /* private/quota mode: keep in-memory selection */ }
  }
  return normalized;
}

export function createStudyPoolSelection(initial?: StudyPoolSelection) {
  const [value, setValue] = createSignal<StudyPoolSelection>(normalizeStudyPoolSelection(initial ?? loadStudyPoolSelection()));
  const update = (next: StudyPoolSelection) => setValue(saveStudyPoolSelection(next));
  return [value, update] as const;
}

export const createGamePoolSelection = createStudyPoolSelection;

export function loadActiveCourseScope(): StudyPoolSelection | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const parsed = normalizeStudyPoolSelection(JSON.parse(localStorage.getItem(ACTIVE_COURSE_KEY) ?? "null"));
    return parsed.kind === "course" && parsed.bookId ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function setManualStudyPool(lexemeIds: string[], label = "Bộ từ đã chọn"): StudyPoolSelection {
  return saveStudyPoolSelection({ kind: "manual", lexemeIds, courseMode: "all", label });
}

export function gamePoolAffectsFsrs(selection: StudyPoolSelection): boolean {
  return selection.kind === "daily" || (selection.kind === "course" && (selection.courseMode ?? "smart") === "smart");
}

export function poolShortLabel(selection: StudyPoolSelection): string {
  if (selection.kind === "daily") return "Đến hạn";
  if (selection.kind === "weak") return "Từ yếu";
  if (selection.kind === "favorites") return "★ Đánh dấu";
  if (selection.kind === "random") return "Random đã học";
  if (selection.kind === "manual") return selection.label || `${selection.lexemeIds?.length ?? 0} từ đã chọn`;
  const lessonCount = selection.lessonIds?.length ?? (selection.lessonId ? 1 : 0);
  const scope = lessonCount > 1 ? `${lessonCount} bài` : lessonCount === 1 ? "Bài" : "Quyển";
  if ((selection.courseMode ?? "smart") === "learned") return `${scope} · đã học`;
  if ((selection.courseMode ?? "smart") === "all") return `${scope} · toàn bộ`;
  return `${scope} · đến hạn`;
}

export function poolLearningNote(selection: StudyPoolSelection): string {
  if (gamePoolAffectsFsrs(selection)) return "Chỉ card đúng kỹ năng đang đến hạn mới được dùng để cập nhật FSRS.";
  if (selection.kind === "weak") return "Extra practice cho từ yếu; sai được đánh dấu cần ôn nhưng không dịch lịch FSRS.";
  if (selection.kind === "favorites") return "Luyện tự do từ đã đánh dấu; không đẩy lịch FSRS đi xa hơn.";
  if (selection.kind === "random") return "Random chỉ lấy từ đã học; không đẩy lịch FSRS đi xa hơn.";
  if (selection.kind === "manual") return "Bộ từ tự chọn là practice-only; không tự tạo mastery hay đẩy lịch FSRS.";
  if (selection.kind === "course" && selection.courseMode === "learned") return "Xáo trộn từ đã học trong các bài đã chọn; practice-only.";
  return "Luyện toàn phạm vi đã chọn; có thể gồm từ chưa học. Dùng để khám phá, không cập nhật lịch FSRS.";
}

export function selectionSkills(selection: StudyPoolSelection): StudyCardType[] {
  return selection.skills?.length ? selection.skills : coreSkills;
}

export function loadStudySessionSize(): StudySessionSize {
  if (typeof localStorage === "undefined") return 10;
  const value = Number(localStorage.getItem(SESSION_SIZE_KEY));
  return value === 5 || value === 10 || value === 20 || value === 0 ? value : 10;
}

export function saveStudySessionSize(value: StudySessionSize): StudySessionSize {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(SESSION_SIZE_KEY, String(value)); } catch { /* ignore */ }
  }
  return value;
}

export function loadSavedStudySets(): SavedStudySet[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SETS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Partial<SavedStudySet>;
      if (typeof raw.id !== "string" || typeof raw.name !== "string") return [];
      const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
      return [{ id: raw.id, name: raw.name, selection: normalizeStudyPoolSelection(raw.selection), createdAt, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt }];
    });
  } catch {
    return [];
  }
}

function persistSavedStudySets(items: SavedStudySet[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(SAVED_SETS_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function saveStudySet(name: string, selection: StudyPoolSelection): SavedStudySet[] {
  const trimmed = name.trim();
  if (!trimmed) return loadSavedStudySets();
  const now = new Date().toISOString();
  const items = loadSavedStudySets();
  const existing = items.find((item) => item.name.toLocaleLowerCase("vi-VN") === trimmed.toLocaleLowerCase("vi-VN"));
  if (existing) {
    existing.selection = normalizeStudyPoolSelection(selection);
    existing.updatedAt = now;
  } else {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `set-${Date.now()}`;
    items.unshift({ id, name: trimmed, selection: normalizeStudyPoolSelection(selection), createdAt: now, updatedAt: now });
  }
  persistSavedStudySets(items.slice(0, 30));
  return items.slice(0, 30);
}

export function deleteStudySet(id: string): SavedStudySet[] {
  const items = loadSavedStudySets().filter((item) => item.id !== id);
  persistSavedStudySets(items);
  return items;
}
