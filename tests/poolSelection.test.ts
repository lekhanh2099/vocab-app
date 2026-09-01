import { describe, expect, it } from "vitest";
import { gamePoolAffectsFsrs, playableOptionsForSelection } from "../src/games/shared/poolSelection";

describe("game pool learning policy", () => {
  it("only scheduled smart pools can advance FSRS", () => {
    expect(gamePoolAffectsFsrs({ kind: "daily" })).toBe(true);
    expect(gamePoolAffectsFsrs({ kind: "weak" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "favorites" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "random" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "smart" })).toBe(true);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "learned" })).toBe(false);
    expect(gamePoolAffectsFsrs({ kind: "course", bookId: "b", courseMode: "all" })).toBe(false);
  });

  it("never introduces fresh words through recall-game smart pools", () => {
    expect(playableOptionsForSelection({ kind: "daily" }, 40, ["sound"])).toMatchObject({ poolMode: "smart", allowNew: false, skills: ["sound"] });
    expect(playableOptionsForSelection({ kind: "random" }, 40, ["sound"])).toMatchObject({ poolMode: "random-learned", allowNew: false });
    expect(playableOptionsForSelection({ kind: "course", bookId: "b", lessonId: "l", courseMode: "smart" }, 40, ["recall"])).toEqual({
      limit: 40, bookId: "b", lessonId: "l", poolMode: "smart", allowNew: false, skills: ["recall"]
    });
    expect(playableOptionsForSelection({ kind: "course", bookId: "b", lessonId: "l", courseMode: "learned" }, 40)).toMatchObject({
      bookId: "b", lessonId: "l", poolMode: "random-learned", allowNew: false
    });
  });
});
