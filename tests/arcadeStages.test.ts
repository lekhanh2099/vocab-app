import { describe, expect, it } from "vitest";
import { ARCADE_STAGES, stageMissions, starsForResult } from "../src/games/shared/arcadeStages";

describe("arcade stage design", () => {
  it("ramps harder and unlocks more survival tools across stages", () => {
    expect(ARCADE_STAGES.map((stage) => stage.rampPerMinute)).toEqual([...ARCADE_STAGES.map((stage) => stage.rampPerMinute)].sort((a,b) => a-b));
    expect(ARCADE_STAGES[0]!.powerUps).toContain("slow");
    expect(ARCADE_STAGES[1]!.powerUps).toContain("shield");
  });

  it("awards stars from explicit missions", () => {
    const stage = ARCADE_STAGES[1]!;
    const missions = stageMissions(stage, 20, 2, 20, 7);
    expect(missions.map((item) => item.completed)).toEqual([true, true, true]);
    expect(starsForResult(20, 2, 20, 7, stage)).toBe(3);
  });

  it("does not award finish mission if the stage was not cleared", () => {
    const stage = ARCADE_STAGES[2]!;
    expect(stageMissions(stage, 10, 5, 24, 4)[0]!.completed).toBe(false);
  });
});
