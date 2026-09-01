import { createMemo } from "solid-js";
import { StatCard } from "../components/StatCard";
import { SectionHeader, surface } from "../components/ui";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { getVocabularyRows } from "../db/repositories";
import { deriveLexemeMastery } from "../services/srs/mastery";
import type { StudyCardType } from "../domain/models";

const skillLabels: Record<StudyCardType, string> = { recognition: "Nhận mặt", recall: "Nhớ ngược", sound: "Âm / pinyin", usage: "Cách dùng" };

export default function Progress() {
  const rows = createDexieQuery(getVocabularyRows, []);
  const logs = createDexieQuery(() => db.reviewLogs.toArray(), []);
  const books = createDexieQuery(() => db.books.toArray(), []);
  const leeches = createDexieQuery(() => db.wordFlags.where("flag").equals("leech").toArray(), []);
  const sessions = createDexieQuery(() => db.gameSessions.orderBy("startedAt").reverse().limit(100).toArray(), []);
  const leechIds = createMemo(() => new Set(leeches().map((item) => item.lexemeId)));
  const distribution = createMemo(() => {
    const counts = Array(6).fill(0) as number[];
    for (const row of rows()) counts[deriveLexemeMastery(row.cardMastery)]! += 1;
    return counts;
  });
  const weak = createMemo(() => rows().filter((row) => { const m = deriveLexemeMastery(row.cardMastery); return leechIds().has(row.lexeme.id) || (m > 0 && m <= 2); }).length);
  const reviewed = createMemo(() => rows().filter((row) => Object.keys(row.cardMastery).length > 0).length);
  const mastered = createMemo(() => rows().filter((row) => deriveLexemeMastery(row.cardMastery) >= 5).length);
  const skillAverage = (type: StudyCardType) => {
    const values = rows().map((row) => row.cardMastery[type] ?? 0);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 20) : 0;
  };
  const today = () => new Date().toLocaleDateString("sv-SE");
  const todayLogs = createMemo(() => logs().filter((log) => new Date(log.reviewedAt).toLocaleDateString("sv-SE") === today()));
  const accuracy = createMemo(() => logs().length ? Math.round(logs().filter((log) => log.correct).length / logs().length * 100) : 0);

  return <>
    <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"><StatCard value={rows().length - reviewed()} label="Chưa học"/><StatCard value={reviewed() - mastered()} label="Đang học"/><StatCard value={weak()} label="Từ yếu"/><StatCard value={mastered()} label="Mastered"/></div>

    <SectionHeader title="Skill coverage" meta="0–100%" description="Mỗi skill dùng FSRS card riêng; recognition không che recall thấp." />
    <section class={`${surface} mt-3 grid gap-2 p-4 sm:grid-cols-2 sm:p-5`}>
      {(["recognition", "recall", "sound", "usage"] as StudyCardType[]).map((type) => <div class="rounded-xl bg-slate-50 p-3"><div class="flex items-center justify-between gap-2 text-xs"><b class="text-slate-700">{skillLabels[type]}</b><span class="font-extrabold tabular-nums text-slate-500">{skillAverage(type)}%</span></div><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-blue-600" style={{ width: `${skillAverage(type)}%` }}/></div></div>)}
    </section>

    <SectionHeader title="Mastery distribution" meta="M0 → M5" />
    <section class={`${surface} mt-3 grid grid-cols-6 gap-1.5 p-3 sm:gap-2 sm:p-5`}>
      {distribution().map((count, index) => <div class="rounded-xl bg-slate-50 p-2 text-center sm:p-3"><div class="text-base font-black tabular-nums text-slate-900 sm:text-xl">{count}</div><div class="mt-1 text-[0.625rem] font-bold text-slate-500 sm:text-[0.6875rem]">M{index}</div></div>)}
    </section>

    <SectionHeader title="Theo giáo trình" meta="mastered / unique" />
    <section class={`${surface} mt-3 divide-y divide-slate-100 px-4 sm:px-5`}>
      {books().map((book) => {
        const bookRows = rows().filter((row) => row.occurrences.some((item) => item.bookId === book.id));
        const done = bookRows.filter((row) => deriveLexemeMastery(row.cardMastery) >= 5).length;
        const pct = bookRows.length ? Math.round(done / bookRows.length * 100) : 0;
        return <div class="py-4"><div class="flex items-center justify-between gap-3 text-xs"><b class="text-slate-700">{book.nameVi}</b><span class="font-bold tabular-nums text-slate-500">{done}/{bookRows.length} · {pct}%</span></div><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }}/></div></div>;
      })}
    </section>

    <div class="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"><StatCard value={todayLogs().length} label="Review hôm nay"/><StatCard value={`${accuracy()}%`} label="Accuracy"/><StatCard value={leeches().length} label="Leech"/><StatCard value={sessions().length} label="Game gần đây"/></div>

    <SectionHeader title="Review history" meta={`${logs().length.toLocaleString("vi-VN")} lượt`} />
    <section class={`${surface} mt-3 p-4 text-xs leading-6 text-slate-500 sm:p-5`}>Review log được lưu append-only. Leech tính cả lượt sai và lượt cần retry/hint, nên phản ánh “khó nhớ” chứ không chỉ sai tuyệt đối.</section>
  </>;
}
