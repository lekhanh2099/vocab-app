import type { Book, ContextItem, Lesson, Lexeme, Occurrence, Reading, Sense } from "../../domain/models";

export interface CanonicalDataset {
  version: string;
  generatedAt: string;
  books: Book[];
  lessons: Lesson[];
  lexemes: Lexeme[];
  readings: Reading[];
  senses: Sense[];
  occurrences: Occurrence[];
  contexts: ContextItem[];
}

export interface SheetVocabularyRow {
  source: "htm2" | "htm3" | "bridge" | "reading";
  lessonType: "Bài" | "Unit";
  lesson: number;
  lessonTitle: string;
  hanzi: string;
  pinyin: string;
  pos: string;
  hanViet: string;
  meaningVi: string;
  kind: string;
  needsReview: boolean;
}

const BOOKS: Record<SheetVocabularyRow["source"], [string, string, "Bài" | "Unit"]> = {
  htm2: ["Hán thương mại 2", "Hán thương mại 2", "Bài"],
  htm3: ["Hán thương mại 3", "Hán thương mại 3", "Bài"],
  bridge: ["Nhịp cầu Hán ngữ", "桥梁——实用汉语中级教程 (上)", "Bài"],
  reading: ["Đọc hiểu", "Đọc hiểu", "Unit"]
};

const sourceOrder = Object.keys(BOOKS) as SheetVocabularyRow["source"][];

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const totalLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const buffer = new Uint8Array(totalLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3]! ^ words[index - 8]! ^ words[index - 14]! ^ words[index - 16]!, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[index]!) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function id(prefix: string, ...parts: unknown[]): string {
  const raw = parts.map(String).map((value) => value.trim()).join("|");
  return `${prefix}_${sha1Hex(raw).slice(0, 12)}`;
}

function pinyinKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-·'’]+/g, "");
}

function preserveUmlaut(value: string): string {
  return value.replace(/[üǖǘǚǜ]/g, "v");
}

function strip(value: string): string {
  return preserveUmlaut(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function buildCanonicalDataset(rows: SheetVocabularyRow[]): CanonicalDataset {
  if (!rows.length) throw new Error("Google Sheet returned no vocabulary rows");

  const books: Book[] = sourceOrder.map((bookId) => {
    const [nameVi, titleZh, lessonLabel] = BOOKS[bookId];
    return { id: bookId, nameVi, titleZh, lessonLabel };
  });

  const lessonMap = new Map<string, Lesson>();
  for (const row of rows) {
    const key = `${row.source}|${row.lessonType}|${row.lesson}`;
    if (!lessonMap.has(key)) {
      lessonMap.set(key, {
        id: id("lesson", row.source, row.lessonType, row.lesson),
        bookId: row.source,
        index: row.lesson,
        label: row.lessonType,
        title: row.lessonTitle
      });
    }
  }

  const lessons = [...lessonMap.values()].sort((a, b) => {
    const sourceDiff = sourceOrder.indexOf(a.bookId as SheetVocabularyRow["source"]) - sourceOrder.indexOf(b.bookId as SheetVocabularyRow["source"]);
    return sourceDiff || a.index - b.index;
  });

  const lexemes = new Map<string, Lexeme>();
  const readings = new Map<string, Reading>();
  const senses = new Map<string, Sense>();
  const occurrences: Occurrence[] = [];

  rows.forEach((row, index) => {
    const hanzi = row.hanzi.trim();
    const pinyin = row.pinyin.trim();
    const meaningVi = row.meaningVi.trim();
    const hanViet = row.hanViet.trim();
    const pos = row.pos.trim();
    const kind = row.kind || "normal";
    if (!hanzi || !pinyin || !meaningVi) throw new Error(`Missing core data at Sheet row ${index + 2}`);

    const lexemeId = id("lexeme", hanzi);
    if (!lexemes.has(lexemeId)) lexemes.set(lexemeId, { id: lexemeId, hanzi, searchKey: "" });

    const pk = pinyinKey(pinyin);
    const readingId = id("reading", lexemeId, pk);
    if (!readings.has(readingId)) readings.set(readingId, { id: readingId, lexemeId, pinyin, pinyinKey: pk, variants: [] });
    const reading = readings.get(readingId)!;
    if (!reading.variants.includes(pinyin)) reading.variants.push(pinyin);

    const senseId = id("sense", lexemeId, readingId, meaningVi, hanViet, pos, kind);
    if (!senses.has(senseId)) senses.set(senseId, { id: senseId, lexemeId, readingId, meaningVi, hanViet, pos, kind });

    const lesson = lessonMap.get(`${row.source}|${row.lessonType}|${row.lesson}`);
    if (!lesson) throw new Error(`Missing lesson mapping for Sheet row ${index + 2}`);
    occurrences.push({
      id: id("occ", index, row.source, row.lesson, hanzi, pinyin, meaningVi),
      lexemeId,
      readingId,
      senseId,
      bookId: row.source,
      lessonId: lesson.id,
      rawHanzi: hanzi,
      rawPinyin: pinyin,
      rawMeaningVi: meaningVi,
      rawHanViet: hanViet,
      rawPos: pos,
      kind,
      needsReview: row.needsReview
    });
  });

  const readingsByLexeme = new Map<string, Reading[]>();
  const sensesByLexeme = new Map<string, Sense[]>();
  for (const reading of readings.values()) {
    const list = readingsByLexeme.get(reading.lexemeId) ?? [];
    list.push(reading);
    readingsByLexeme.set(reading.lexemeId, list);
  }
  for (const sense of senses.values()) {
    const list = sensesByLexeme.get(sense.lexemeId) ?? [];
    list.push(sense);
    sensesByLexeme.set(sense.lexemeId, list);
  }
  for (const lexeme of lexemes.values()) {
    const parts = [lexeme.hanzi];
    for (const reading of readingsByLexeme.get(lexeme.id) ?? []) parts.push(...reading.variants, strip(reading.pinyinKey));
    for (const sense of sensesByLexeme.get(lexeme.id) ?? []) parts.push(sense.meaningVi, sense.hanViet, sense.pos);
    lexeme.searchKey = [...new Set(parts.filter(Boolean).map(strip))].join(" ");
  }

  const versionPayload = rows.map((row) => [
    row.source, row.lessonType, row.lesson, row.lessonTitle, row.hanzi, row.pinyin,
    row.pos, row.hanViet, row.meaningVi, row.kind, row.needsReview ? "1" : "0"
  ].join("\u001f")).join("\n");

  return {
    version: `sheet-${sha1Hex(versionPayload).slice(0, 16)}`,
    generatedAt: new Date().toISOString(),
    books,
    lessons,
    lexemes: [...lexemes.values()],
    readings: [...readings.values()],
    senses: [...senses.values()],
    occurrences,
    contexts: []
  };
}
