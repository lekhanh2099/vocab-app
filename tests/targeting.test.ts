import { describe, expect, it } from "vitest";
import type { VocabularyRow } from "../src/domain/models";
import { expandRowsByReading, filterUnambiguousMeaningTargets, gameTargetKey, targetMeaning } from "../src/games/shared/targeting";

function row(hanzi: string, readings: { id: string; pinyin: string; meaning: string }[]): VocabularyRow {
  const lexemeId = `lexeme:${hanzi}`;
  return {
    lexeme: { id: lexemeId, hanzi, searchKey: hanzi },
    readings: readings.map((item) => ({ id: item.id, lexemeId, pinyin: item.pinyin, pinyinKey: item.pinyin, variants: [item.pinyin] })),
    senses: readings.map((item) => ({ id: `sense:${item.id}`, lexemeId, readingId: item.id, meaningVi: item.meaning, hanViet: "", pos: "", kind: "normal" })),
    occurrences: readings.map((item) => ({ id: `occ:${item.id}`, lexemeId, readingId: item.id, senseId: `sense:${item.id}`, bookId: "book", lessonId: `lesson:${item.id}`, rawHanzi: hanzi, rawPinyin: item.pinyin, rawMeaningVi: item.meaning, rawHanViet: "", rawPos: "", kind: "normal", needsReview: false })),
    books: [{ id: "book", nameVi: "Book", titleZh: "", lessonLabel: "Bài" }],
    lessons: readings.map((item, index) => ({ id: `lesson:${item.id}`, bookId: "book", index: index + 1, label: "Bài", title: "" })),
    favorite: false,
    cardMastery: {}
  };
}

describe("game targeting", () => {
  it("expands polyphonic lexemes into independent reading targets", () => {
    const targets = expandRowsByReading([row("传", [
      { id: "r1", pinyin: "chuán", meaning: "truyền" },
      { id: "r2", pinyin: "zhuàn", meaning: "truyện" }
    ])]);
    expect(targets.map((item) => item.readings[0]?.pinyin).sort()).toEqual(["chuán", "zhuàn"]);
    expect(new Set(targets.map(gameTargetKey)).size).toBe(2);
    expect(targets.every((item) => item.senses.length === 1 && item.occurrences.length === 1)).toBe(true);
  });

  it("removes ambiguous Vietnamese recall prompts", () => {
    const a = expandRowsByReading([row("开心", [{ id: "a", pinyin: "kāixīn", meaning: "vui vẻ" }])])[0]!;
    const b = expandRowsByReading([row("快乐", [{ id: "b", pinyin: "kuàilè", meaning: "vui vẻ" }])])[0]!;
    const c = expandRowsByReading([row("期限", [{ id: "c", pinyin: "qīxiàn", meaning: "thời hạn" }])])[0]!;
    expect(filterUnambiguousMeaningTargets([a,b,c]).map((item) => item.lexeme.hanzi)).toEqual(["期限"]);
  });

  it("fails fast with a useful error when a JavaScript caller violates the array contract", () => {
    expect(() => expandRowsByReading(row("期限", [{ id: "x", pinyin: "qīxiàn", meaning: "thời hạn" }]) as unknown as VocabularyRow[])).toThrow(/VocabularyRow\[\]/);
  });

  it("respects an explicit target sense when the same reading has multiple source senses", () => {
    const base = row("效率", [{ id: "r-eff", pinyin: "xiàolǜ", meaning: "hiệu suất" }]);
    base.senses.push({ id: "sense:alt", lexemeId: base.lexeme.id, readingId: "r-eff", meaningVi: "hiệu quả", hanViet: "", pos: "", kind: "normal" });
    const focused: VocabularyRow = { ...base, targetSenseId: "sense:alt" };
    const [target] = expandRowsByReading([focused]);
    expect(target?.targetSenseId).toBe("sense:alt");
    expect(target?.senses).toHaveLength(2);
    expect(target && targetMeaning(target)).toBe("hiệu quả");
  });

  it("keeps game target keys distinct for separate senses of one reading", () => {
    const base = row("效率", [{ id: "r-eff", pinyin: "xiàolǜ", meaning: "hiệu suất" }]);
    base.senses.push({ id: "sense:alt", lexemeId: base.lexeme.id, readingId: "r-eff", meaningVi: "hiệu quả", hanViet: "", pos: "", kind: "normal" });
    const a: VocabularyRow = { ...base, targetSenseId: "sense:r-eff" };
    const b: VocabularyRow = { ...base, targetSenseId: "sense:alt" };
    expect(gameTargetKey(a)).not.toBe(gameTargetKey(b));
  });

});
