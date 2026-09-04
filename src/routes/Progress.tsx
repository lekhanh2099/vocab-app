import { A } from "@solidjs/router";
import { createMemo } from "solid-js";
import { StatCard } from "../components/StatCard";
import { SectionHeader, surface } from "../components/ui";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { getVocabularyRows } from "../db/repositories";
import { deriveLexemeMastery } from "../services/srs/mastery";
import type { Occurrence, StudyCardType, VocabularyRow } from "../domain/models";

const skillLabels: Record<StudyCardType, string> = { recognition: "Nhận mặt", recall: "Nhớ ngược", sound: "Âm / pinyin", usage: "Cách dùng" };
const coreSkills: StudyCardType[] = ["recognition", "recall", "sound"];

export default function Progress() {
  const rows = createDexieQuery(getVocabularyRows, []);
  const logs = createDexieQuery(() => db.reviewLogs.toArray(), []);
  const books = createDexieQuery(() => db.books.toArray(), []);
  const lessons = createDexieQuery(() => db.lessons.toArray(), []);
  const occurrences = createDexieQuery(() => db.occurrences.toArray(), []);
  const cards = createDexieQuery(() => db.studyCards.toArray(), []);
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

  const lessonMetrics = createMemo(() => {
    const now = Date.now();
    const dueBySense = new Map<string, number>();
    for (const card of cards()) if (card.dueAt <= now) dueBySense.set(card.senseId, (dueBySense.get(card.senseId) ?? 0) + 1);
    const occurrenceByLesson = new Map<string, Occurrence[]>();
    for (const occurrence of occurrences()) {
      const list = occurrenceByLesson.get(occurrence.lessonId) ?? [];
      list.push(occurrence);
      occurrenceByLesson.set(occurrence.lessonId, list);
    }
    const rowByLexeme = new Map(rows().map((row) => [row.lexeme.id, row]));
    return lessons().map((lesson) => {
      const lessonOccurrences = occurrenceByLesson.get(lesson.id) ?? [];
      const uniqueRows = [...new Set(lessonOccurrences.map((item) => item.lexemeId))].map((id) => rowByLexeme.get(id)).filter((row): row is VocabularyRow => Boolean(row));
      const senseIds = new Set(lessonOccurrences.map((item) => item.senseId));
      const overdue = [...senseIds].reduce((sum, senseId) => sum + (dueBySense.get(senseId) ?? 0), 0);
      const skills = Object.fromEntries(coreSkills.map((type) => {
        const values = uniqueRows.map((row) => row.cardMastery[type] ?? 0);
        return [type, values.length ? Math.round(values.reduce((a,b) => a+b, 0) / values.length * 20) : 0];
      })) as Record<StudyCardType, number>;
      const core = Math.round(coreSkills.reduce((sum, type) => sum + skills[type], 0) / coreSkills.length);
      const masteredCount = uniqueRows.filter((row) => deriveLexemeMastery(row.cardMastery) >= 5).length;
      return { lesson, uniqueCount: uniqueRows.length, overdue, skills, core, masteredCount };
    }).filter((item) => item.uniqueCount > 0);
  });

  const needsAttention = createMemo(() => [...lessonMetrics()].sort((a,b) => b.overdue - a.overdue || a.core - b.core || a.lesson.index - b.lesson.index).slice(0, 12));

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

    <SectionHeader title="Bài cần chú ý" meta="actionable" description="Ưu tiên bài có card quá hạn, sau đó tới bài có core mastery thấp. Bấm Ôn để đi thẳng vào đúng bài." />
    <section class="mt-3 grid gap-2 lg:grid-cols-2">
      {needsAttention().map((item) => {
        const book = books().find((entry) => entry.id === item.lesson.bookId);
        return <div class={`${surface} p-4`}>
          <div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-[0.6875rem] font-black uppercase tracking-wider text-blue-700">{book?.nameVi ?? item.lesson.bookId}</div><h3 class="mt-1 truncate text-sm font-black text-slate-900">{item.lesson.label} {item.lesson.index} · {item.lesson.title}</h3><div class="mt-1 text-[0.6875rem] text-slate-500">{item.masteredCount}/{item.uniqueCount} mastered · {item.overdue} card quá hạn</div></div><div class="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-700">{item.core}%</div></div>
          <div class="mt-3 grid grid-cols-3 gap-2">{coreSkills.map((type) => <div><div class="flex justify-between gap-2 text-[0.625rem] font-bold text-slate-500"><span>{type === "recognition" ? "Nhận" : type === "recall" ? "Nhớ" : "Âm"}</span><span>{item.skills[type]}%</span></div><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-blue-600" style={{width:`${item.skills[type]}%`}}/></div></div>)}</div>
          <div class="mt-3 flex gap-2"><A href={`/study?book=${encodeURIComponent(item.lesson.bookId)}&lessons=${encodeURIComponent(item.lesson.id)}&mode=smart&limit=20`} class="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white no-underline">Ôn đến hạn</A><A href={`/study?book=${encodeURIComponent(item.lesson.bookId)}&lessons=${encodeURIComponent(item.lesson.id)}&mode=all&limit=20`} class="inline-flex min-h-10 items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700 no-underline">Luyện toàn bài</A></div>
        </div>;
      })}
    </section>

    <div class="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3"><StatCard value={todayLogs().length} label="Review hôm nay"/><StatCard value={`${accuracy()}%`} label="Accuracy"/><StatCard value={leeches().length} label="Leech"/><StatCard value={sessions().length} label="Game gần đây"/></div>

    <SectionHeader title="Review history" meta={`${logs().length.toLocaleString("vi-VN")} lượt`} />
    <section class={`${surface} mt-3 p-4 text-xs leading-6 text-slate-500 sm:p-5`}>Review log chỉ dành cho scheduled FSRS. Extra practice có thể đánh dấu <b>needs-review</b> nhưng không được ghi một lần review giả để đẩy dueAt.</section>
  </>;
}
