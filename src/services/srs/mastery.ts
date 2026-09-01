import type { StudyCardRecord, StudyCardType } from "../../domain/models";

export function deriveCardMastery(card: StudyCardRecord): number {
  const fsrs = card.fsrs as unknown as { reps?: number; stability?: number; lapses?: number };
  const reps = fsrs.reps ?? 0;
  const stability = fsrs.stability ?? 0;
  if (reps === 0) return 0;
  if (reps <= 1) return 1;
  if (stability < 1) return 2;
  if (stability < 7) return 3;
  if (stability < 30) return 4;
  return 5;
}

export function deriveLexemeMastery(skills: Partial<Record<StudyCardType, number>>): number {
  const core = (["recognition", "recall", "sound"] as StudyCardType[]).map((type) => skills[type] ?? 0);
  return Math.min(...core);
}
