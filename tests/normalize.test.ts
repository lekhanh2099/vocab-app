import { describe, expect, it } from "vitest";
import { normalizeSearch, normalizeTyping, toneSignature, typingPrefixMatches } from "../src/features/search/normalize";

describe("search normalization",()=>{
 it("searches Vietnamese without diacritics",()=>expect(normalizeSearch("thời hạn")).toBe("thoihan"));
 it("normalizes marked pinyin",()=>expect(normalizeTyping("qīxiàn")).toBe("qixian"));
 it("matches standard tone-number typing without syllable-boundary guessing",()=>expect(toneSignature("qīxiàn")).toBe(toneSignature("qi1xian4")));
 it("normalizes ü and its tone marks to v before NFD stripping",()=>{
   expect(normalizeTyping("lǜ")).toBe("lv");
   expect(normalizeTyping("lǚxíngshè")).toBe("lvxingshe");
   expect(normalizeSearch("女 性")).toBe("女性");
 });
 it("validates tone-number prefixes by letters and tone sequence",()=>{expect(typingPrefixMatches("qi1","qixian|14","numbers")).toBe(true);expect(typingPrefixMatches("qi2","qixian|14","numbers")).toBe(false);});
});
