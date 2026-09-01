import { createSignal } from "solid-js";
import type { StudyCardType } from "../../domain/models";
import type { PlayableRowsOptions } from "./gameData";

export type GamePoolKind = "daily" | "weak" | "favorites" | "random" | "course";
export type CoursePoolMode = "smart" | "learned" | "all";

export interface GamePoolSelection {
  kind: GamePoolKind;
  bookId?: string;
  lessonId?: string;
  courseMode?: CoursePoolMode;
}

export const DEFAULT_GAME_POOL: GamePoolSelection = { kind: "daily" };

const STORAGE_KEY = "vocab-universe:game-pool:v2";

export function loadGamePoolSelection(): GamePoolSelection {
  if (typeof localStorage === "undefined") return { ...DEFAULT_GAME_POOL };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GamePoolSelection> | null;
    if (!parsed || !["daily","weak","favorites","random","course"].includes(String(parsed.kind))) return { ...DEFAULT_GAME_POOL };
    return { kind: parsed.kind as GamePoolKind, bookId: parsed.bookId, lessonId: parsed.lessonId, courseMode: parsed.courseMode === "all" ? "all" : parsed.courseMode === "learned" ? "learned" : "smart" };
  } catch { return { ...DEFAULT_GAME_POOL }; }
}

export function createGamePoolSelection() {
  const [value, setValue] = createSignal<GamePoolSelection>(loadGamePoolSelection());
  const update = (next: GamePoolSelection) => {
    setValue(next);
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private/quota mode: keep in-memory selection */ }
    }
  };
  return [value, update] as const;
}

export function gamePoolAffectsFsrs(selection: GamePoolSelection): boolean {
  // Only scheduled smart-review pools are allowed to advance FSRS. Weak/favorite/random/full-course are deliberate extra practice.
  return selection.kind === "daily" || (selection.kind === "course" && (selection.courseMode ?? "smart") === "smart");
}

export function playableOptionsForSelection(selection: GamePoolSelection, limit: number, skills?: StudyCardType[]): PlayableRowsOptions {
  if (selection.kind === "daily") return { limit, poolMode: "smart", allowNew: false, skills };
  if (selection.kind === "weak") return { limit, poolMode: "weak", allowNew: false, skills };
  if (selection.kind === "favorites") return { limit, poolMode: "favorites", allowNew: false, skills };
  if (selection.kind === "random") return { limit, poolMode: "random-learned", allowNew: false, skills };
  const courseMode = selection.courseMode ?? "smart";
  return {
    limit,
    bookId: selection.bookId,
    lessonId: selection.lessonId,
    poolMode: courseMode === "smart" ? "smart" : courseMode === "learned" ? "random-learned" : "all",
    allowNew: false,
    skills
  };
}

export function poolShortLabel(selection: GamePoolSelection): string {
  if (selection.kind === "daily") return "Đến hạn";
  if (selection.kind === "weak") return "Từ yếu";
  if (selection.kind === "favorites") return "★";
  if (selection.kind === "random") return "Random đã học";
  if ((selection.courseMode ?? "smart") === "learned") return selection.lessonId ? "Bài · đã học" : "Quyển · đã học";
  if ((selection.courseMode ?? "smart") === "all") return selection.lessonId ? "Bài · toàn bộ" : "Quyển · toàn bộ";
  return selection.lessonId ? "Bài · đến hạn" : "Quyển · đến hạn";
}

export function poolLearningNote(selection: GamePoolSelection): string {
  if (gamePoolAffectsFsrs(selection)) return "Chỉ card đúng skill đang đến hạn mới được dùng để cập nhật FSRS.";
  if (selection.kind === "weak") return "Extra practice cho từ yếu; sai sẽ tiếp tục được đánh dấu nhưng không dịch lịch FSRS.";
  if (selection.kind === "favorites") return "Luyện tự do từ đã đánh dấu; không đẩy lịch FSRS đi xa hơn.";
  if (selection.kind === "random") return "Random chỉ lấy từ đã học; không đẩy lịch FSRS đi xa hơn.";
  if (selection.kind === "course" && selection.courseMode === "learned") return "Xáo trộn toàn bộ từ đã học trong quyển/bài đã chọn; practice only.";
  return "Luyện toàn phạm vi đã chọn; có thể gồm từ chưa học. Dùng để khám phá, không cập nhật lịch FSRS.";
}
