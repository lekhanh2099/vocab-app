import { buildCanonicalDataset, type CanonicalDataset, type SheetVocabularyRow } from "./canonical";

const REQUIRED_HEADERS = ["Nguồn", "Bài/Unit", "Tên bài", "Từ", "Pinyin", "Nghĩa"] as const;
const SOURCE_MAP: Record<string, SheetVocabularyRow["source"]> = {
  "thương mại 2": "htm2",
  "hán thương mại 2": "htm2",
  htm2: "htm2",
  "thương mại 3": "htm3",
  "hán thương mại 3": "htm3",
  htm3: "htm3",
  "nhịp cầu": "bridge",
  "nhịp cầu hán ngữ": "bridge",
  bridge: "bridge",
  "đọc hiểu": "reading",
  reading: "reading"
};

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }

  if (quoted) throw new Error("Invalid CSV: unterminated quoted field");
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeSource(value: string, rowNumber: number): SheetVocabularyRow["source"] {
  const key = value.trim().toLowerCase();
  const source = SOURCE_MAP[key];
  if (!source) throw new Error(`Unknown source "${value}" at Sheet row ${rowNumber}`);
  return source;
}

function parseLesson(value: string, rowNumber: number): Pick<SheetVocabularyRow, "lessonType" | "lesson"> {
  const match = value.trim().match(/^(Bài|Unit)\s*(\d+)$/iu);
  if (!match) throw new Error(`Invalid lesson "${value}" at Sheet row ${rowNumber}`);
  const lessonType = match[1] as "Bài" | "Unit";
  return { lessonType, lesson: Number(match[2]) };
}

export function parseVocabularySheetCsv(csv: string): SheetVocabularyRow[] {
  const matrix = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = matrix[0]?.map((value) => value.trim()) ?? [];
  if (!header.length) throw new Error("Google Sheet CSV has no header row");
  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) throw new Error(`Google Sheet is missing required column: ${required}`);
  }

  const column = (name: string): number => header.indexOf(name);
  const valueAt = (row: string[], name: string): string => {
    const index = column(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };

  return matrix.slice(1).flatMap((row, index) => {
    const rowNumber = index + 2;
    if (row.every((value) => !value.trim())) return [];
    const source = normalizeSource(valueAt(row, "Nguồn"), rowNumber);
    const lesson = parseLesson(valueAt(row, "Bài/Unit"), rowNumber);
    return [{
      source,
      ...lesson,
      lessonTitle: valueAt(row, "Tên bài"),
      hanzi: valueAt(row, "Từ"),
      pinyin: valueAt(row, "Pinyin"),
      pos: valueAt(row, "Từ loại"),
      hanViet: valueAt(row, "Hán Việt"),
      meaningVi: valueAt(row, "Nghĩa"),
      kind: "normal",
      needsReview: false
    }];
  });
}

export function validateVocabularySheetRows(rows: SheetVocabularyRow[]): void {
  const minimumBySource: Record<SheetVocabularyRow["source"], number> = { htm2: 150, htm3: 200, bridge: 750, reading: 1100 };
  const counts: Record<SheetVocabularyRow["source"], number> = { htm2: 0, htm3: 0, bridge: 0, reading: 0 };
  for (const row of rows) counts[row.source] += 1;
  for (const [source, minimum] of Object.entries(minimumBySource) as [SheetVocabularyRow["source"], number][]) {
    if (counts[source] < minimum) throw new Error(`Google Sheet integrity check failed for ${source}: ${counts[source]}/${minimum}+ rows`);
  }
}

export async function fetchSheetDataset(signal?: AbortSignal): Promise<CanonicalDataset> {
  const response = await fetch("/api/vocabulary", {
    signal,
    cache: "no-store",
    headers: { Accept: "text/csv" }
  });
  if (!response.ok) throw new Error(`Google Sheet sync failed (${response.status})`);
  const csv = await response.text();
  const rows = parseVocabularySheetCsv(csv);
  validateVocabularySheetRows(rows);
  return buildCanonicalDataset(rows);
}

export async function fetchSheetDatasetWithTimeout(timeoutMs = 12000): Promise<CanonicalDataset> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchSheetDataset(controller.signal);
  } finally {
    window.clearTimeout(timeout);
  }
}
