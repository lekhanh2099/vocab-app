import { BookOpen, Clock, ListChecks, Shuffle, Star, Zap } from "lucide-solid";
import { For, Show, createEffect, createMemo, type Accessor } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import type { Book, Lesson } from "../domain/models";
import { gamePoolAffectsFsrs, poolLearningNote, type GamePoolSelection, type StudyPoolKind } from "../games/shared/poolSelection";

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

const baseScopeOptions = [
  { kind: "daily" as const, title: "Ôn đến hạn", note: "Card đúng kỹ năng đang due", icon: Clock },
  { kind: "weak" as const, title: "Từ yếu", note: "Sai nhiều hoặc cần củng cố", icon: Zap },
  { kind: "favorites" as const, title: "Đánh dấu", note: "Các từ ★ đã học", icon: Star },
  { kind: "random" as const, title: "Random đã học", note: "Xáo trộn từ đã được giới thiệu", icon: Shuffle },
  { kind: "course" as const, title: "Theo giáo trình", note: "Chọn quyển → một hoặc nhiều bài → kiểu ôn", icon: BookOpen }
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

  const scopeOptions = createMemo(() => props.value().lexemeIds?.length
    ? [...baseScopeOptions, { kind: "manual" as const, title: "Bộ đang chọn", note: `${props.value().lexemeIds?.length ?? 0} từ từ Kho từ / bộ đã lưu`, icon: ListChecks }]
    : baseScopeOptions
  );
  const selectedBook = createMemo(() => meta().books.find((book) => book.id === props.value().bookId));
  const lessons = createMemo(() => meta().lessons.filter((lesson) => lesson.bookId === props.value().bookId));
  const selectedLessonIds = createMemo(() => new Set(props.value().lessonIds ?? (props.value().lessonId ? [props.value().lessonId!] : [])));

  createEffect(() => {
    if (props.value().kind !== "course" || props.value().bookId || !meta().books.length) return;
    props.onChange({ ...props.value(), kind: "course", bookId: meta().books[0]!.id, lessonId: undefined, lessonIds: undefined, courseMode: props.value().courseMode ?? "smart" });
  });

  createEffect(() => {
    const selection = props.value();
    if (selection.kind !== "course" || !selection.bookId || !meta().books.length) return;
    const valid = new Set(lessons().map((lesson) => lesson.id));
    const nextLessonIds = (selection.lessonIds ?? (selection.lessonId ? [selection.lessonId] : [])).filter((id) => valid.has(id));
    const prev = selection.lessonIds ?? (selection.lessonId ? [selection.lessonId] : []);
    if (nextLessonIds.length !== prev.length) props.onChange({ ...selection, lessonId: nextLessonIds.length === 1 ? nextLessonIds[0] : undefined, lessonIds: nextLessonIds.length ? nextLessonIds : undefined });
  });

  const selectScope = (kind: StudyPoolKind) => {
    if (kind === "manual") {
      if (props.value().lexemeIds?.length) props.onChange({ ...props.value(), kind: "manual", courseMode: "all" });
      return;
    }
    if (kind !== "course") { props.onChange({ kind }); return; }
    const bookId = props.value().bookId ?? meta().books[0]?.id;
    props.onChange({ kind: "course", bookId, lessonId: props.value().lessonId, lessonIds: props.value().lessonIds, courseMode: props.value().courseMode ?? "smart" });
  };

  const toggleLesson = (lessonId: string) => {
    const ids = new Set(selectedLessonIds());
    if (ids.has(lessonId)) ids.delete(lessonId); else ids.add(lessonId);
    const lessonIds = lessons().filter((lesson) => ids.has(lesson.id)).map((lesson) => lesson.id);
    props.onChange({ ...props.value(), kind: "course", lessonId: lessonIds.length === 1 ? lessonIds[0] : undefined, lessonIds: lessonIds.length ? lessonIds : undefined, courseMode: "all" });
  };
  const selectAllLessons = () => {
    const lessonIds = lessons().map((lesson) => lesson.id);
    props.onChange({ ...props.value(), kind: "course", lessonId: undefined, lessonIds, courseMode: props.value().courseMode ?? "all" });
  };
  const clearLessons = () => props.onChange({ ...props.value(), kind: "course", lessonId: undefined, lessonIds: undefined });

  const activeScope = createMemo(() => scopeOptions().find((item) => item.kind === props.value().kind) ?? scopeOptions()[0]!);

  return <section class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Bộ từ</div>
        <p class="mt-1 text-sm leading-5 text-slate-500">Một phạm vi dùng chung cho Ôn và Game; đổi game không phải chọn lại.</p>
      </div>
      <span class={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "SRS" : "Practice"}</span>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <For each={scopeOptions()}>{(item) => {
        const Icon = item.icon;
        const selected = () => props.value().kind === item.kind;
        return <button
          type="button"
          aria-pressed={selected()}
          title={item.note}
          class={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-extrabold transition-colors ${selected() ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
          onClick={() => selectScope(item.kind)}
        >
          <Icon size={17} strokeWidth={2.25}/><span>{item.title}</span>
        </button>;
      }}</For>
    </div>

    <div class="mt-3 flex items-center gap-2.5 text-sm leading-5 text-slate-500">
      <span class={`grid size-7 shrink-0 place-items-center rounded-lg ${tone().badge}`}><Dynamic component={activeScope().icon} size={14}/></span>
      <span><b class="text-slate-700">{activeScope().title}:</b> {activeScope().note}</span>
    </div>

    <Show when={props.value().kind === "course"}>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div class="text-xs font-black uppercase tracking-wider text-slate-500">Quyển</div>
        <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
          <For each={meta().books}>{(book) => <button type="button" class={`min-h-10 shrink-0 rounded-full border px-3.5 text-xs font-extrabold transition-colors ${props.value().bookId === book.id ? tone().active : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`} onClick={() => props.onChange({ kind: "course", bookId: book.id, lessonId: undefined, lessonIds: undefined, courseMode: props.value().courseMode ?? "smart" })}>{book.nameVi}</button>}</For>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div><div class="text-xs font-black uppercase tracking-wider text-slate-500">{selectedBook()?.lessonLabel ?? "Bài"}</div><div class="mt-1 text-sm leading-5 text-slate-500">Chọn 1, 2 hoặc nhiều bài. Không chọn = cả quyển.</div></div>
          <div class="flex gap-2"><button type="button" class="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600" onClick={selectAllLessons}>Tất cả</button><button type="button" class="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600" onClick={clearLessons}>Bỏ chọn</button></div>
        </div>

        <div class="mt-3 grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <For each={lessons()}>{(lesson) => {
            const selected = () => selectedLessonIds().has(lesson.id);
            return <button type="button" aria-pressed={selected()} class={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${selected() ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`} onClick={() => toggleLesson(lesson.id)}><span class="block font-black">{lesson.label} {lesson.index}</span><span class="mt-1 block truncate text-xs leading-4 opacity-75">{meta().lessonCounts[lesson.id] ?? 0} từ · {lesson.title}</span></button>;
          }}</For>
        </div>

        <div class="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" class={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-extrabold ${props.value().courseMode !== "learned" && props.value().courseMode !== "all" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "smart" })}>Đến hạn <span class="ml-1 text-emerald-700">SRS</span></button>
          <button type="button" class={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-extrabold ${props.value().courseMode === "learned" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "learned" })}>Random đã học</button>
          <button type="button" class={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-extrabold ${props.value().courseMode === "all" ? `${tone().active} ring-2` : "border-slate-200 bg-white text-slate-700"}`} onClick={() => props.onChange({ ...props.value(), courseMode: "all" })}>Luyện toàn phạm vi</button>
        </div>
      </div>
    </Show>

    <p class="mt-3 text-sm leading-5 text-slate-500"><b class="text-slate-700">{!props.practiceOnly && gamePoolAffectsFsrs(props.value()) ? "Theo lịch ôn:" : "Luyện tự do:"}</b> {props.practiceOnly ? "Game này chỉ dùng để luyện/đánh giá và không thay đổi lịch FSRS." : poolLearningNote(props.value())}</p>
  </section>;
}
