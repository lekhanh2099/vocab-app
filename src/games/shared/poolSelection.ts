import type { StudyCardType } from "../../domain/models";
import type { PlayableRowsOptions } from "./gameData";
import {
  DEFAULT_GAME_POOL,
  createGamePoolSelection,
  gamePoolAffectsFsrs,
  loadStudyPoolSelection,
  poolLearningNote,
  poolShortLabel,
  saveStudyPoolSelection,
  type CoursePoolMode,
  type GamePoolKind,
  type GamePoolSelection,
  type StudyPoolSelection,
  type StudyPoolKind
} from "../../features/study/pool";

export {
  DEFAULT_GAME_POOL,
  createGamePoolSelection,
  gamePoolAffectsFsrs,
  loadStudyPoolSelection,
  poolLearningNote,
  poolShortLabel,
  saveStudyPoolSelection
};
export type { CoursePoolMode, GamePoolKind, GamePoolSelection, StudyPoolSelection, StudyPoolKind };

export function playableOptionsForSelection(selection: GamePoolSelection, limit: number, skills?: StudyCardType[]): PlayableRowsOptions {
  if (selection.kind === "daily") return { limit, poolMode: "smart", allowNew: false, skills };
  if (selection.kind === "weak") return { limit, poolMode: "weak", allowNew: false, skills };
  if (selection.kind === "favorites") return { limit, poolMode: "favorites", allowNew: false, skills };
  if (selection.kind === "random") return { limit, poolMode: "random-learned", allowNew: false, skills };
  if (selection.kind === "manual") return {
    limit,
    lexemeIds: selection.lexemeIds,
    poolMode: "all",
    allowNew: false,
    skills
  };
  const courseMode = selection.courseMode ?? "smart";
  const lessonIds = selection.lessonIds?.length ? selection.lessonIds : selection.lessonId ? [selection.lessonId] : undefined;
  return {
    limit,
    bookId: selection.bookId,
    lessonId: lessonIds?.length === 1 ? lessonIds[0] : undefined,
    lessonIds,
    poolMode: courseMode === "smart" ? "smart" : courseMode === "learned" ? "random-learned" : "all",
    allowNew: false,
    skills
  };
}
