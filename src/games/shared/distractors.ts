import type { VocabularyRow } from "../../domain/models";
import { normalizeSearch, normalizeTyping } from "../../features/search/normalize";
import { shuffle } from "./gameData";

function posSet(row: VocabularyRow) {
  return new Set(row.senses.map((sense) => sense.pos?.trim()).filter(Boolean));
}

function pinyinHead(row: VocabularyRow) {
  return normalizeTyping(row.readings[0]?.pinyin ?? "").slice(0, 2);
}

function scoreRows(target: VocabularyRow, pool: VocabularyRow[]): { row: VocabularyRow; score: number }[] {
  const targetPos = posSet(target);
  const targetBooks = new Set(target.books.map((book) => book.id));
  const targetLen = [...target.lexeme.hanzi].length;
  const head = pinyinHead(target);
  return pool
    .filter((row) => row.lexeme.id !== target.lexeme.id)
    .map((row) => {
      const rowPos = posSet(row);
      let score = 0;
      if ([...rowPos].some((pos) => targetPos.has(pos))) score += 5;
      if (row.books.some((book) => targetBooks.has(book.id))) score += 3;
      const lenDiff = Math.abs([...row.lexeme.hanzi].length - targetLen);
      if (lenDiff === 0) score += 2;
      else if (lenDiff === 1) score += 1;
      if (head && pinyinHead(row) === head) score += 1;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);
}

function pickScored(scored: { row: VocabularyRow; score: number }[], count: number): VocabularyRow[] {
  if (!scored.length) return [];
  const bestScore = scored[0]!.score;
  const strong = scored.filter((item) => item.score >= Math.max(1, bestScore - 2)).map((item) => item.row);
  const selected = shuffle(strong).slice(0, count);
  if (selected.length >= count) return selected;
  const selectedKeys = new Set(selected.map((row) => `${row.lexeme.id}:${row.readings[0]?.id ?? ""}`));
  return [
    ...selected,
    ...shuffle(scored.map((item) => item.row).filter((row) => !selectedKeys.has(`${row.lexeme.id}:${row.readings[0]?.id ?? ""}`))).slice(0, count - selected.length)
  ];
}

/** Prefer structurally plausible distractors instead of random giveaways. */
export function choosePlausibleDistractors(target: VocabularyRow, pool: VocabularyRow[], count = 3): VocabularyRow[] {
  return pickScored(scoreRows(target, pool), count);
}

/**
 * Same as choosePlausibleDistractors, but guarantees every rendered option has
 * a unique label. This prevents two identical Vietnamese/Hán-Việt choices from
 * appearing in a single question.
 */
export function choosePlausibleDistractorsByLabel(
  target: VocabularyRow,
  pool: VocabularyRow[],
  label: (row: VocabularyRow) => string,
  count = 3
): VocabularyRow[] {
  const targetLabel = normalizeSearch(label(target));
  const seen = new Set<string>([targetLabel]);
  const uniqueScored = scoreRows(target, pool).filter(({ row }) => {
    const key = normalizeSearch(label(row));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return pickScored(uniqueScored, count);
}
