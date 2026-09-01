import { describe, expect, it } from "vitest";
import { deriveCardMastery, deriveLexemeMastery } from "../src/services/srs/mastery";
import type { StudyCardRecord } from "../src/domain/models";

function card(reps:number,stability:number):StudyCardRecord{return {id:"x",lexemeId:"l",senseId:"s",type:"recognition",fsrs:{reps,stability} as StudyCardRecord["fsrs"],dueAt:0,createdAt:"",updatedAt:""};}
describe("mastery",()=>{
 it("keeps unseen card at zero",()=>expect(deriveCardMastery(card(0,0))).toBe(0));
 it("requires all core skills for lexeme mastery",()=>expect(deriveLexemeMastery({recognition:5,recall:4})).toBe(0));
 it("uses the weakest core skill",()=>expect(deriveLexemeMastery({recognition:5,recall:3,sound:4})).toBe(3));
});
