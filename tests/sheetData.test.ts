import { describe, expect, it } from "vitest";
import { buildCanonicalDataset, sha1Hex, type SheetVocabularyRow } from "../src/services/data/canonical";
import { parseVocabularySheetCsv, validateVocabularySheetRows } from "../src/services/data/sheet";

const csv = `Nguồn,Bài/Unit,Tên bài,Nghĩa tên bài,STT,Từ,Pinyin,Từ loại,Hán Việt,Nghĩa,Nhóm,Trạng thái,Mức nhớ,Ghi chú,Số lần xuất hiện\nThương mại 2,Bài 1,订购真丝面料,Đặt mua vải lụa tơ tằm,1,订购,dìnggòu,v.,định cấu,đặt hàng,Từ vựng,Chưa học,,,1\nThương mại 2,Bài 1,订购真丝面料,Đặt mua vải lụa tơ tằm,2,真丝,zhēnsī,n.,chân ti,"tơ thật, lụa thật",Từ vựng,Chưa học,,,1`;

function sourceRows(source: SheetVocabularyRow["source"], count: number): SheetVocabularyRow[] {
  const lessonType = source === "reading" ? "Unit" : "Bài";
  return Array.from({ length: count }, (_, index) => ({
    source,
    lessonType,
    lesson: 1,
    lessonTitle: "测试",
    hanzi: `词${source}${index}`,
    pinyin: `ci${index}`,
    pos: "n.",
    hanViet: "",
    meaningVi: `nghĩa ${index}`,
    kind: "normal",
    needsReview: false
  }));
}

describe("Google Sheet vocabulary source", () => {
  it("parses the management sheet schema", () => {
    const rows = parseVocabularySheetCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "htm2", lessonType: "Bài", lesson: 1, hanzi: "订购", pinyin: "dìnggòu" });
    expect(rows[1]?.meaningVi).toBe("tơ thật, lụa thật");
  });

  it("keeps legacy SHA-1 IDs stable", () => {
    expect(sha1Hex("订购")).toBe("50d8f9ef23605ff80a40de81f6c13856adfa1cbb");
    const dataset = buildCanonicalDataset(parseVocabularySheetCsv(csv));
    expect(dataset.lexemes[0]?.id).toBe("lexeme_50d8f9ef2360");
    expect(dataset.occurrences).toHaveLength(2);
  });

  it("rejects a truncated four-book export", () => {
    const rows = [
      ...sourceRows("htm2", 150),
      ...sourceRows("htm3", 200),
      ...sourceRows("bridge", 750),
      ...sourceRows("reading", 1099)
    ];
    expect(() => validateVocabularySheetRows(rows)).toThrow(/reading/);
  });
});
