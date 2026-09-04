import { describe, expect, it } from "vitest";
import { gamePoolAffectsFsrs, playableOptionsForSelection } from "../src/games/shared/poolSelection";
import { normalizeStudyPoolSelection, selectionSkills } from "../src/features/study/pool";

describe("study/game pool learning policy", () => {
  it("only scheduled smart pools can advance FSRS", () => {
    expect(gamePoolAffectsFsrs({ kind: "daily" })).toBe(true);
    expect(gamePoolAffectsFsrs({ kind: "weak" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "favorites" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "random" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "manual", lexemeIds: ["x"] })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "smart" })).toBe(true);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "learned" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "all" })).toBe(false);
  });

  it("normalizes legacy single lesson into the shared multi-lesson shape", () => {
    expect(normalizeStudyPoolSelection({ kind: "course", bookId: "b", lessonId: "l", courseMode: "all" })).toMatchObject({
      kind: "course", bookId: "b", lessonId: "l", lessonIds: ["l"], courseMode: "all"
    });
  });

  it("passes multi-lesson and manual scopes into playable row options", () => {
    expect(playableOptionsForSelection({ kind: "course", bookId: "b", lessonIds: ["l1", "l2"], courseMode: "all" }, 40)).toMatchObject({
      limit: 40, bookId: "b", lessonIds: ["l1", "l2"], poolMode: "all", allowNew: false
    });
    expect(playableOptionsForSelection({ kind: "manual", lexemeIds: ["x", "y"] }, 20, ["recall"])).toMatchObject({
      limit: 20, lexemeIds: ["x", "y"], poolMode: "all", allowNew: false, skills: ["recall"]
    });
  });

  it("never introduces fresh words through recall-game smart pools", () => {
    expect(playableOptionsForSelection({ kind: "daily" }, 40, ["sound"])).toMatchObject({ poolMode: "smart", allowNew: false, skills: ["sound"] });
    expect(playableOptionsForSelection({ kind: "random" }, 40, ["sound"])).toMatchObject({ poolMode: "random-learned", allowNew: false });
    expect(playableOptionsForSelection({ kind: "course", bookId: "b", lessonId: "l", courseMode: "smart" }, 40, ["recall"])).toMatchObject({
      limit: 40, bookId: "b", lessonIds: ["l"], poolMode: "smart", allowNew: false, skills: ["recall"]
    });
    expect(playableOptionsForSelection({ kind: "course", bookId: "b", lessonId: "l", courseMode: "learned" }, 40)).toMatchObject({
      bookId: "b", lessonIds: ["l"], poolMode: "random-learned", allowNew: false
    });
  });

  it("defaults flashcards to the three core skills", () => {
    expect(selectionSkills({ kind: "daily" })).toEqual(["recognition", "recall", "sound"]);
  });
});
