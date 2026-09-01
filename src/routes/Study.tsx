import { useSearchParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { buildDailySession, getWeakCards } from "../features/review/sessionBuilder";
import { db } from "../db/database";
import type { ContextItem, StudyCardRecord } from "../domain/models";
import { ensureCoreStudyCards, reviewStudyCard, type ReviewRating } from "../services/srs/scheduler";
import { speakChineseApp } from "../features/audio/appSpeech";
import { isTtsSafeLexeme } from "../features/audio/ttsSafety";
import { Badge, buttonGhost, buttonPrimary, buttonSecondary, EmptyState, SectionHeader, surface } from "../components/ui";

interface CardView {
  card: StudyCardRecord;
  hanzi: string;
  pinyin: string;
  meaning: string;
  hanViet: string;
  context?: ContextItem;
  ttsSafe: boolean;
}

async function hydrate(card: StudyCardRecord): Promise<CardView> {
  const sense = await db.senses.get(card.senseId);
  if (!sense) throw new Error("Card sense missing");
  const [lexeme, reading, contexts, ttsSafe] = await Promise.all([
    db.lexemes.get(card.lexemeId),
    db.readings.get(sense.readingId),
    card.type === "usage"
      ? db.contexts.where("lexemeId").equals(card.lexemeId).filter((item) => item.verified === true && (item.senseId === card.senseId || !item.senseId)).toArray()
      : Promise.resolve([]),
    isTtsSafeLexeme(card.lexemeId)
  ]);
  if (!lexeme) throw new Error("Card lexeme missing");
  return { card, hanzi: lexeme.hanzi, pinyin: reading?.pinyin ?? "", meaning: sense.meaningVi, hanViet: sense.hanViet, context: contexts[0], ttsSafe };
}

const ratings: { key: string; rating: ReviewRating; label: string; hint: string; cls: string }[] = [
  { key: "1", rating: "again", label: "Again", hint: "quên", cls: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" },
  { key: "2", rating: "hard", label: "Hard", hint: "khó", cls: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
  { key: "3", rating: "good", label: "Good", hint: "nhớ", cls: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
  { key: "4", rating: "easy", label: "Easy", hint: "rất chắc", cls: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100" }
];

export default function Study() {
  const [searchParams] = useSearchParams();
  let loadToken = 0;
  const [cards, setCards] = createSignal<StudyCardRecord[]>([]);
  const [index, setIndex] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const currentCard = () => cards()[index()];
  const [view] = createResource(currentCard, hydrate);

  const loadDaily = async () => {
    const token = ++loadToken;
    setLoading(true);
    try {
      const session = await buildDailySession();
      if (token !== loadToken) return;
      setCards(session.cards); setIndex(0); setRevealed(false);
    } finally { if (token === loadToken) setLoading(false); }
  };
  const loadWeak = async () => {
    const token = ++loadToken;
    setLoading(true);
    try {
      const weak = await getWeakCards();
      if (token !== loadToken) return;
      setCards(weak); setIndex(0); setRevealed(false);
    } finally { if (token === loadToken) setLoading(false); }
  };
  const loadLexeme = async (lexemeId: string) => {
    const token = ++loadToken;
    setLoading(true);
    try {
      const senses = await db.senses.where("lexemeId").equals(lexemeId).toArray();
      const firstByReading = new Map<string, (typeof senses)[number]>();
      for (const sense of senses) if (!firstByReading.has(sense.readingId)) firstByReading.set(sense.readingId, sense);
      const core = (await Promise.all([...firstByReading.values()].map((sense) => ensureCoreStudyCards(sense)))).flat();
      if (token !== loadToken) return;
      setCards(core); setIndex(0); setRevealed(false);
    } finally { if (token === loadToken) setLoading(false); }
  };

  const prompt = () => {
    const item = view(); if (!item) return "";
    if (item.card.type === "recognition") return item.hanzi;
    if (item.card.type === "recall") return item.meaning || item.hanViet;
    if (item.card.type === "sound") return item.ttsSafe ? "🔊" : item.pinyin;
    if (item.card.type === "usage" && item.context) return item.context.sentenceZh.replace(item.hanzi, "____");
    return item.meaning || item.hanViet;
  };

  const rate = async (rating: ReviewRating) => {
    const item = view();
    if (!item || committing()) return;
    setCommitting(true);
    try {
      await reviewStudyCard(item.card.id, rating, { correct: rating !== "again", gameMode: "flashcard" });
      if (item.card.type === "recognition" && rating !== "again") {
        const sense = await db.senses.get(item.card.senseId);
        if (sense) {
          const core = await ensureCoreStudyCards(sense);
          setCards((list) => {
            const ids = new Set(list.map((x) => x.id));
            return [...list, ...core.filter((x) => !ids.has(x.id) && x.type !== "recognition")];
          });
        }
      }
      setRevealed(false);
      setIndex((i) => i + 1);
    } finally { setCommitting(false); }
  };

  const speak = () => { const item = view(); if (item?.ttsSafe) void speakChineseApp(item.hanzi); };

  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey || committing() || loading()) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (event.code === "Space") { event.preventDefault(); if (!revealed()) setRevealed(true); return; }
    if ((event.key === "r" || event.key === "R") && view()?.card.type === "sound" && view()?.ttsSafe) { event.preventDefault(); speak(); return; }
    if (revealed() && /^[1-4]$/.test(event.key)) { event.preventDefault(); const item = ratings[Number(event.key) - 1]; if (item) void rate(item.rating); }
  };

  createEffect(() => {
    const lexemeId = typeof searchParams.lexeme === "string" ? searchParams.lexeme : "";
    if (lexemeId) void loadLexeme(lexemeId);
    else void loadDaily();
  });
  onMount(() => window.addEventListener("keydown", keydown));
  onCleanup(() => { loadToken += 1; window.removeEventListener("keydown", keydown); });

  const progress = () => cards().length ? Math.min(100, (index() / cards().length) * 100) : 0;

  return <>
    <SectionHeader title="Ôn FSRS" meta={`${Math.min(index(), cards().length)} / ${cards().length}`} description="Space hiện đáp án · 1–4 tự chấm · R nghe lại card âm." />
    <div class="mt-3 flex flex-wrap gap-2"><button class={buttonSecondary} disabled={loading() || committing()} onClick={() => void loadDaily()}>Daily</button><button class={buttonGhost} disabled={loading() || committing()} onClick={() => void loadWeak()}>Từ yếu / Leech</button></div>

    <Show when={!loading()} fallback={<div class={`${surface} mt-3 p-5 text-sm text-slate-500`}>Đang xây session…</div>}>
      <Show when={index() < cards().length && view()} fallback={<div class="mt-3"><EmptyState title={cards().length ? "Hoàn tất session." : "Không có card cần ôn."} description="FSRS sẽ đưa card quay lại đúng lịch. Daily quota không thể bị bypass bằng cách bấm lại." /><button class={`${buttonPrimary} mt-3`} onClick={() => void loadDaily()}>Làm lại Daily</button></div>}>
        <div class="mt-3 flex items-center gap-2"><div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progress()}%` }} /></div><Badge>{index() + 1}/{cards().length}</Badge><Badge tone="blue">{view()?.card.type}</Badge></div>

        <section class={`${surface} mt-3 grid min-h-[20rem] place-items-center p-5 text-center sm:min-h-[24rem] sm:p-8`}>
          <div class="w-full max-w-3xl">
            <div class={`${view()?.card.type === "recognition" ? "text-5xl sm:text-6xl" : "text-2xl leading-relaxed sm:text-3xl"} font-black tracking-[-0.035em] text-slate-950`}>{prompt()}</div>
            <Show when={view()?.card.type === "sound" && view()?.ttsSafe}><button class={`${buttonSecondary} mt-5`} onClick={speak}>🔊 Nghe lại <span class="ml-1 hidden text-[0.6875rem] sm:inline">R</span></button></Show>
            <Show when={view()?.card.type === "sound" && view() && !view()!.ttsSafe}><div class="mx-auto mt-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Từ đa âm: browser TTS không được dùng vì không đảm bảo đúng âm. Card này luyện pinyin → chữ Hán.</div></Show>
            <Show when={revealed()}><div class="mt-6 border-t border-slate-100 pt-5"><div class="text-lg font-extrabold text-blue-700">{view()?.pinyin}</div><div class="mt-2 text-lg font-black text-slate-900">{view()?.hanzi} · {view()?.meaning}</div><Show when={view()?.hanViet}><div class="mt-1 text-xs text-slate-500">Hán Việt: {view()?.hanViet}</div></Show><Show when={view()?.card.type === "usage" && view()?.context}><div class="mx-auto mt-4 max-w-2xl rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{view()?.context?.sentenceZh}</div></Show></div></Show>
          </div>
        </section>

        <Show when={!revealed()}><button class={`${buttonPrimary} mt-3 w-full min-h-12`} onClick={() => setRevealed(true)}>Hiện đáp án <span class="ml-2 text-xs opacity-80">Space</span></button></Show>
        <Show when={revealed()}><div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{ratings.map((item) => <button type="button" disabled={committing()} class={`min-h-16 rounded-xl border px-3 text-sm font-black transition active:scale-[0.99] disabled:opacity-50 ${item.cls}`} onClick={() => void rate(item.rating)}><span class="block">{item.label}</span><small class="mt-1 block text-[0.6875rem] font-medium opacity-75">{item.key} · {item.hint}</small></button>)}</div></Show>
      </Show>
    </Show>
  </>;
}
