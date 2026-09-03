import { describe, expect, it } from "vitest";
import { buildCanonicalDataset, type SheetVocabularyRow } from "../src/services/data/canonical";

function row(overrides: Partial<SheetVocabularyRow> = {}): SheetVocabularyRow {
  return {
    source: "htm2",
    lessonType: "Bài",
    lesson: 1,
    lessonTitle: "测试",
    hanzi: "测试",
    pinyin: "cèshì",
    pos: "v.",
    hanViet: "trắc thí",
    meaningVi: "kiểm tra",
    kind: "normal",
    needsReview: false,
    ...overrides
  };
}

describe("canonical Sheet dataset", () => {
  it("does not manufacture usage contexts", () => {
    expect(buildCanonicalDataset([row()]).contexts).toHaveLength(0);
  });

  it("keeps separate readings for polyphonic source entries", () => {
    const dataset = buildCanonicalDataset([
      row({ hanzi: "传", pinyin: "chuán", meaningVi: "truyền" }),
      row({ hanzi: "传", pinyin: "zhuàn", meaningVi: "truyện" })
    ]);
    const lexeme = dataset.lexemes.find((item) => item.hanzi === "传");
    expect(lexeme).toBeTruthy();
    expect(dataset.readings.filter((item) => item.lexemeId === lexeme!.id).map((item) => item.pinyinKey).sort()).toEqual(["chuán", "zhuàn"]);
  });

  it("indexes ü-series pinyin as v before diacritic stripping", () => {
    const dataset = buildCanonicalDataset([
      row({ hanzi: "利率", pinyin: "lìlǜ", meaningVi: "lãi suất" }),
      row({ hanzi: "旅行社", pinyin: "lǚxíngshè", meaningVi: "công ty du lịch" })
    ]);
    expect(dataset.lexemes.find((item) => item.hanzi === "利率")?.searchKey).toContain("lilv");
    expect(dataset.lexemes.find((item) => item.hanzi === "旅行社")?.searchKey).toContain("lvxingshe");
  });

  it("rejects missing core Sheet data", () => {
    expect(() => buildCanonicalDataset([row({ pinyin: "" })])).toThrow(/Missing core data/);
  });
});
