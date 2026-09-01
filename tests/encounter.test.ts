import { describe, expect, it } from "vitest";
import { encounterOutcome } from "../src/games/shared/encounter";
import { ratingForAutomaticAnswer } from "../src/services/srs/scheduler";

describe("game encounter grading", () => {
  it("maps first-try success to Good", () => {
    const outcome = encounterOutcome(true, 0);
    expect(ratingForAutomaticAnswer(outcome.correct, outcome.hinted)).toBe("good");
  });
  it("maps retry success to Hard", () => {
    const outcome = encounterOutcome(true, 2);
    expect(ratingForAutomaticAnswer(outcome.correct, outcome.hinted)).toBe("hard");
  });
  it("maps unresolved failure to Again", () => {
    const outcome = encounterOutcome(false, 2);
    expect(ratingForAutomaticAnswer(outcome.correct, outcome.hinted)).toBe("again");
  });
});
