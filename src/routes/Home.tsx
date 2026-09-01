import { A } from "@solidjs/router";
import { createMemo } from "solid-js";
import { StatCard } from "../components/StatCard";
import { PageHero, SectionHeader, Badge, buttonPrimary, buttonSecondary, surface } from "../components/ui";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { getVocabularyRows } from "../db/repositories";
import { deriveLexemeMastery } from "../services/srs/mastery";

export default function Home() {
  const rows = createDexieQuery(getVocabularyRows, []);
  const due = createDexieQuery(() => db.studyCards.where("dueAt").belowOrEqual(Date.now()).count(), 0);
  const reviews = createDexieQuery(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return db.reviewLogs.where("reviewedAt").aboveOrEqual(start.toISOString()).count();
  }, 0);
  const sourceCounts = createDexieQuery(async () => {
    const occurrences = await db.occurrences.toArray();
    const counts = new Map<string, number>();
    for (const item of occurrences) counts.set(item.bookId, (counts.get(item.bookId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const books = createDexieQuery(() => db.books.toArray(), []);
  const mastered = createMemo(() => rows().filter((row) => deriveLexemeMastery(row.cardMastery) >= 5).length);
  const duplicates = createMemo(() => rows().filter((row) => new Set(row.occurrences.map((item) => `${item.bookId}:${item.lessonId}`)).size >= 2));

  return <>
    <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <StatCard value={rows().length.toLocaleString("vi-VN")} label="Từ unique" detail="canonical lexeme" />
      <StatCard value="2.475" label="Lượt xuất hiện" detail="giữ nguyên nguồn" />
      <StatCard value={due()} label="Đến hạn" detail="FSRS hôm nay" />
      <StatCard value={mastered()} label="Mastered" detail="3 core skills" />
    </div>

    <div class="mt-3">
      <PageHero eyebrow="Hôm nay" title="Ôn đúng thứ đang đến hạn." description={<>{due()} card đến hạn · {reviews()} lượt đã review hôm nay. Từ mới được giới hạn theo Daily Settings.</>} actions={<><A class={buttonPrimary} href="/study">Bắt đầu Daily</A><A class={buttonSecondary} href="/games/falling">Falling Recall</A></>} />
    </div>

    <SectionHeader title="4 nguồn" meta="dataset seed" description="Số lượt xuất hiện được giữ nguyên theo từng giáo trình." />
    <div class="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {books().map((book) => <div class={`${surface} p-4`}><b class="text-sm text-slate-900">{book.nameVi}</b><div class="mt-1.5 text-xs text-slate-500">{(sourceCounts().get(book.id) ?? 0).toLocaleString("vi-VN")} lượt từ</div></div>)}
    </div>

    <SectionHeader title="Từ trùng nhiều nơi" meta={`${duplicates().length} từ`} description="Một lexeme nhưng xuất hiện ở nhiều bài hoặc nhiều nguồn." />
    <div class="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {duplicates().slice(0, 6).map((row) => <A href={`/vocab/${row.lexeme.id}`} class={`${surface} flex min-h-24 items-center justify-between gap-3 p-4 text-slate-900 no-underline transition hover:border-blue-200 hover:shadow-md`}>
        <div class="min-w-0"><h3 class="text-xl font-black tracking-[-0.02em]">{row.lexeme.hanzi}</h3><div class="mt-1 truncate text-xs font-bold text-blue-700">{row.readings.map((x) => x.pinyin).join(" / ")}</div><div class="mt-1 truncate text-xs text-slate-500">{row.senses[0]?.meaningVi || row.senses[0]?.hanViet}</div></div>
        <Badge tone="blue">{new Set(row.occurrences.map((item) => `${item.bookId}:${item.lessonId}`)).size} nơi</Badge>
      </A>)}
    </div>
  </>;
}
