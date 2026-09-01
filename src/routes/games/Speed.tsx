import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { GameFrame, GameResult } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { ChoiceGamePanel, GameProgress } from "../../components/ChoiceGamePanel";
import type { VocabularyRow } from "../../domain/models";
import { useGameKeys } from "../../features/games/useGameKeys";
import { stopChineseSpeech } from "../../features/audio/speech";
import { speakChineseApp } from "../../features/audio/appSpeech";
import { filterTtsSafeTargets } from "../../features/audio/ttsSafety";
import { beginGameSession, finishGameSession, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordPracticeAnswer, shuffle } from "../../games/shared/gameData";
import { choosePlausibleDistractorsByLabel } from "../../games/shared/distractors";
import { filterUnambiguousMeaningTargets } from "../../games/shared/targeting";
import { createGamePoolSelection, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";

type QMode = "meaning" | "reverse" | "pinyin" | "audio";
type Phase = "setup" | "playing" | "result";
type Pace = "relaxed" | "standard" | "rush";
const modes: QMode[] = ["meaning", "reverse", "pinyin", "audio"];
const labels: Record<QMode, string> = { meaning: "Hán → Nghĩa", reverse: "Nghĩa → Hán", pinyin: "Pinyin → Hán", audio: "Audio → Hán" };
const paceOptions: Record<Pace, { label: string; ms: number; note: string }> = {
  relaxed: { label: "Bình tĩnh", ms: 12000, note: "12 giây/câu · ưu tiên độ chính xác" },
  standard: { label: "Tiêu chuẩn", ms: 9000, note: "9 giây/câu · cân bằng" },
  rush: { label: "Nước rút", ms: 6000, note: "6 giây/câu · phản xạ nhanh" }
};

export default function Speed() {
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [requestedCount, setRequestedCount] = createSignal<10 | 20>(20);
  const [pace, setPace] = createSignal<Pace>("standard");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [items, setItems] = createSignal<VocabularyRow[]>([]);
  const [index, setIndex] = createSignal(0);
  const [score, setScore] = createSignal(0);
  const [answered, setAnswered] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [startedAt, setStartedAt] = createSignal(Date.now());
  const [loading, setLoading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const [remainingMs, setRemainingMs] = createSignal(paceOptions.standard.ms);
  const [timedOut, setTimedOut] = createSignal(false);
  const [clockArmed, setClockArmed] = createSignal(true);
  const [audioBusy, setAudioBusy] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  let timer = 0;
  let lastTick = performance.now();
  let loadToken = 0;
  let disposed = false;

  const questionMs = () => paceOptions[pace()].ms;
  const current = () => items()[index()];
  const mode = () => modes[index() % modes.length]!;
  const options = createMemo(() => {
    const row = current();
    if (!row) return [];
    const labelForMode = (candidate: VocabularyRow) => mode() === "meaning" ? primaryMeaning(candidate) : candidate.lexeme.hanzi;
    return shuffle([row, ...choosePlausibleDistractorsByLabel(row, items(), labelForMode, 3)]);
  });
  const resetClock = (armed = true) => { setRemainingMs(questionMs()); setTimedOut(false); setClockArmed(armed); lastTick = performance.now(); };

  const finish = async () => {
    const id = sessionId();
    if (!id) return;
    setSessionId("");
    await finishGameSession(id);
  };

  const start = async () => {
    const token = ++loadToken;
    stopChineseSpeech();
    setLoading(true); setErrorMessage(""); setCommitting(false); setItems([]); setIndex(0); setScore(0); setAnswered(false); setSelectedKey(""); setAudioBusy(false);
    resetClock();
    await finish();
    if (disposed || token !== loadToken) return;
    const playable = await filterTtsSafeTargets((await getPlayableRows(playableOptionsForSelection(poolSelection(), Math.max(120, requestedCount() * 6)))).filter((row) => primaryMeaning(row) && primaryPinyin(row)));
    const rows = shuffle(filterUnambiguousMeaningTargets(playable)).slice(0, requestedCount());
    if (disposed || token !== loadToken) return;
    setItems(rows);
    setStartedAt(Date.now());
    setLoading(false);
    if (rows.length < 4) {
      setPhase("setup");
      setErrorMessage("Cần ít nhất 4 từ đã học có nghĩa/pinyin rõ để chạy Speed. Hãy đổi pool hoặc học thêm vài từ.");
      return;
    }
    setPhase("playing");
    const newSessionId = await beginGameSession("speed", rows.length);
    if (disposed || token !== loadToken) { await finishGameSession(newSessionId); return; }
    setSessionId(newSessionId);
  };

  onMount(() => {
    lastTick = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now(), delta = now - lastTick; lastTick = now;
      if (document.hidden || phase() !== "playing" || loading() || answered() || committing() || !clockArmed()) return;
      const next = Math.max(0, remainingMs() - delta);
      setRemainingMs(next);
      if (next <= 0 && current()) void timeout();
    }, 100);
  });
  onCleanup(() => { window.clearInterval(timer); disposed = true; loadToken += 1; stopChineseSpeech(); void finish(); });

  const prompt = () => {
    const row = current(); if (!row) return "";
    if (mode() === "meaning") return row.lexeme.hanzi;
    if (mode() === "reverse") return primaryMeaning(row);
    if (mode() === "pinyin") return primaryPinyin(row);
    return "🔊";
  };
  const label = (row: VocabularyRow) => mode() === "meaning" ? primaryMeaning(row) : row.lexeme.hanzi;

  const replay = async () => {
    const row = current();
    if (phase() !== "playing" || mode() !== "audio" || !row || audioBusy() || !clockArmed() || answered() || document.hidden) return;
    setAudioBusy(true); setClockArmed(false);
    try { await speakChineseApp(row.lexeme.hanzi); }
    finally { if (!disposed && current() === row && !answered() && !document.hidden) { lastTick = performance.now(); setClockArmed(true); } if (!disposed) setAudioBusy(false); }
  };

  const next = async () => {
    if (!answered() || committing()) return;
    if (index() + 1 >= items().length) {
      await finish();
      if (!disposed) setPhase("result");
      return;
    }
    const nextIndex = index() + 1;
    setIndex(nextIndex); setAnswered(false); setSelectedKey(""); setStartedAt(Date.now());
    const nextMode = modes[nextIndex % modes.length]!;
    resetClock(nextMode !== "audio");
    if (nextMode === "audio") {
      const expectedIndex = nextIndex;
      setAudioBusy(true);
      window.setTimeout(() => {
        const row = current();
        if (!row || index() !== expectedIndex || answered()) { setAudioBusy(false); return; }
        void (async () => {
          await speakChineseApp(row.lexeme.hanzi);
          if (index() !== expectedIndex || answered() || document.hidden) { if (!disposed) setAudioBusy(false); return; }
          setStartedAt(Date.now()); setRemainingMs(questionMs()); lastTick = performance.now(); setClockArmed(true); setAudioBusy(false);
        })();
      }, 70);
    }
  };

  const submit = async (row: VocabularyRow | undefined, fromTimeout = false) => {
    if (phase() !== "playing" || answered() || committing() || audioBusy() || (mode() === "audio" && !clockArmed()) || !current()) return;
    const active = current()!;
    const correct = Boolean(row && row.lexeme.id === active.lexeme.id);
    const ms = Date.now() - startedAt();
    setAnswered(true); setTimedOut(fromTimeout); setSelectedKey(row?.lexeme.id ?? ""); if (correct) setScore((value) => value + 1);
    setCommitting(true);
    try { await Promise.all([recordPracticeAnswer(active, correct), sessionId() ? logGameEvent(sessionId(), active, correct, ms) : Promise.resolve()]); }
    finally { if (!disposed) setCommitting(false); }
  };
  const timeout = async () => submit(undefined, true);
  const answer = async (row: VocabularyRow) => submit(row, false);

  useGameKeys({
    option: (optionIndex) => { const row = options()[optionIndex]; if (row) void answer(row); },
    next: () => { if ((phase() === "setup" || phase() === "result") && !loading()) void start(); else if (phase() === "playing" && answered() && !committing()) void next(); },
    replay: () => { void replay(); },
    restart: () => { if (phase() !== "playing" && !loading()) void start(); },
    enabled: () => !loading() && !committing() && !audioBusy()
  });

  const optionViews = () => options().map((row) => ({ key: row.lexeme.id, label: label(row), secondary: mode() === "meaning" ? primaryPinyin(row) : undefined }));
  const selectByKey = (key: string) => { const row = options().find((item) => item.lexeme.id === key); if (row) void answer(row); };
  const accuracy = () => Math.round(score() / Math.max(1, items().length) * 100);

  return (
    <GameFrame title="Speed" subtitle="Mixed recall · có timer" meta={<span>{phase() === "playing" ? `${Math.min(index()+1, items().length)}/${items().length}` : `${requestedCount()} câu · ${poolShortLabel(poolSelection())}`}</span>} shortcuts={[{ keys: "1–4", label: "Chọn đáp án" }, { keys: "Enter", label: "Bắt đầu / câu tiếp" }, { keys: "R", label: "Nghe lại" }]} compact>
      <Show when={phase() === "setup"}>
        <section class="mx-auto mt-3 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Challenge</div><h2 class="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">Chọn nhịp trước khi chạy Speed</h2><p class="mt-2 text-sm leading-6 text-slate-500">Speed trộn recognition, recall và sound. Khó nằm ở thời gian phản xạ, không nằm ở việc đoán cách dùng UI.</p>
          <div class="mt-6 grid gap-5 lg:grid-cols-2">
            <div><div class="text-xs font-black uppercase tracking-wider text-slate-500">Số câu</div><div class="mt-2 grid grid-cols-2 gap-2">{([10,20] as const).map((count) => <button type="button" class={`rounded-2xl border p-4 text-left ${requestedCount()===count?"border-blue-300 bg-blue-50 ring-2 ring-blue-100":"border-slate-200"}`} onClick={() => setRequestedCount(count)}><b class="text-sm text-slate-900">{count} câu</b><p class="mt-1 text-xs text-slate-500">{count===10?"Quick run":"Standard run"}</p></button>)}</div></div>
            <div><div class="text-xs font-black uppercase tracking-wider text-slate-500">Nhịp</div><div class="mt-2 grid gap-2">{(Object.keys(paceOptions) as Pace[]).map((id) => <button type="button" class={`rounded-2xl border p-3 text-left ${pace()===id?"border-amber-300 bg-amber-50 ring-2 ring-amber-100":"border-slate-200"}`} onClick={() => setPace(id)}><div class="flex items-center justify-between"><b class="text-sm text-slate-900">{paceOptions[id].label}</b><span class="text-xs font-black text-amber-700">{paceOptions[id].ms/1000}s</span></div><p class="mt-1 text-xs text-slate-500">{paceOptions[id].note}</p></button>)}</div></div>
          </div>
<div class="mt-6"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="blue" practiceOnly /></div>
          <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{errorMessage()}</div></Show>
          <button class="mt-6 min-h-12 w-full rounded-2xl bg-blue-600 px-5 text-sm font-black text-white sm:w-auto" disabled={loading()} onClick={() => void start()}>{loading()?"Đang tạo run…":`Bắt đầu ${requestedCount()} câu`}</button>
        </section>
      </Show>

      <Show when={phase() === "playing"}>
        <Show when={items().length > 0} fallback={<section class="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5"><h2 class="text-2xl font-black">Không đủ dữ liệu cho bộ đã chọn.</h2><button class="mt-4 min-h-11 rounded-xl bg-slate-100 px-4 font-bold" onClick={() => setPhase("setup")}>Chọn lại</button></section>}>
          <Show when={current()}>{(row) => <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
            <div class="flex items-center gap-3"><div class="flex-1"><GameProgress value={index()} total={items().length}/></div><span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">{labels[mode()]}</span><span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{poolShortLabel(poolSelection())}</span></div>
            <div class="flex items-center gap-2"><div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div class={`h-full rounded-full transition-[width] ${remainingMs()<3000?"bg-red-500":"bg-amber-500"}`} style={{width:`${Math.max(0,Math.min(100,remainingMs()/questionMs()*100))}%`}}/></div><span class="min-w-12 text-right text-xs font-extrabold tabular-nums text-slate-500">{clockArmed()?`${(remainingMs()/1000).toFixed(1)}s`:"nghe…"}</span></div>
            <ChoiceGamePanel prompt={prompt()} subtitle={mode()==="audio"?"Nghe rồi chọn chữ Hán":mode()==="meaning"?primaryPinyin(row()):"Chọn đáp án đúng"} options={optionViews()} answered={answered()} selectedKey={selectedKey()} correctKeys={new Set([row().lexeme.id])} busy={committing()||audioBusy()} audio={mode()==="audio"} onReplay={replay} onSelect={(key)=>selectByKey(key)} feedbackCorrect={selectedKey()===row().lexeme.id} feedback={<><b>{timedOut()?"Hết giờ":selectedKey()===row().lexeme.id?"Đúng":"Sai"} · {row().lexeme.hanzi} {primaryPinyin(row())}</b><br/>{primaryMeaning(row())}</>} onNext={() => void next()}/>
          </div>}</Show>
        </Show>
      </Show>

      <Show when={phase() === "result"}><GameResult eyebrow="Speed Result" title={<>{score()}/{items().length}</>} description={<>{accuracy()}% chính xác · {paceOptions[pace()].label} · {poolShortLabel(poolSelection())} · practice only · không đẩy lịch FSRS.</>} onRetry={() => void start()} busy={loading()} nextHref="/games/falling" nextLabel="Vào Falling Recall"><button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline underline-offset-4" onClick={() => setPhase("setup")}>Đổi nhịp / số câu / bộ từ</button></GameResult></Show>
    </GameFrame>
  );
}
