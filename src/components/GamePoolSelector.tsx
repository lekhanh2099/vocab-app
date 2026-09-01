import { BookOpen, Clock, Shuffle, Star, Zap } from "lucide-solid";
import { For, Show, createEffect, createMemo, type Accessor } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import type { Book, Lesson } from "../domain/models";
import { gamePoolAffectsFsrs, poolLearningNote, type GamePoolSelection } from "../games/shared/poolSelection";
import { AppSelect } from "./ui";

interface PoolMeta { books: Book[]; lessons: Lesson[]; lessonCounts: Record<string, number>; }

interface Props {
  value: Accessor<GamePoolSelection>;
  onChange: (next: GamePoolSelection) => void;
  accent?: "blue" | "emerald" | "amber";
  practiceOnly?: boolean;
}

const tones = {
  blue: { active: "border-blue-300 bg-blue-50 text-blue-800 ring-blue-100", badge: "bg-blue-100 text-blue-800" },
  emerald: { active: "border-emerald-300 bg-emerald-50 text-emerald-800 ring-emerald-100", badge: "bg-emerald-100 text-emerald-800" },
  amber: { active: "border-amber-300 bg-amber-50 text-amber-900 ring-amber-100", badge: "bg-amber-100 text-amber-900" }
} as const;

const scopeOptions = [
  { kind: "daily" as const, title: "Ôn đến hạn", note: "Card đúng kỹ năng đang due", icon: Clock },
  { kind: "weak" as const, title: "Từ yếu", note: "Sai nhiều hoặc cần củng cố", icon: Zap },
  { kind: "favorites" as const, title: "Đánh dấu", note: "Các từ ★ đã học", icon: Star },
  { kind: "random" as const, title: "Random đã học", note: "Xáo trộn từ đã được giới thiệu", icon: Shuffle },
  { kind: "course" as const, title: "Theo giáo trình", note: "Chọn quyển → bài / unit → kiểu ôn", icon: BookOpen }
];

export function GamePoolSelector(props: Props) {
  const tone = () => tones[props.accent ?? "blue"];
  const meta = createDexieQuery<PoolMeta>(async () => {
    const [books, lessons, occurrences] = await Promise.all([db.books.toArray(), db.lessons.toArray(), db.occurrences.toArray()]);
    const lessonLexemes = new Map<string, Set<string>>();
    for (const item of occurrences) {
      const set = lessonLexemes.get(item.lessonId) ?? new Set<string>();
      set.add(item.lexemeId);
      lessonLexemes.set(item.lessonId, set);
    }
    return {
      books,
      lessons: lessons.sort((a, b) => a.bookId.localeCompare(b.bookId) || a.index - b.index),
      lessonCounts: Object.fromEntries([...lessonLexemes].map(([lessonId, ids]) => [lessonId, ids.size]))
    };
  }, { books: [], lessons: [], lessonCounts: {} });

  const selectedBook = createMemo(() => meta().books.find((book) => book.id === props.value().bookId));
  const lessons = createMemo(() => meta().lessons.filter((lesson) => lesson.bookId === props.value().bookId));

  createEffect(() => {
    if (props.value().kind !== "course" || props.value().bookId || !meta().books.length) return;
    props.onChange({ ...props.value(), kind: "course", bookId: meta().books[0]!.id, lessonId: undefined, courseMode: props.value().courseMode ?? "smart" });
  });

  createEffect(() => {
    const selection = props.value();
    if (selection.kind !== "course" || !selection.bookId || !selection.lessonId || !meta().books.length) return;
    if (!lessons().some((lesson) => lesson.id === selection.lessonId)) props.onChange({ ...selection, lessonId: undefined });
  });

  const selectScope = (kind: GamePoolSelection["kind"]) => {
    if (kind !== "course") { props.onChange({ ...props.value(), kind }); return; }
    const bookId = props.value().bookId ?? meta().books[0]?.id;
    props.onChange({ kind: "course", bookId, lessonId: props.value().lessonId, courseMode: props.value().courseMode ?? "smart" });
  };

  const lessonOptions = createMemo(() => [
    { value: "", label: `Tất cả ${selectedBook()?.lessonLabel?.toLowerCase() ?? "bài"}` },
    ...lessons().map((lesson) => ({
      value: lesson.id,
      label: `${lesson.label} ${lesson.index} · ${lesson.title}`,
      description: `${meta().lessonCounts[lesson.id] ?? 0} từ`
    }))
  ]);

  const activeScope = createMemo(() => scopeOptions.find((item) => item.kind === props.value().kind) ?? scopeOptions[0]!);

  return <section class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-slate-500">Bộ từ</div>
        <p class="mt-0.5 text-[0.6875rem] leading-4 text-slate-500">Chọn nhóm từ muốn luyện; phạm vi được giữ khi đổi game.</p>
      </div>
      <span class={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-black ${!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "SRS" : "Practice"}</span>
    </div>

    <div class="mt-2.5 flex flex-wrap gap-1.5">
      <For each={scopeOptions}>{(item) => {
        const Icon = item.icon;
        const selected = () => props.value().kind === item.kind;
        return <button
          type="button"
          aria-pressed={selected()}
          title={item.note}
          class={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-extrabold transition ${selected() ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
          onClick={() => selectScope(item.kind)}
        >
          <Icon size={15} strokeWidth={2.25}/><span>{item.title}</span>
        </button>;
      }}</For>
    </div>

    <div class="mt-2 flex items-center gap-2 text-[0.6875rem] leading-4 text-slate-500">
      <span class={`grid size-6 shrink-0 place-items-center rounded-lg ${tone().badge}`}><Dynamic component={activeScope().icon} size={13}/></span>
      <span><b class="text-slate-700">{activeScope().title}:</b> {activeScope().note}</span>
    </div>

    <Show when={props.value().kind === "course"}>
      <div class="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div class="text-[0.6875rem] font-black uppercase tracking-wider text-slate-500">Quyển</div>
        <div class="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          <For each={meta().books}>{(book) => <button type="button" class={`min-h-9 shrink-0 rounded-full border px-3 text-[0.6875rem] font-extrabold transition ${props.value().bookId === book.id ? tone().active : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`} onClick={() => props.onChange({ ...props.value(), kind: "course", bookId: book.id, lessonId: undefined })}>{book.nameVi}</button>}</For>
        </div>
        <div class="mt-2"><AppSelect label="Bài / Unit" value={props.value().lessonId ?? ""} options={lessonOptions()} onChange={(lessonId) => { const nextLessonId = lessonId || undefined; if (nextLessonId === props.value().lessonId) return; props.onChange({ ...props.value(), lessonId: nextLessonId }); }}/></div>

        <div class="mt-2 grid gap-1.5 sm:grid-cols-3">
          <button type="button" class={`rounded-lg border px-2.5 py-2 text-left text-[0.6875rem] font-extrabold ${props.value().courseMode !== "learned" && props.value().courseMode !== "all" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "smart" })}>Đến hạn <span class="ml-1 text-emerald-700">SRS</span></button>
          <button type="button" class={`rounded-lg border px-2.5 py-2 text-left text-[0.6875rem] font-extrabold ${props.value().courseMode === "learned" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "learned" })}>Random đã học</button>
          <button type="button" class={`rounded-lg border px-2.5 py-2 text-left text-[0.6875rem] font-extrabold ${props.value().courseMode === "all" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "all" })}>Khám phá toàn bài</button>
        </div>
      </div>
    </Show>

    <p class="mt-2 text-[0.6875rem] leading-4 text-slate-500"><b class="text-slate-700">{!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "Theo lịch ôn:" : "Luyện tự do:"}</b> {props.practiceOnly ? "Game này chỉ dùng để luyện/đánh giá và không thay đổi lịch FSRS." : poolLearningNote(props.value())}</p>
  </section>;
}
