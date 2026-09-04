import { A } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { StatCard } from "../components/StatCard";
import { PageHero, SectionHeader, Badge, buttonPrimary, buttonSecondary, surface } from "../components/ui";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { getVocabularyRows } from "../db/repositories";
import { deriveLexemeMastery } from "../services/srs/mastery";
import { loadActiveCourseScope, poolShortLabel } from "../features/study/pool";

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
  const activeScope = loadActiveCourseScope();

  return <>
    <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <StatCard value={rows().length.toLocaleString("vi-VN")} label="Từ unique" detail="canonical lexeme" />
      <StatCard value="2.475" label="Lượt xuất hiện" detail="giữ nguyên nguồn" />
      <StatCard value={due()} label="Đến hạn" detail="FSRS hôm nay" />
      <StatCard value={mastered()} label="Mastered" detail="3 core skills" />
    </div>

    <div class="mt-3">
      <PageHero eyebrow="Hôm nay" title="Ôn đúng thứ đang đến hạn." description={<>{due()} card đến hạn · {reviews()} lượt đã review hôm nay. Extra practice không được phép đẩy lịch FSRS.</>} actions={<><A class={buttonPrimary} href="/study">Bắt đầu Daily</A><A class={buttonSecondary} href="/games/falling">Falling Recall</A></>} />
    </div>

    <SectionHeader title="Ôn nhanh" meta="1 tap trên điện thoại" description="Session ngắn dùng cùng phạm vi Ôn/Game đã lưu; không cần setup lại mỗi lần." />
    <section class={`${surface} mt-3 p-3 sm:p-4`}>
      <div class="grid grid-cols-3 gap-2 sm:max-w-md">
        {[5,10,20].map((count) => <A href={`/study?limit=${count}`} class="grid min-h-14 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-sm font-black text-blue-800 no-underline transition active:scale-[0.99]">{count} từ</A>)}
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Show when={activeScope} fallback={<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-400"><b class="text-slate-600">Bài đang học</b><br/>Chọn một phạm vi ở màn Ôn trước.</div>}>
          <A href="/study?preset=active&limit=10" class="rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-blue-200"><b class="text-sm">Bài đang học</b><div class="mt-1 text-xs text-slate-500">{poolShortLabel(activeScope!)}</div></A>
        </Show>
        <Show when={activeScope}><A href="/study?preset=recent2&limit=20" class="rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-blue-200"><b class="text-sm">2 bài gần nhất</b><div class="mt-1 text-xs text-slate-500">Lấy từ phạm vi đang học</div></A></Show>
        <A href="/study?preset=weak&limit=10" class="rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-blue-200"><b class="text-sm">Từ yếu 10</b><div class="mt-1 text-xs text-slate-500">Extra practice · không dịch FSRS</div></A>
        <A href="/study?preset=favorites&limit=20" class="rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-blue-200"><b class="text-sm">★ Đánh dấu</b><div class="mt-1 text-xs text-slate-500">Ôn lại bộ đã lưu nhanh</div></A>
      </div>
    </section>

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
