import { A, useSearchParams } from "@solidjs/router";
import { Gauge, Heart, Pause, Play, Volume2 } from "lucide-solid";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { GameFrame, GameResult, ShortcutHint } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { db } from "../../db/database";
import { createDexieQuery } from "../../db/liveQuery";
import { useGameKeys } from "../../features/games/useGameKeys";
import { useArcadeLifecycle } from "../../features/games/useArcadeLifecycle";
import { pulseGameFeedback } from "../../features/games/feedback";
import { speakChinese, stopChineseSpeech, type SpeakOptions } from "../../features/audio/speech";
import { filterTtsSafeTargets } from "../../features/audio/ttsSafety";
import { beginGameSession, finishGameSession, gameTargetKey, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordGameAnswer, recordPracticeAnswer, shuffle } from "../../games/shared/gameData";
import { filterUnambiguousMeaningTargets } from "../../games/shared/targeting";
import { encounterOutcome } from "../../games/shared/encounter";
import { choosePlausibleDistractorsByLabel } from "../../games/shared/distractors";
import { ARCADE_STAGES, getArcadeStage, starsForResult, type ArcadeStageId } from "../../games/shared/arcadeStages";
import { createGamePoolSelection, gamePoolAffectsFsrs, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";
import type { ShooterController, ShooterState } from "../../games/phaser/createShooterGame";

type Phase = "setup" | "playing" | "result";


const emptyState = (lives = 3): ShooterState => ({ lives, combo: 0, bestCombo: 0, completed: 0, total: 0, score: 0, speedFactor: 1 });

export default function Shooter() {
  let mount!: HTMLDivElement;
  let controller: ShooterController | undefined;
  let sessionId = "";
  let runToken = 0;
  let disposed = false;
  const pendingWrites = new Set<Promise<unknown>>();
  const [searchParams] = useSearchParams();
  const audioMode = () => searchParams.mode === "audio";
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [stageId, setStageId] = createSignal<ArcadeStageId>("warmup");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [state, setState] = createSignal<ShooterState>(emptyState());
  const [prompt, setPrompt] = createSignal("");
  const [currentHanzi, setCurrentHanzi] = createSignal("");
  const [audioConfig, setAudioConfig] = createSignal<SpeakOptions>({});
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const [paused, setPaused] = createSignal(false);
  const [pauseReason, setPauseReason] = createSignal("");
  const [correct, setCorrect] = createSignal(0);
  const [wrong, setWrong] = createSignal(0);
  const [target, setTarget] = createSignal(20);
  const [starting, setStarting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  const [audioBusy, setAudioBusy] = createSignal(false);
  const [answerFeedback, setAnswerFeedback] = createSignal<{ kind: "correct" | "wrong"; hanzi: string; pinyin: string; meaning: string }>();

  const activeStage = () => getArcadeStage(stageId());
  const affectsFsrs = () => gamePoolAffectsFsrs(poolSelection());
  const arcadeSessions = createDexieQuery(() => db.gameSessions.toArray(), []);
  const stageBests = createMemo(() => {
    const mode = audioMode() ? "audio-bomb" : "shooter";
    const result: Record<string, { stars: number; score: number }> = {};
    for (const session of arcadeSessions()) {
      if (session.mode !== mode || !session.stageId || session.endedAt === undefined) continue;
      const current = result[session.stageId] ?? { stars: 0, score: 0 };
      result[session.stageId] = { stars: Math.max(current.stars, session.stars ?? 0), score: Math.max(current.score, session.score ?? 0) };
    }
    return result;
  });


  const trackWrite = (promise: Promise<unknown>) => {
    pendingWrites.add(promise);
    void promise.finally(() => pendingWrites.delete(promise));
  };
  const settleWrites = async () => {
    if (!pendingWrites.size) return;
    await Promise.allSettled([...pendingWrites]);
  };
  const finishTrackedSession = async (stats: Parameters<typeof finishGameSession>[1] = {}) => {
    if (!sessionId) return;
    const id = sessionId;
    sessionId = "";
    await finishGameSession(id, stats);
  };
  const destroyGame = () => {
    stopChineseSpeech();
    controller?.destroy();
    controller = undefined;
    setPaused(false);
    setPauseReason("");
    setAudioBusy(false);
  };

  const start = async () => {
    if (reducedMotion() || starting()) return;
    const token = ++runToken;
    const activeAudioMode = audioMode();
    const stage = activeStage();
    const selection = poolSelection();
    setStarting(true);
    setErrorMessage("");
    setAudioBusy(false);
    try {
      destroyGame();
      await settleWrites();
      await finishTrackedSession();
      if (disposed || token !== runToken) return;

      let pool = (await getPlayableRows(playableOptionsForSelection(selection, Math.max(180, stage.words * 8), [activeAudioMode ? "sound" : "recall"]))).filter((row) => primaryMeaning(row));
      if (activeAudioMode) pool = await filterTtsSafeTargets(pool);
      else pool = filterUnambiguousMeaningTargets(pool);
      if (disposed || token !== runToken) return;
      const rows = shuffle(pool).slice(0, stage.words);
      setTarget(rows.length);
      if (rows.length < 4) {
        setErrorMessage(selection.kind === "weak" ? "Hiện chưa có đủ từ yếu/due để tạo 4 mục tiêu." : selection.kind === "daily" ? "Chưa có đủ từ đã học để tạo game. Hãy học vài từ trước hoặc chọn Theo giáo trình → Luyện toàn bài." : "Không đủ dữ liệu để tạo 4 lựa chọn trong phạm vi đã chọn.");
        return;
      }

      const settings = await db.settings.get("app");
      if (disposed || token !== runToken) return;
      setAudioConfig({ rate: settings?.audioRate, voiceURI: settings?.audioVoiceURI, strategy: settings?.audioStrategy ?? "offline" });
      const byId = new Map(rows.map((row) => [gameTargetKey(row), row]));
      const encounters = new Map<string, { attempts: number; lastMs: number; committed: boolean }>();
      const skill = activeAudioMode ? "sound" as const : "recall" as const;
      const gameMode = activeAudioMode ? "audio-bomb" as const : "shooter" as const;
      const commitUnresolved = () => {
        for (const [id, encounter] of encounters) {
          if (encounter.committed || encounter.attempts <= 0) continue;
          const row = byId.get(id);
          if (!row) continue;
          encounter.committed = true;
          trackWrite((() => {
            const outcome = encounterOutcome(false, encounter.attempts);
            return affectsFsrs() ? recordGameAnswer(row, skill, outcome.correct, encounter.lastMs, gameMode, outcome.hinted) : recordPracticeAnswer(row, false);
          })());
        }
      };
      const questions = rows.map((row) => {
        const options = shuffle([row, ...choosePlausibleDistractorsByLabel(row, pool, (option) => option.lexeme.hanzi, 3)]);
        return { id: gameTargetKey(row), prompt: activeAudioMode ? "🔊" : primaryMeaning(row), correctId: row.lexeme.id, options: options.map((option) => ({ id: option.lexeme.id, label: option.lexeme.hanzi })) };
      });
      const createModule = await import("../../games/phaser/createShooterGame");
      if (disposed || token !== runToken) return;

      setCorrect(0);
      setWrong(0);
      setState(emptyState(stage.lives));
      setPrompt("");
      setCurrentHanzi("");
      setPhase("playing");
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (disposed || token !== runToken || !mount) return;

      sessionId = await beginGameSession(activeAudioMode ? "audio-bomb" : "shooter", questions.length, { stageId: stage.id, poolKey: poolShortLabel(selection) });
      if (disposed || token !== runToken) { await finishTrackedSession(); return; }

      controller = createModule.createShooterGame(mount, questions, {
        onState: (next) => { if (!disposed && token === runToken) setState(next); },
        onPrompt: async (question) => {
          if (disposed || token !== runToken) return;
          setPrompt(question.prompt);
          setAnswerFeedback(undefined);
          const row = byId.get(question.id);
          setCurrentHanzi(row?.lexeme.hanzi ?? "");
          if (!activeAudioMode || !row || document.hidden) return;
          setAudioBusy(true);
          try { await speakChinese(row.lexeme.hanzi, audioConfig()); }
          finally { if (!disposed && token === runToken) setAudioBusy(false); }
        },
        onResult: (question, isCorrect, ms) => {
          if (disposed || token !== runToken) return;
          const row = byId.get(question.id);
          if (!row) return;
          const encounter = encounters.get(question.id) ?? { attempts: 0, lastMs: ms, committed: false };
          encounter.lastMs = ms;
          setAnswerFeedback({ kind: isCorrect ? "correct" : "wrong", hanzi: row.lexeme.hanzi, pinyin: primaryPinyin(row), meaning: primaryMeaning(row) });
          if (isCorrect) {
            pulseGameFeedback("correct");
            if (!activeAudioMode && !document.hidden) void speakChinese(row.lexeme.hanzi, audioConfig());
            setCorrect((value) => value + 1);
            if (!encounter.committed) {
              encounter.committed = true;
              trackWrite((() => {
                const outcome = encounterOutcome(true, encounter.attempts);
                return affectsFsrs() ? recordGameAnswer(row, skill, outcome.correct, ms, gameMode, outcome.hinted) : recordPracticeAnswer(row, true);
              })());
            }
          } else {
            pulseGameFeedback("wrong");
            if (!affectsFsrs()) trackWrite(recordPracticeAnswer(row, false));
            encounter.attempts += 1;
            setWrong((value) => value + 1);
          }
          encounters.set(question.id, encounter);
          if (sessionId) trackWrite(logGameEvent(sessionId, row, isCorrect, ms));
        },
        onComplete: () => {
          if (disposed || token !== runToken) return;
          controller?.pause();
          commitUnresolved();
          void (async () => {
            await settleWrites();
            await finishTrackedSession({ score: state().score, bestCombo: state().bestCombo, stars: starsForResult(correct(), wrong(), target(), state().bestCombo, stage) });
            if (disposed || token !== runToken) return;
            destroyGame();
            pulseGameFeedback("complete");
            setPhase("result");
          })();
        }
      }, {
        lives: stage.lives,
        speedMultiplier: stage.speedMultiplier,
        acceleration: stage.acceleration,
        retryLimit: stage.retryLimit,
        theme: stage.theme,
        rampPerMinute: stage.rampPerMinute
      });
      controller.refresh();
    } catch (error) {
      console.error("Shooter start failed", error);
      if (!disposed && token === runToken) {
        destroyGame();
        await finishTrackedSession().catch(() => undefined);
        setPhase("setup");
        setErrorMessage("Không khởi tạo được game. Thử lại; nếu vẫn lỗi hãy gửi console error.");
      }
    } finally {
      if (!disposed && token === runToken) setStarting(false);
    }
  };

  const replay = async () => {
    if (!audioMode() || paused() || audioBusy() || document.hidden || !controller) return;
    const hanzi = currentHanzi();
    if (!hanzi) return;
    const token = runToken;
    controller.pause();
    setAudioBusy(true);
    try { await speakChinese(hanzi, audioConfig()); }
    finally {
      if (!disposed && token === runToken) {
        setAudioBusy(false);
        if (!paused() && !document.hidden) controller?.resume();
      }
    }
  };

  const setPause = (reason: string) => {
    if (phase() !== "playing" || !controller || paused()) return;
    controller.pause(); stopChineseSpeech(); setAudioBusy(false); setPauseReason(reason); setPaused(true);
  };
  const togglePause = () => {
    if (phase() !== "playing" || !controller) return;
    if (paused()) {
      setPaused(false); setPauseReason("");
      if (audioMode() && currentHanzi()) void replay(); else controller.resume();
      return;
    }
    setPause("manual");
  };

  useArcadeLifecycle({ isPlaying: () => phase() === "playing" && Boolean(controller), isPaused: paused, pause: (reason) => setPause(reason), refresh: () => controller?.refresh() });
  useGameKeys({
    option: (index) => { if (phase() === "playing" && !paused() && !audioBusy()) controller?.choose(index); },
    next: () => { if ((phase() === "setup" || phase() === "result") && !starting()) void start(); },
    replay: () => { if (audioMode() && phase() === "playing") void replay(); },
    restart: () => { if (phase() !== "setup" && !starting()) void start(); },
    pause: togglePause,
    enabled: () => !starting()
  });

  onMount(async () => {
    const settings = await db.settings.get("app");
    if (disposed) return;
    setReducedMotion(Boolean(settings?.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches));
  });
  onCleanup(() => { disposed = true; runToken += 1; destroyGame(); void settleWrites().then(() => finishTrackedSession()); });

  let previousAudioMode = audioMode();
  createEffect(() => {
    const currentMode = audioMode();
    if (currentMode === previousAudioMode) return;
    previousAudioMode = currentMode;
    runToken += 1;
    destroyGame();
    void settleWrites().then(() => finishTrackedSession());
    setStarting(false); setAudioBusy(false); setPhase("setup"); setCorrect(0); setWrong(0); setPrompt(""); setCurrentHanzi("");
  });

  const title = () => audioMode() ? "Audio Bomb" : "Word Shooter";
  const description = () => audioMode() ? "Nghe âm rồi chọn đúng chữ Hán trước khi mục tiêu chạm đất." : "Nhìn nghĩa rồi tap hoặc bấm 1–4 để khóa đúng chữ Hán.";
  const nextStage = () => {
    const index = ARCADE_STAGES.findIndex((item) => item.id === stageId());
    const next = ARCADE_STAGES[index + 1];
    if (!next) { setPhase("setup"); return; }
    setStageId(next.id); void start();
  };
  const hasNextStage = () => ARCADE_STAGES.findIndex((item) => item.id === stageId()) < ARCADE_STAGES.length - 1;
  const resultStars = () => starsForResult(correct(), wrong(), target(), state().bestCombo, activeStage());
  const accuracy = () => Math.round((correct() / Math.max(1, correct() + wrong())) * 100);

  return (
    <GameFrame title={title()} subtitle={audioMode() ? "Panda Range · listening" : "Panda Range · recall"} meta={<span>Màn {activeStage().number} · {poolShortLabel(poolSelection())}</span>} shortcuts={[
      { keys: "1–4", label: "Chọn mục tiêu" }, ...(audioMode() ? [{ keys: "R", label: "Nghe lại" }] : []), { keys: "Space", label: "Pause" }, { keys: "Enter", label: "Bắt đầu / chơi lại" }
    ]}>
      <Show when={!reducedMotion()} fallback={<section class="mx-auto mt-3 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 class="text-2xl font-black text-slate-900">Animation đã được tắt.</h2><p class="mt-2 text-sm leading-6 text-slate-500">Dùng Speed 20 để luyện cùng skill mà không có vật thể rơi.</p><div class="mt-4 flex gap-2"><A class="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-4 font-bold text-white no-underline" href="/games/speed">Mở Speed 20</A><A class="inline-flex min-h-12 items-center rounded-xl bg-slate-100 px-4 font-bold text-slate-800 no-underline" href="/games">Game khác</A></div></section>}>
        <Show when={phase() === "setup"}>
          <section class="mx-auto mt-2 w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div class="grid lg:grid-cols-[1fr_0.95fr]">
              <div class="border-b border-slate-200 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <div class="flex items-start gap-4"><img src="/mascot/panda-ranger.png" alt="Panda Range" class="size-16 shrink-0 object-contain sm:size-18"/><div><div class="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Panda Range</div><h2 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">{title()}</h2><p class="mt-2 text-sm leading-6 text-slate-500">{description()} Chọn đúng để gấu trúc phóng phi tiêu phá target; sai thì target được đưa lại vào queue.</p></div></div>
                <div class="mt-4"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="blue" /></div>
                <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] font-bold text-slate-500"><span>4 mục tiêu gần nghĩa</span><span>Desktop: 1–4</span><span>iPad/mobile: chạm trực tiếp</span></div>
              </div>
              <div class="bg-slate-50/70 p-4 sm:p-5"><div class="flex items-center justify-between gap-3"><div class="text-xs font-black uppercase tracking-wider text-slate-500">Chọn màn</div><span class="text-[0.6875rem] font-bold text-slate-400">Tăng tốc liên tục theo thời gian</span></div><div class="mt-3 grid gap-2 sm:grid-cols-2">{ARCADE_STAGES.map((stage) => <button type="button" class={`rounded-xl border p-3 text-left transition ${stageId() === stage.id ? "border-blue-300 bg-white ring-2 ring-blue-100 shadow-sm" : "border-slate-200 bg-white/80 hover:border-slate-300"}`} onClick={() => setStageId(stage.id)}><div class="flex items-center justify-between"><span class="grid size-8 place-items-center rounded-lg bg-slate-900 text-xs font-black text-white">{stage.number}</span><span class="text-[0.6875rem] font-black text-blue-700">{stage.difficulty}</span></div><div class="mt-2 font-black text-slate-900">{stage.name}</div><p class="mt-1 text-[0.6875rem] text-slate-500">{stage.words} từ · {stage.lives} mạng · +{Math.round(stage.rampPerMinute*100)}%/phút</p><div class="mt-2 flex items-center justify-between text-[0.6875rem] font-bold"><span class="text-amber-700">★ {stageBests()[stage.id]?.stars ?? 0}/3</span><Show when={(stageBests()[stage.id]?.score ?? 0)>0}><span class="text-slate-400">PB {stageBests()[stage.id]!.score.toLocaleString("vi-VN")}</span></Show></div></button>)}</div><Show when={errorMessage()}><div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage()}</div></Show><button class="mt-4 min-h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50" disabled={starting()} onClick={() => void start()}>{starting() ? "Đang chuẩn bị…" : `Vào màn ${activeStage().number} · ${activeStage().name}`}</button></div>
            </div>
          </section>
        </Show>

        <Show when={phase() === "playing"}>
          <section class="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col gap-2.5">
            <div class="relative min-h-[clamp(20rem,44dvh,30rem)] flex-1 overflow-hidden rounded-[1.25rem] border border-slate-900/10 bg-slate-950 shadow-[0_1rem_2.5rem_rgba(15,23,42,0.18)] touch-capable:min-h-[clamp(23rem,51dvh,34rem)] fine-pointer:min-h-[clamp(24rem,53dvh,35rem)] landscape:touch-capable:min-h-[clamp(18rem,56dvh,27rem)]">
              <div class="absolute inset-0 overflow-hidden [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:touch-none" ref={mount}/>
              <div class="pointer-events-none absolute inset-x-0 top-0 z-10 p-2.5 sm:p-3">
                <div class="flex flex-wrap items-center gap-1 sm:gap-1.5">
                  <span class="rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur">M{activeStage().number} · {activeStage().name}</span>
                  <span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur"><Heart size={12} fill="currentColor"/> {state().lives}</span>
                  <span class="rounded-full border border-amber-200/20 bg-amber-400/90 px-2 py-1 text-[0.625rem] font-black text-slate-950">×{state().combo}</span>
                  <span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur"><Gauge size={12}/> ×{state().speedFactor.toFixed(2)}</span>
                  <span class="hidden rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur sm:inline">{state().score.toLocaleString("vi-VN")}</span>
                  <div class="pointer-events-auto ml-auto flex gap-1.5"><Show when={audioMode()}><button class="inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/15 bg-slate-950/72 px-2.5 text-[0.625rem] font-black text-white backdrop-blur disabled:opacity-40" type="button" disabled={paused() || audioBusy()} onClick={() => void replay()}><Volume2 size={13}/>Nghe</button></Show><button class="inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/15 bg-slate-950/72 px-2.5 text-[0.625rem] font-black text-white backdrop-blur" type="button" onClick={togglePause}>{paused() ? <><Play size={13}/>Tiếp</> : <><Pause size={13}/>Pause</>}</button></div>
                </div>
                <div class="mt-2 flex items-center gap-1.5"><div class="h-1 flex-1 overflow-hidden rounded-full bg-white/15"><div class="h-full rounded-full bg-cyan-300 shadow-[0_0_1rem_rgba(103,232,249,.7)] transition-[width]" style={{width:`${target()?Math.min(100,(correct()/target())*100):0}%`}}/></div><span class="rounded-full bg-slate-950/60 px-1.5 py-1 text-[0.625rem] font-black text-white backdrop-blur">{correct()}/{target()}</span></div>
                <div class="mt-2 flex justify-center"><div class="max-w-[74%] rounded-xl border border-white/10 bg-slate-950/72 px-3 py-1.5 text-center text-white shadow-sm backdrop-blur"><div class="text-[0.5625rem] font-black uppercase tracking-[0.12em] text-slate-400">{audioMode() ? "Listening" : "Nghĩa"}</div><div class="mt-0.5 text-base font-black sm:text-lg">{audioMode() ? (audioBusy() ? "Đang phát âm…" : "Nghe rồi chọn chữ Hán") : prompt()}</div></div></div>
              </div>
              <Show when={answerFeedback()}>{(feedback) => <div class="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4"><div class={`rounded-2xl border px-4 py-2.5 text-center shadow-xl backdrop-blur-md ${feedback().kind === "correct" ? "border-emerald-300/40 bg-emerald-950/80 text-emerald-50" : "border-red-300/40 bg-red-950/85 text-red-50"}`}><div class="text-base font-black sm:text-lg">{feedback().hanzi} · {feedback().pinyin}</div><Show when={feedback().meaning}><div class="mt-0.5 text-xs font-bold opacity-80">{feedback().meaning}</div></Show></div></div>}</Show>
              <Show when={paused()}><div class="absolute inset-0 z-20 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"><div class="grid max-w-sm justify-items-center gap-2 rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-center text-white shadow-2xl"><b class="text-xl font-black">Đã tạm dừng</b><p class="text-xs leading-5 text-slate-300">{pauseReason() === "background" || pauseReason() === "pagehide" ? "Game tự pause khi bạn chuyển app hoặc khóa màn hình." : "Mục tiêu và mạng được giữ nguyên."}</p><button class="mt-1 min-h-12 rounded-xl bg-white px-5 text-sm font-extrabold text-slate-900" type="button" onClick={togglePause}><span class="inline-flex items-center gap-1"><Play size={15}/>Tiếp tục</span></button></div></div></Show>
            </div>
            <div class="hidden justify-center gap-2 fine-pointer:flex touch-capable:!hidden"><ShortcutHint keys="1–4">Chọn target</ShortcutHint><ShortcutHint keys="Space">Pause</ShortcutHint><Show when={audioMode()}><ShortcutHint keys="R">Replay</ShortcutHint></Show></div>
            <div class="hidden rounded-xl bg-slate-50 p-2.5 text-center text-[0.6875rem] font-bold text-slate-500 touch-capable:block">Chạm trực tiếp vào target · không mở bàn phím hệ thống</div>
          </section>
        </Show>

        <Show when={phase() === "result"}><GameResult eyebrow={resultStars() >= 2 ? "Qua màn" : `${title()} Result`} title={<>{"★".repeat(resultStars())}{"☆".repeat(3-resultStars())}</>} description={<>{activeStage().name} · {poolShortLabel(poolSelection())} · {accuracy()}% chính xác · {affectsFsrs() ? "cập nhật SRS" : "practice only"}</>} onRetry={() => void start()} busy={starting()} onNext={hasNextStage() ? nextStage : undefined} nextLabel={hasNextStage() ? `Màn ${activeStage().number+1}` : undefined}><div class="mx-auto mt-5 grid max-w-lg grid-cols-3 gap-2"><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase text-slate-400">Điểm</div><div class="mt-1 text-xl font-black">{state().score.toLocaleString("vi-VN")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase text-slate-400">Best combo</div><div class="mt-1 text-xl font-black">×{state().bestCombo}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase text-slate-400">Đúng</div><div class="mt-1 text-xl font-black">{correct()}/{target()}</div></div></div><button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800" onClick={() => setPhase("setup")}>Chọn bộ từ / màn khác</button></GameResult></Show>
      </Show>
    </GameFrame>
  );
}
