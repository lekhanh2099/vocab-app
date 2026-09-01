import { useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { GameFrame, GameResult } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { ChoiceGamePanel, GameProgress } from "../../components/ChoiceGamePanel";
import type { StudyCardType, VocabularyRow } from "../../domain/models";
import { useGameKeys } from "../../features/games/useGameKeys";
import { stopChineseSpeech } from "../../features/audio/speech";
import { speakChineseApp } from "../../features/audio/appSpeech";
import { filterTtsSafeTargets } from "../../features/audio/ttsSafety";
import { beginGameSession, finishGameSession, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordGameAnswer, recordPracticeAnswer, shuffle } from "../../games/shared/gameData";
import { createGamePoolSelection, gamePoolAffectsFsrs, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";
import { choosePlausibleDistractorsByLabel } from "../../games/shared/distractors";
import { filterUnambiguousMeaningTargets } from "../../games/shared/targeting";

type Mode = "meaning" | "hanviet" | "reverse" | "pinyin" | "audio" | "source" | "duplicates";
type Phase = "setup" | "playing" | "result";
const modeInfo: Record<Mode, { title: string; subtitle: string; next: string }> = {
  meaning: { title: "Hán → Nghĩa", subtitle: "recognition", next: "/games/quiz/reverse" },
  hanviet: { title: "Hán → Hán Việt", subtitle: "Hán Việt recall", next: "/games/quiz/meaning" },
  reverse: { title: "Nghĩa → Hán", subtitle: "recall", next: "/games/quiz/pinyin" },
  pinyin: { title: "Pinyin → Hán", subtitle: "sound mapping", next: "/games/quiz/audio" },
  audio: { title: "Audio → Hán", subtitle: "listening recall", next: "/games/speed" },
  source: { title: "Source Challenge", subtitle: "nhớ từ thuộc nguồn nào", next: "/games/quiz/duplicates" },
  duplicates: { title: "Duplicate Hunt", subtitle: "một từ xuất hiện nhiều nơi", next: "/games/boss" }
};

export default function Quiz() {
  const params = useParams<{ mode: string }>();
  const mode = () => (params.mode in modeInfo ? params.mode : "meaning") as Mode;
  const isReferenceMode = () => mode() === "source" || mode() === "duplicates";
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [requestedCount, setRequestedCount] = createSignal<10 | 20 | 30>(20);
  const [pool, setPool] = createSignal<VocabularyRow[]>([]);
  const [items, setItems] = createSignal<VocabularyRow[]>([]);
  const [index, setIndex] = createSignal(0);
  const [score, setScore] = createSignal(0);
  const [answered, setAnswered] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal("");
  const [started, setStarted] = createSignal(Date.now());
  const [loading, setLoading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const [audioPriming, setAudioPriming] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  let sessionId = "";
  let loadToken = 0;
  let disposed = false;

  const finish = async () => {
    if (!sessionId) return;
    const id = sessionId;
    sessionId = "";
    await finishGameSession(id);
  };

  const load = async () => {
    const token = ++loadToken;
    stopChineseSpeech();
    setLoading(true);
    setErrorMessage("");
    setCommitting(false);
    setIndex(0);
    setScore(0);
    setAnswered(false);
    setSelectedKey("");
    setAudioPriming(false);
    await finish();
    if (disposed || token !== loadToken) return;

    const activeMode = mode();
    const referenceMode = activeMode === "source" || activeMode === "duplicates";
    const targetSkills: StudyCardType[] | undefined = referenceMode ? undefined
      : activeMode === "meaning" || activeMode === "hanviet" ? ["recognition"]
      : activeMode === "reverse" ? ["recall"]
      : ["sound"];
    let playable = await getPlayableRows(referenceMode
      ? { limit: Math.max(240, requestedCount() * 10), poolMode: "random-learned", allowNew: false }
      : playableOptionsForSelection(poolSelection(), Math.max(120, requestedCount() * 6), targetSkills));
    if (disposed || token !== loadToken) return;
    if (activeMode === "hanviet") playable = playable.filter((row) => row.senses.some((sense) => sense.hanViet));
    if (activeMode === "duplicates") playable = playable.filter((row) => new Set(row.occurrences.map((occurrence) => `${occurrence.bookId}:${occurrence.lessonId}`)).size >= 2);
    if (activeMode === "source") playable = playable.filter((row) => row.books.length > 0);
    if (activeMode === "meaning" || activeMode === "reverse" || activeMode === "duplicates") playable = playable.filter((row) => primaryMeaning(row));
    if (activeMode === "reverse") playable = filterUnambiguousMeaningTargets(playable);
    if (activeMode === "pinyin" || activeMode === "audio") playable = playable.filter((row) => primaryPinyin(row));
    if (activeMode === "audio") playable = await filterTtsSafeTargets(playable);

    setPool(playable);
    if (playable.length < 4) {
      setItems([]); setLoading(false); setPhase("setup");
      setErrorMessage(referenceMode ? "Chưa có đủ dữ liệu đã học để tạo 4 lựa chọn cho drill này." : "Cần ít nhất 4 từ phù hợp trong phạm vi đã chọn. Hãy đổi pool hoặc học thêm vài từ.");
      return;
    }
    const selected = shuffle(playable).slice(0, requestedCount());
    setItems(selected);
    setStarted(Date.now());
    setLoading(false);
    if (selected.length) {
      setPhase("playing");
      const newSessionId = await beginGameSession(activeMode === "audio" ? "audio" : activeMode, selected.length);
      if (disposed || token !== loadToken) { await finishGameSession(newSessionId); return; }
      sessionId = newSessionId;
      if (activeMode === "audio") window.setTimeout(() => {
        const row = current();
        if (!row || disposed || token !== loadToken) return;
        setAudioPriming(true);
        void (async () => {
          await speakChineseApp(row.lexeme.hanzi);
          if (disposed || token !== loadToken || current() !== row) return;
          setStarted(Date.now());
          setAudioPriming(false);
        })();
      }, 100);
    }
  };

  onCleanup(() => {
    disposed = true;
    loadToken += 1;
    stopChineseSpeech();
    void finish();
  });

  let previousMode = mode();
  createEffect(() => {
    const nextMode = mode();
    if (nextMode === previousMode) return;
    previousMode = nextMode;
    loadToken += 1;
    stopChineseSpeech();
    void finish();
    setPhase("setup");
    setItems([]);
    setPool([]);
  });

  const current = () => items()[index()];
  const done = () => phase() === "result";
  const prompt = () => {
    const row = current();
    if (!row) return "";
    if (["meaning", "hanviet", "duplicates", "source"].includes(mode())) return row.lexeme.hanzi;
    if (mode() === "reverse") return primaryMeaning(row);
    if (mode() === "pinyin") return primaryPinyin(row);
    return "🔊";
  };
  const skill = (): StudyCardType | undefined => mode() === "source" ? undefined : (["meaning", "hanviet", "duplicates"].includes(mode()) ? "recognition" : mode() === "reverse" ? "recall" : "sound");
  const label = (row: VocabularyRow) => {
    if (mode() === "meaning" || mode() === "duplicates") return primaryMeaning(row);
    if (mode() === "hanviet") return row.senses.find((sense) => sense.hanViet)?.hanViet || "—";
    if (mode() === "source") return row.books[0]?.nameVi || "—";
    return row.lexeme.hanzi;
  };
  const key = (row: VocabularyRow) => mode() === "source" ? (row.books[0]?.id || row.lexeme.id) : row.lexeme.id;
  const correctKeys = () => mode() === "source" ? new Set(current()?.books.map((book) => book.id) ?? []) : new Set(current() ? [current()!.lexeme.id] : []);

  const options = createMemo(() => {
    const row = current();
    if (!row) return [];
    if (mode() === "source") {
      const correctIds = new Set(row.books.map((book) => book.id));
      const byBook = new Map<string, VocabularyRow>();
      for (const candidate of pool()) {
        for (const book of candidate.books) {
          if (!correctIds.has(book.id) && !byBook.has(book.id)) byBook.set(book.id, { ...candidate, books: [book] });
        }
      }
      return shuffle([row, ...shuffle([...byBook.values()]).slice(0, 3)]);
    }
    const labelForMode = (candidate: VocabularyRow) => {
      if (mode() === "meaning" || mode() === "duplicates") return primaryMeaning(candidate);
      if (mode() === "hanviet") return candidate.senses.find((sense) => sense.hanViet)?.hanViet || "";
      return candidate.lexeme.hanzi;
    };
    return shuffle([row, ...choosePlausibleDistractorsByLabel(row, pool(), labelForMode, 3)]);
  });

  const answer = async (row: VocabularyRow) => {
    if (answered() || committing() || audioPriming() || !current()) return;
    const active = current()!;
    const ok = correctKeys().has(key(row));
    const ms = Date.now() - started();
    setAnswered(true);
    setSelectedKey(key(row));
    if (ok) setScore((value) => value + 1);
    setCommitting(true);
    try {
      const tasks: Promise<unknown>[] = [sessionId ? logGameEvent(sessionId, active, ok, ms) : Promise.resolve()];
      const cardSkill = skill();
      if (cardSkill) tasks.push(!isReferenceMode() && gamePoolAffectsFsrs(poolSelection())
        ? recordGameAnswer(active, cardSkill, ok, ms, mode() === "audio" ? "audio" : mode())
        : recordPracticeAnswer(active, ok));
      await Promise.all(tasks);
    } finally {
      if (!disposed) setCommitting(false);
    }
  };

  const next = async () => {
    if (!answered() || committing()) return;
    if (index() + 1 >= items().length) {
      await finish();
      if (!disposed) setPhase("result");
      return;
    }
    setIndex((value) => value + 1);
    setAnswered(false);
    setSelectedKey("");
    setStarted(Date.now());
    if (mode() === "audio") {
      const expectedIndex = index();
      const expectedToken = loadToken;
      setAudioPriming(true);
      window.setTimeout(() => {
        const row = current();
        if (!row || index() !== expectedIndex || disposed || expectedToken !== loadToken) return;
        void (async () => {
          await speakChineseApp(row.lexeme.hanzi);
          if (disposed || expectedToken !== loadToken || index() !== expectedIndex || current() !== row) return;
          setStarted(Date.now());
          setAudioPriming(false);
        })();
      }, 70);
    }
  };
  const replay = () => { if (mode() === "audio" && current() && !audioPriming() && !document.hidden) void speakChineseApp(current()!.lexeme.hanzi); };

  useGameKeys({
    option: (optionIndex) => { const row = options()[optionIndex]; if (row) void answer(row); },
    next: () => { if ((phase() === "setup" || phase() === "result") && !loading()) void load(); else if (phase() === "playing" && answered() && !committing()) void next(); },
    replay,
    restart: () => { if (phase() !== "playing" && !loading()) void load(); },
    enabled: () => !loading() && !committing() && !audioPriming()
  });

  const info = () => modeInfo[mode()];
  const optionViews = () => options().map((row) => ({
    key: key(row),
    label: label(row),
    secondary: mode() === "meaning" || mode() === "duplicates" ? primaryPinyin(row) : undefined
  }));
  const selectByKey = (selected: string) => {
    const row = options().find((item) => key(item) === selected);
    if (row) void answer(row);
  };
  return (
    <GameFrame title={info().title} subtitle={info().subtitle} meta={<span>{phase() === "playing" ? `${Math.min(index() + 1, items().length)}/${items().length}` : `${requestedCount()} · ${isReferenceMode() ? "Global learned" : poolShortLabel(poolSelection())}`}</span>} shortcuts={[
      { keys: "1–4", label: "Chọn đáp án" },
      { keys: "Enter", label: "Bắt đầu / câu tiếp theo" },
      ...(mode() === "audio" ? [{ keys: "R", label: "Nghe lại" }] : [])
    ]} compact>
      <Show when={phase() === "setup"}>
        <section class="mx-auto mt-3 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Quick drill</div>
          <h2 class="mt-2 text-2xl font-black tracking-tight text-slate-900">{info().title}</h2>
          <Show when={!isReferenceMode()} fallback={<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><b>Global reference pool.</b> {mode() === "source" ? "Source Challenge cần so sánh nhiều giáo trình" : "Duplicate Hunt cần giữ provenance từ nhiều nơi"}, nên phạm vi quyển/bài không áp dụng. Game chỉ lấy từ đã học và không tác động FSRS.</div>}>
            <p class="mt-2 text-sm leading-6 text-slate-500">Chọn phạm vi trước. Drill chỉ luyện đúng tập từ bạn muốn, không random lẫn toàn bộ dữ liệu.</p>
            <div class="mt-5"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="blue" /></div>
          </Show>
          <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{errorMessage()}</div></Show>
          <div class="mt-4">
            <div class="text-[0.6875rem] font-black uppercase tracking-wider text-slate-500">Số câu</div>
            <div class="mt-2 flex gap-2">{([10,20,30] as const).map((count) => <button type="button" class={`min-h-11 rounded-xl border px-4 text-sm font-black ${requestedCount() === count ? "border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setRequestedCount(count)}>{count}</button>)}</div>
          </div>
          <button class="mt-5 min-h-12 w-full rounded-2xl bg-blue-600 px-5 text-sm font-black text-white sm:w-auto" disabled={loading()} onClick={() => void load()}>{loading() ? "Đang tạo bộ câu hỏi…" : "Bắt đầu drill"}</button>
        </section>
      </Show>

      <Show when={phase() === "playing"}>
        <Show when={items().length > 0} fallback={<section class="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 class="text-xl font-black text-slate-900">Không đủ dữ liệu</h2><p class="mt-2 text-sm text-slate-500">Đổi phạm vi hoặc học thêm vài từ trước khi dùng pool SRS.</p></section>}>
          <Show when={current()}>{(row) => <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
            <GameProgress value={index()} total={items().length} label={<>{index() + 1}/{items().length}</>} />
            <ChoiceGamePanel
              prompt={prompt()}
              subtitle={mode() === "audio" ? "Nghe rồi chọn chữ Hán" : mode() === "source" ? "Chọn một giáo trình có từ này" : "Chọn đáp án đúng"}
              options={optionViews()}
              answered={answered()}
              selectedKey={selectedKey()}
              correctKeys={correctKeys()}
              busy={committing() || audioPriming()}
              audio={mode() === "audio"}
              onReplay={replay}
              onSelect={(selected) => selectByKey(selected)}
              feedbackCorrect={correctKeys().has(selectedKey())}
              feedback={<><b>{correctKeys().has(selectedKey()) ? "Đúng" : "Sai"} · {row().lexeme.hanzi} {primaryPinyin(row())}</b><br/>{primaryMeaning(row()) || row().senses.find((sense) => sense.hanViet)?.hanViet || ""}</>}
              onNext={() => void next()}
            />
          </div>}</Show>
        </Show>
      </Show>

      <Show when={phase() === "result"}>
        <GameResult eyebrow="Quick drill result" title={<>{score()}/{items().length}</>} description={isReferenceMode() ? <>Reference drill: chỉ ghi game history / needs-review khi sai, không tác động FSRS.</> : <>{gamePoolAffectsFsrs(poolSelection()) ? "Kết quả đã cập nhật đúng FSRS skill." : "Practice only: lỗi được đánh dấu để quay lại ở Từ yếu, nhưng lịch FSRS không bị đẩy."}</>} onRetry={() => void load()} busy={loading()} nextHref={info().next} nextLabel="Drill tiếp theo">
          <button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline underline-offset-4" onClick={() => setPhase("setup")}>{isReferenceMode() ? "Đổi số câu" : "Đổi phạm vi / số câu"}</button>
        </GameResult>
      </Show>
    </GameFrame>
  );}
