import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Grid2X2, Search, Star, Table2, Repeat2, ChevronDown } from "lucide-solid";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { getVocabularyRows } from "../db/repositories";
import { deriveLexemeMastery } from "../services/srs/mastery";
import { normalizeSearch, toneSignature } from "../features/search/normalize";
import { AppSelect, Field, inputClass, SectionHeader, surface } from "../components/ui";

const PAGE_SIZE = 72;
const toggleBase = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-extrabold transition";

export default function Vocabulary() {
  const rows = createDexieQuery(getVocabularyRows, []);
  const books = createDexieQuery(() => db.books.toArray(), []);
  const lessons = createDexieQuery(() => db.lessons.toArray(), []);
  const [query, setQuery] = createSignal("");
  const [bookId, setBookId] = createSignal("");
  const [lessonId, setLessonId] = createSignal("");
  const [mastery, setMastery] = createSignal("");
  const [duplicatesOnly, setDuplicatesOnly] = createSignal(false);
  const [favoritesOnly, setFavoritesOnly] = createSignal(false);
  const [view, setView] = createSignal<"cards" | "table">("cards");
  const [visibleLimit, setVisibleLimit] = createSignal(PAGE_SIZE);
  let sentinel!: HTMLDivElement;
  let observer: IntersectionObserver | undefined;

  const filteredLessons = createMemo(() => lessons().filter((lesson) => !bookId() || lesson.bookId === bookId()));
  const filtered = createMemo(() => {
    const q = normalizeSearch(query());
    const rawQuery = query().trim();
    const toneQuery = /[1-5]/.test(rawQuery) ? toneSignature(rawQuery) : "";
    return rows().filter((row) => {
      if (bookId() && !row.occurrences.some((item) => item.bookId === bookId())) return false;
      if (lessonId() && !row.occurrences.some((item) => item.lessonId === lessonId())) return false;
      if (mastery() !== "" && deriveLexemeMastery(row.cardMastery) !== Number(mastery())) return false;
      if (duplicatesOnly() && new Set(row.occurrences.map((item) => `${item.bookId}:${item.lessonId}`)).size < 2) return false;
      if (favoritesOnly() && !row.favorite) return false;
      if (toneQuery) return row.readings.some((reading) => toneSignature(reading.pinyin) === toneQuery);
      if (q && !normalizeSearch(row.lexeme.searchKey).includes(q)) return false;
      return true;
    });
  });
  const visible = createMemo(() => filtered().slice(0, visibleLimit()));
  const hasMore = createMemo(() => visible().length < filtered().length);

  createEffect(() => {
    query(); bookId(); lessonId(); mastery(); duplicatesOnly(); favoritesOnly(); view();
    setVisibleLimit(PAGE_SIZE);
  });

  onMount(() => {
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || !hasMore()) return;
      setVisibleLimit((value) => Math.min(filtered().length, value + PAGE_SIZE));
    }, { rootMargin: "700px 0px" });
    observer.observe(sentinel);
  });
  onCleanup(() => observer?.disconnect());

  const sourceText = (row: ReturnType<typeof rows>[number]) => {
    const names = row.books.map((book) => book.nameVi);
    return names.slice(0, 2).join(" · ") + (names.length > 2 ? ` · +${names.length - 2}` : "");
  };
  const bookOptions = createMemo(() => [{ value: "", label: "Tất cả" }, ...books().map((book) => ({ value: book.id, label: book.nameVi }))]);
  const lessonOptions = createMemo(() => [{ value: "", label: "Tất cả" }, ...filteredLessons().map((lesson) => ({ value: lesson.id, label: `${lesson.label} ${lesson.index} · ${lesson.title}` }))]);
  const masteryOptions = [{ value: "", label: "Tất cả" }, ...[0,1,2,3,4,5].map((value) => ({ value: String(value), label: `${value} / 5` }))];

  return <>
    <SectionHeader title="Kho từ" meta={`${filtered().length.toLocaleString("vi-VN")} / ${rows().length.toLocaleString("vi-VN")}`} description="Tìm theo Hán tự, pinyin, Hán Việt hoặc nghĩa. Danh sách tải dần khi cuộn để ổn định trên web và iPad." />

    <section class={`${surface} mt-3 p-3 sm:p-4`}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-grid grid-cols-2 rounded-xl bg-slate-100 p-1" aria-label="Kiểu hiển thị">
          <button type="button" class={`${toggleBase} ${view() === "cards" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setView("cards")}><Grid2X2 size={15}/> Thẻ</button>
          <button type="button" class={`${toggleBase} ${view() === "table" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setView("table")}><Table2 size={15}/> Bảng</button>
        </div>
        <div class="text-[0.6875rem] leading-5 text-slate-500">汉字 · pinyin · qixian · qi1xian4 · Hán Việt · nghĩa Việt</div>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1.7fr)_1fr_1fr_0.75fr]">
        <Field label="Tìm"><div class="relative"><Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input class={`${inputClass} pl-10`} type="search" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="汉字 / pinyin / nghĩa / Hán Việt" /></div></Field>
        <AppSelect label="Sách" value={bookId()} options={bookOptions()} onChange={(value) => { setBookId(value); setLessonId(""); }}/>
        <AppSelect label="Bài / Unit" value={lessonId()} options={lessonOptions()} onChange={setLessonId}/>
        <AppSelect label="Mastery" value={mastery()} options={masteryOptions} onChange={setMastery}/>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={duplicatesOnly()} class={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition ${duplicatesOnly() ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`} onClick={() => setDuplicatesOnly((v) => !v)}><Repeat2 size={15}/>Từ trùng</button>
        <button type="button" aria-pressed={favoritesOnly()} class={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition ${favoritesOnly() ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`} onClick={() => setFavoritesOnly((v) => !v)}><Star size={15} fill={favoritesOnly() ? "currentColor" : "none"}/>Đánh dấu</button>
      </div>
    </section>

    <Show when={view() === "cards"}>
      <section class="mt-3 grid gap-2 lg:grid-cols-2">
        <For each={visible()}>{(row) => {
          const score = () => deriveLexemeMastery(row.cardMastery);
          return <A href={`/vocab/${row.lexeme.id}`} class={`${surface} flex min-w-0 items-center justify-between gap-3 px-3.5 py-3 text-slate-900 no-underline transition hover:-translate-y-px hover:border-blue-200 hover:shadow-md`}>
            <div class="min-w-0"><div class="text-xl font-black tracking-[-0.02em] sm:text-[1.45rem]">{row.lexeme.hanzi}</div><div class="mt-0.5 truncate text-xs font-bold text-blue-700">{row.readings.map((x) => x.pinyin).join(" / ")}</div><div class="mt-1 truncate text-xs text-slate-500">{row.senses[0]?.meaningVi || row.senses[0]?.hanViet || "—"} · {sourceText(row)}</div></div>
            <div class={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-black ${score() >= 4 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{score()}</div>
          </A>;
        }}</For>
      </section>
    </Show>

    <Show when={view() === "table"}>
      <section class={`${surface} mt-3 overflow-x-auto`}>
        <table class="w-full min-w-[64rem] border-separate border-spacing-0 text-left text-xs text-slate-600">
          <thead class="sticky top-0 z-10 bg-slate-50 text-[0.6875rem] font-extrabold uppercase tracking-[0.06em] text-slate-500"><tr><th class="px-3 py-2.5">Hán</th><th class="px-3 py-2.5">Pinyin</th><th class="px-3 py-2.5">Nghĩa / Hán Việt</th><th class="px-3 py-2.5">Từ loại</th><th class="px-3 py-2.5">Nguồn</th><th class="px-3 py-2.5 text-center">M</th></tr></thead>
          <tbody><For each={visible()}>{(row) => { const score = deriveLexemeMastery(row.cardMastery); return <tr class="border-t border-slate-100 transition hover:bg-slate-50"><td class="border-t border-slate-100 px-3 py-2.5"><A href={`/vocab/${row.lexeme.id}`} class="text-lg font-black text-slate-900 no-underline hover:text-blue-700">{row.lexeme.hanzi}</A></td><td class="border-t border-slate-100 px-3 py-2.5 font-bold text-blue-700">{row.readings.map((x) => x.pinyin).join(" / ")}</td><td class="border-t border-slate-100 px-3 py-2.5">{row.senses[0]?.meaningVi || row.senses[0]?.hanViet || "—"}</td><td class="border-t border-slate-100 px-3 py-2.5">{row.senses.map((s) => s.pos).filter(Boolean).slice(0,2).join(" · ") || "—"}</td><td class="border-t border-slate-100 px-3 py-2.5">{sourceText(row)}</td><td class="border-t border-slate-100 px-3 py-2.5 text-center"><span class={`inline-grid size-8 place-items-center rounded-full font-black ${score>=4?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{score}</span></td></tr>; }}</For></tbody>
        </table>
      </section>
    </Show>

    <div ref={sentinel} class="grid min-h-20 place-items-center py-5 text-center text-xs font-bold text-slate-500">
      <Show when={hasMore()} fallback={<span>Đã tải đủ {filtered().length.toLocaleString("vi-VN")} từ.</span>}><span class="inline-flex items-center gap-2"><ChevronDown size={15}/>Đang tải tiếp {visible().length.toLocaleString("vi-VN")} / {filtered().length.toLocaleString("vi-VN")}</span></Show>
    </div>
  </>;
}
