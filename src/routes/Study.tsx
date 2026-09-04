import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { GamePoolSelector } from "../components/GamePoolSelector";
import { buildStudySession, recordStudyPractice, type StudySessionEntry } from "../features/review/sessionBuilder";
import {
  createStudyPoolSelection,
  deleteStudySet,
  gamePoolAffectsFsrs,
  loadActiveCourseScope,
  loadSavedStudySets,
  loadStudySessionSize,
  poolShortLabel,
  saveStudySet,
  saveStudySessionSize,
  type StudySessionSize
} from "../features/study/pool";
import { db } from "../db/database";
import type { ContextItem, StudyCardType } from "../domain/models";
import { ensureCoreStudyCards, reviewStudyCard, type ReviewRating } from "../services/srs/scheduler";
import { speakChineseApp } from "../features/audio/appSpeech";
import { isTtsSafeLexeme } from "../features/audio/ttsSafety";
import { Badge, buttonGhost, buttonPrimary, buttonSecondary, EmptyState, SectionHeader, surface } from "../components/ui";

interface CardView {
  entry: StudySessionEntry;
  hanzi: string;
  pinyin: string;
  meaning: string;
  hanViet: string;
  context?: ContextItem;
  ttsSafe: boolean;
}

async function hydrate(entry: StudySessionEntry): Promise<CardView> {
  const sense = await db.senses.get(entry.senseId);
  if (!sense) throw new Error("Card sense missing");
  const [lexeme, reading, contexts, ttsSafe] = await Promise.all([
    db.lexemes.get(entry.lexemeId),
    db.readings.get(sense.readingId),
    entry.type === "usage"
      ? db.contexts.where("lexemeId").equals(entry.lexemeId).filter((item) => item.verified === true && (item.senseId === entry.senseId || !item.senseId)).toArray()
      : Promise.resolve([]),
    isTtsSafeLexeme(entry.lexemeId)
  ]);
  if (!lexeme) throw new Error("Card lexeme missing");
  return { entry, hanzi: lexeme.hanzi, pinyin: reading?.pinyin ?? "", meaning: sense.meaningVi, hanViet: sense.hanViet, context: contexts[0], ttsSafe };
}

const ratings: { key: string; rating: ReviewRating; label: string; hint: string; cls: string }[] = [
  { key: "1", rating: "again", label: "Again", hint: "quên", cls: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" },
  { key: "2", rating: "hard", label: "Hard", hint: "khó", cls: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
  { key: "3", rating: "good", label: "Good", hint: "nhớ", cls: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
  { key: "4", rating: "easy", label: "Easy", hint: "rất chắc", cls: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100" }
];

const skillOptions: { type: StudyCardType; label: string }[] = [
  { type: "recognition", label: "Nhận mặt" },
  { type: "recall", label: "Nhớ ngược" },
  { type: "sound", label: "Âm / pinyin" },
  { type: "usage", label: "Cách dùng" }
];

const modeLinks = [
  ["⚡", "Quick", "4 lựa chọn · ôn nhanh trên điện thoại", "/games/quiz/meaning"],
  ["↩", "Recall", "Nghĩa → Hán", "/games/quiz/reverse"],
  ["⌨", "Type", "Hán / Audio → tự gõ pinyin", "/games/falling"],
  ["🎧", "Listen", "Audio → nhận chữ Hán", "/games/quiz/audio"]
] as const;

export default function Study() {
  const [searchParams] = useSearchParams();
  const [poolSelection, setPoolSelection] = createStudyPoolSelection();
  const [sessionSize, setSessionSize] = createSignal<StudySessionSize>(loadStudySessionSize());
  const [savedSets, setSavedSets] = createSignal(loadSavedStudySets());
  const [entries, setEntries] = createSignal<StudySessionEntry[]>([]);
  const [index, setIndex] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  let loadToken = 0;
  const currentEntry = () => entries()[index()];
  const [view] = createResource(currentEntry, hydrate);

  const loadSession = async () => {
    const token = ++loadToken;
    setLoading(true);
    try {
      const next = await buildStudySession(poolSelection(), sessionSize());
      if (token !== loadToken) return;
      setEntries(next); setIndex(0); setRevealed(false);
    } finally { if (token === loadToken) setLoading(false); }
  };

  const applyPreset = async () => {
    const limit = Number(searchParams.limit);
    if (limit === 5 || limit === 10 || limit === 20) setSessionSize(saveStudySessionSize(limit));
    else if (searchParams.limit === "all") setSessionSize(saveStudySessionSize(0));

    const lexemeId = typeof searchParams.lexeme === "string" ? searchParams.lexeme : "";
    if (lexemeId) {
      const lexeme = await db.lexemes.get(lexemeId);
      setPoolSelection({ kind: "manual", lexemeIds: [lexemeId], courseMode: "all", label: lexeme ? `Ôn ${lexeme.hanzi}` : "Ôn từ này" });
      return;
    }
    const preset = typeof searchParams.preset === "string" ? searchParams.preset : "";
    if (preset === "weak") { setPoolSelection({ kind: "weak" }); return; }
    if (preset === "favorites") { setPoolSelection({ kind: "favorites" }); return; }
    if (preset === "active") {
      const active = loadActiveCourseScope(); if (active) setPoolSelection(active); return;
    }
    if (preset === "recent2") {
      const active = loadActiveCourseScope();
      if (!active?.bookId) return;
      const lessons = (await db.lessons.where("bookId").equals(active.bookId).sortBy("index"));
      if (!lessons.length) return;
      const selected = new Set(active.lessonIds ?? (active.lessonId ? [active.lessonId] : []));
      const pivot = [...lessons].reverse().find((lesson) => selected.has(lesson.id)) ?? lessons[lessons.length - 1]!;
      const pair = lessons.filter((lesson) => lesson.index <= pivot.index).slice(-2).map((lesson) => lesson.id);
      setPoolSelection({ kind: "course", bookId: active.bookId, lessonIds: pair, lessonId: pair.length === 1 ? pair[0] : undefined, courseMode: "all" });
      return;
    }
    const bookId = typeof searchParams.book === "string" ? searchParams.book : "";
    if (bookId) {
      const lessonIds = typeof searchParams.lessons === "string" ? searchParams.lessons.split(",").filter(Boolean) : [];
      setPoolSelection({ kind: "course", bookId, lessonIds: lessonIds.length ? lessonIds : undefined, lessonId: lessonIds.length === 1 ? lessonIds[0] : undefined, courseMode: searchParams.mode === "all" ? "all" : searchParams.mode === "learned" ? "learned" : "smart" });
    }
  };

  const prompt = () => {
    const item = view(); if (!item) return "";
    if (item.entry.type === "recognition") return item.hanzi;
    if (item.entry.type === "recall") return item.meaning || item.hanViet;
    if (item.entry.type === "sound") return item.ttsSafe ? "🔊" : item.pinyin;
    if (item.entry.type === "usage" && item.context) return item.context.sentenceZh.replace(item.hanzi, "____");
    return item.meaning || item.hanViet;
  };

  const rate = async (rating: ReviewRating) => {
    const item = view();
    if (!item || committing()) return;
    setCommitting(true);
    try {
      if (item.entry.scheduled && item.entry.card) {
        await reviewStudyCard(item.entry.card.id, rating, { correct: rating !== "again", gameMode: "flashcard" });
        if (item.entry.type === "recognition" && rating !== "again") {
          const sense = await db.senses.get(item.entry.senseId);
          if (sense) await ensureCoreStudyCards(sense);
        }
      } else {
        await recordStudyPractice(item.entry, rating);
      }
      setRevealed(false);
      setIndex((i) => i + 1);
    } finally { setCommitting(false); }
  };

  const speak = () => { const item = view(); if (item?.ttsSafe) void speakChineseApp(item.hanzi); };
  const setSize = (value: StudySessionSize) => setSessionSize(saveStudySessionSize(value));
  const saveCurrentSet = () => {
    const name = window.prompt("Tên bộ ôn", poolShortLabel(poolSelection()));
    if (!name?.trim()) return;
    setSavedSets(saveStudySet(name, poolSelection()));
  };
  const toggleSkill = (type: StudyCardType) => {
    const current = new Set<StudyCardType>(poolSelection().skills?.length ? poolSelection().skills : (["recognition", "recall", "sound"] as StudyCardType[]));
    if (current.has(type)) current.delete(type); else current.add(type);
    setPoolSelection({ ...poolSelection(), skills: current.size ? [...current] : undefined });
  };

  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey || committing() || loading()) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (event.code === "Space") { event.preventDefault(); if (!revealed()) setRevealed(true); return; }
    if ((event.key === "r" || event.key === "R") && view()?.entry.type === "sound" && view()?.ttsSafe) { event.preventDefault(); speak(); return; }
    if (revealed() && /^[1-4]$/.test(event.key)) { event.preventDefault(); const item = ratings[Number(event.key) - 1]; if (item) void rate(item.rating); }
  };

  onMount(() => {
    window.addEventListener("keydown", keydown);
    void (async () => { await applyPreset(); setReady(true); })();
  });
  onCleanup(() => { loadToken += 1; window.removeEventListener("keydown", keydown); });

  createEffect(() => {
    if (!ready()) return;
    JSON.stringify(poolSelection()); sessionSize();
    void loadSession();
  });

  const progress = () => entries().length ? Math.min(100, (index() / entries().length) * 100) : 0;
  const scheduledSession = () => gamePoolAffectsFsrs(poolSelection());

  return <>
    <SectionHeader title="Ôn" meta={`${Math.min(index(), entries().length)} / ${entries().length}`} description="Chọn phạm vi trước, rồi chọn kiểu truy xuất. Scheduled review và extra practice được tách tuyệt đối." />

    <div class="mt-3"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} /></div>
    <div class="mt-2 flex justify-end"><button type="button" class={buttonGhost} onClick={saveCurrentSet}>Lưu phạm vi này</button></div>

    <section class={`${surface} mt-3 p-3 sm:p-4`}>
      <div class="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
        <div>
          <div class="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-slate-500">Số lượng</div>
          <div class="mt-2 flex flex-wrap gap-1.5">{([5,10,20,0] as StudySessionSize[]).map((value) => <button type="button" class={`min-h-10 rounded-xl border px-3 text-xs font-black ${sessionSize() === value ? "border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setSize(value)}>{value === 0 ? "Tất cả" : value}</button>)}</div>
        </div>
        <div>
          <div class="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-slate-500">Kỹ năng trong Flashcard</div>
          <div class="mt-2 flex flex-wrap gap-1.5">{skillOptions.map((item) => { const active = () => !poolSelection().skills?.length ? item.type !== "usage" : poolSelection().skills!.includes(item.type); return <button type="button" aria-pressed={active()} class={`min-h-10 rounded-xl border px-3 text-xs font-black ${active() ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => toggleSkill(item.type)}>{item.label}</button>; })}</div>
          <p class="mt-1.5 text-[0.6875rem] leading-4 text-slate-400">Mặc định: nhận mặt + nhớ ngược + âm. Usage chỉ có khi context đã verified.</p>
        </div>
      </div>
    </section>

    <section class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {modeLinks.map(([icon,title,note,href]) => <A href={href} class={`${surface} min-h-24 p-3.5 text-slate-900 no-underline transition hover:border-blue-200 hover:shadow-md`}><div class="text-lg">{icon}</div><div class="mt-1 text-sm font-black">{title}</div><div class="mt-1 text-[0.6875rem] leading-4 text-slate-500">{note}</div></A>)}
    </section>

    <Show when={savedSets().length}>
      <section class={`${surface} mt-3 p-3`}>
        <div class="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-slate-500">Bộ đã lưu</div>
        <div class="mt-2 flex gap-2 overflow-x-auto pb-1">{savedSets().map((set) => <div class="flex shrink-0 items-center rounded-xl border border-slate-200 bg-white"><button type="button" class="min-h-10 px-3 text-xs font-extrabold text-slate-700" onClick={() => setPoolSelection(set.selection)}>{set.name}</button><button type="button" class="min-h-10 border-l border-slate-100 px-2 text-xs text-slate-400" aria-label={`Xóa ${set.name}`} onClick={() => setSavedSets(deleteStudySet(set.id))}>×</button></div>)}</div>
      </section>
    </Show>

    <Show when={!loading()} fallback={<div class={`${surface} mt-3 p-5 text-sm text-slate-500`}>Đang xây session…</div>}>
      <Show when={index() < entries().length && view()} fallback={<div class="mt-3"><EmptyState title={entries().length ? "Hoàn tất session." : "Không có card phù hợp."} description={scheduledSession() ? "Không còn card đến hạn trong phạm vi này. Đổi sang Luyện toàn phạm vi nếu muốn extra practice." : "Thử đổi phạm vi, kỹ năng hoặc chọn Luyện toàn phạm vi."} /><button class={`${buttonPrimary} mt-3`} onClick={() => void loadSession()}>Làm lại {poolShortLabel(poolSelection())}</button></div>}>
        <div class="mt-3 flex items-center gap-2"><div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progress()}%` }} /></div><Badge>{index() + 1}/{entries().length}</Badge><Badge tone="blue">{view()?.entry.type}</Badge><Badge tone={view()?.entry.scheduled ? "green" : "neutral"}>{view()?.entry.scheduled ? "SRS" : "Practice"}</Badge></div>

        <section class={`${surface} mt-3 grid min-h-[20rem] place-items-center p-5 text-center sm:min-h-[24rem] sm:p-8`}>
          <div class="w-full max-w-3xl">
            <div class={`${view()?.entry.type === "recognition" ? "text-5xl sm:text-6xl" : "text-2xl leading-relaxed sm:text-3xl"} font-black tracking-[-0.035em] text-slate-950`}>{prompt()}</div>
            <Show when={view()?.entry.type === "sound" && view()?.ttsSafe}><button class={`${buttonSecondary} mt-5`} onClick={speak}>🔊 Nghe lại <span class="ml-1 hidden text-[0.6875rem] sm:inline">R</span></button></Show>
            <Show when={view()?.entry.type === "sound" && view() && !view()!.ttsSafe}><div class="mx-auto mt-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Từ đa âm: browser TTS không được dùng vì không đảm bảo đúng âm. Card này luyện pinyin → chữ Hán.</div></Show>
            <Show when={revealed()}><div class="mt-6 border-t border-slate-100 pt-5"><div class="text-lg font-extrabold text-blue-700">{view()?.pinyin}</div><div class="mt-2 text-lg font-black text-slate-900">{view()?.hanzi} · {view()?.meaning}</div><Show when={view()?.hanViet}><div class="mt-1 text-xs text-slate-500">Hán Việt: {view()?.hanViet}</div></Show><Show when={view()?.entry.type === "usage" && view()?.context}><div class="mx-auto mt-4 max-w-2xl rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{view()?.context?.sentenceZh}</div></Show></div></Show>
          </div>
        </section>

        <Show when={!revealed()}><button class={`${buttonPrimary} mt-3 w-full min-h-12`} onClick={() => setRevealed(true)}>Hiện đáp án <span class="ml-2 text-xs opacity-80">Space</span></button></Show>
        <Show when={revealed()}><div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{ratings.map((item) => <button type="button" disabled={committing()} class={`min-h-16 rounded-xl border px-3 text-sm font-black transition active:scale-[0.99] disabled:opacity-50 ${item.cls}`} onClick={() => void rate(item.rating)}><span class="block">{item.label}</span><small class="mt-1 block text-[0.6875rem] font-medium opacity-75">{item.key} · {item.hint}</small></button>)}</div></Show>
      </Show>
    </Show>
  </>;
}
