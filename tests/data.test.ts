import { describe, expect, it } from "vitest";
import seed from "../src/data/seed.json";

describe("canonical seed",()=>{
 it("preserves all source occurrences",()=>expect(seed.occurrences).toHaveLength(2475));
 it("deduplicates to 2300 lexemes",()=>expect(seed.lexemes).toHaveLength(2300));
 it("does not fake lesson titles as usage contexts",()=>expect(seed.contexts).toHaveLength(0));
 it("keeps separate readings for polyphonic source entries",()=>{
   const chuan=seed.lexemes.find(x=>x.hanzi==="传");expect(chuan).toBeTruthy();
   const readings=seed.readings.filter(x=>x.lexemeId===chuan!.id).map(x=>x.pinyinKey).sort();
   expect(readings).toEqual(["chuán","zhuàn"]);
 });
 it("indexes ü-series pinyin as v before diacritic stripping",()=>{
   const interest=seed.lexemes.find(x=>x.hanzi==="利率");
   const travel=seed.lexemes.find(x=>x.hanzi==="旅行社");
   expect(interest?.searchKey).toContain("lilv");
   expect(travel?.searchKey).toContain("lvxingshe");
 });
});
