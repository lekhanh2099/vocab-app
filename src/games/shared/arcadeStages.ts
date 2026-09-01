export type ArcadeStageId = "warmup" | "reflex" | "storm" | "master";
export type ArcadeThemeId = "dusk" | "night" | "storm" | "redmoon";
export type PowerUpId = "slow" | "heart" | "shield";

export interface ArcadeStage {
  id: ArcadeStageId;
  number: number;
  name: string;
  subtitle: string;
  words: number;
  lives: number;
  speedMultiplier: number;
  /** Legacy per-answer ramp used by Shooter and as an input to Falling's continuous ramp. */
  acceleration: number;
  /** Extra speed gained per active minute in Falling. */
  rampPerMinute: number;
  retryLimit: number;
  difficulty: "Nhẹ" | "Vừa" | "Khó" | "Cao thủ";
  theme: ArcadeThemeId;
  powerUps: PowerUpId[];
  missionAccuracy: number;
  missionCombo: number;
}

export const ARCADE_STAGES: ArcadeStage[] = [
  { id: "warmup", number: 1, name: "Khởi động", subtitle: "Làm quen nhịp rơi", words: 12, lives: 4, speedMultiplier: 0.72, acceleration: 0.72, rampPerMinute: 0.16, retryLimit: 2, difficulty: "Nhẹ", theme: "dusk", powerUps: ["slow", "heart"], missionAccuracy: 75, missionCombo: 4 },
  { id: "reflex", number: 2, name: "Phản xạ", subtitle: "Nhịp chuẩn để ôn hằng ngày", words: 20, lives: 3, speedMultiplier: 0.90, acceleration: 1, rampPerMinute: 0.25, retryLimit: 2, difficulty: "Vừa", theme: "night", powerUps: ["slow", "heart", "shield"], missionAccuracy: 80, missionCombo: 6 },
  { id: "storm", number: 3, name: "Bão chữ", subtitle: "Nhanh dần, ít thời gian suy nghĩ", words: 24, lives: 3, speedMultiplier: 1.04, acceleration: 1.2, rampPerMinute: 0.36, retryLimit: 1, difficulty: "Khó", theme: "storm", powerUps: ["slow", "heart", "shield"], missionAccuracy: 85, missionCombo: 8 },
  { id: "master", number: 4, name: "Cao thủ", subtitle: "Ít mạng, tốc độ tăng mạnh theo thời gian", words: 28, lives: 2, speedMultiplier: 1.16, acceleration: 1.4, rampPerMinute: 0.48, retryLimit: 1, difficulty: "Cao thủ", theme: "redmoon", powerUps: ["slow", "shield"], missionAccuracy: 90, missionCombo: 10 }
];

export function getArcadeStage(id: ArcadeStageId): ArcadeStage {
  return ARCADE_STAGES.find((stage) => stage.id === id) ?? ARCADE_STAGES[0]!;
}

export function accuracyPercent(correct: number, wrong: number): number {
  return Math.round((correct / Math.max(1, correct + wrong)) * 100);
}

export interface MissionResult { id: "finish" | "accuracy" | "combo"; label: string; completed: boolean; }

export function stageMissions(stage: ArcadeStage, correct: number, wrong: number, target: number, bestCombo: number): MissionResult[] {
  const accuracy = accuracyPercent(correct, wrong);
  return [
    { id: "finish", label: `Hoàn thành ${target || stage.words} mục tiêu`, completed: target > 0 && correct >= target },
    { id: "accuracy", label: `Độ chính xác ≥ ${stage.missionAccuracy}%`, completed: accuracy >= stage.missionAccuracy },
    { id: "combo", label: `Combo ≥ ×${stage.missionCombo}`, completed: bestCombo >= stage.missionCombo }
  ];
}

export function starsForResult(correct: number, wrong: number, target: number, bestCombo = 0, stage: ArcadeStage = ARCADE_STAGES[0]!): number {
  return stageMissions(stage, correct, wrong, target, bestCombo).filter((mission) => mission.completed).length;
}
