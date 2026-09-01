import { A } from "@solidjs/router";
import { Delete, Eraser, Gauge, Heart, Keyboard, Pause, Play, Shield, TimerReset, Volume2, CheckCircle2, Circle } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { GameFrame, GameResult, ShortcutHint } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { db } from "../../db/database";
import { createDexieQuery } from "../../db/liveQuery";
import { speakChinese, stopChineseSpeech, type SpeakOptions } from "../../features/audio/speech";
import { filterTtsSafeTargets } from "../../features/audio/ttsSafety";
import { useArcadeLifecycle } from "../../features/games/useArcadeLifecycle";
import { pulseGameFeedback } from "../../features/games/feedback";
import { normalizeTyping, typingPrefixMatches } from "../../features/search/normalize";
import { beginGameSession, finishGameSession, gameTargetKey, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordGameAnswer, recordPracticeAnswer } from "../../games/shared/gameData";
import { encounterOutcome } from "../../games/shared/encounter";
import { ARCADE_STAGES, getArcadeStage, stageMissions, starsForResult, type ArcadeStageId } from "../../games/shared/arcadeStages";
import { createGamePoolSelection, gamePoolAffectsFsrs, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";
import type { FallingController, FallingState } from "../../games/phaser/createFallingGame";

type Mode = "han" | "audio";
type Phase = "setup" | "playing" | "result";

const keys = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const keyClass = "min-h-11 flex-1 rounded-lg border border-slate-200 bg-white px-1 text-sm font-bold text-slate-800 shadow-sm active:translate-y-[0.0625rem] active:bg-blue-50 disabled:opacity-40";

const modeCopy: Record<Mode, { label: string; title: string; description: string; skill: string }> = {
  han: { label: "汉 → 拼", title: "Hán → Pinyin", description: "Nhìn chữ Hán, tự gõ pinyin trước khi mục tiêu chạm đất.", skill: "Pronunciation" },
  audio: { label: "听 → 拼", title: "Nghe → Pinyin", description: "Nghe Mandarin rồi tự gõ pinyin. Không dùng chữ Hán làm gợi ý.", skill: "Listening" }
};


const emptyState = (lives = 3): FallingState => ({ typed: "", validPrefix: true, lives, combo: 0, bestCombo: 0, completed: 0, total: 0, score: 0, speedFactor: 1, slowMs: 0, shield: 0 });

export default function Falling() {
  let mount!: HTMLDivElement;
  let controller: FallingController | undefined;
  let sessionId = "";
  let runToken = 0;
  let disposed = false;
  let feedbackTimer: number | undefined;
  const pendingWrites = new Set<Promise<unknown>>();

  const [phase, setPhase] = createSignal<Phase>("setup");
  const [mode, setMode] = createSignal<Mode>("han");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [stageId, setStageId] = createSignal<ArcadeStageId>("warmup");
  const [state, setState] = createSignal<FallingState>(emptyState());
  const [currentHanzi, setCurrentHanzi] = createSignal("");
  const [audioConfig, setAudioConfig] = createSignal<SpeakOptions>({});
  const [toneMode, setToneMode] = createSignal<"plain" | "numbers">("plain");
  const [ready, setReady] = createSignal(false);
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
  const stageBests = createDexieQuery(async () => {
    const sessions = await db.gameSessions.where("mode").equals("falling").toArray();
    const result: Record<string, { stars: number; score: number }> = {};
    for (const session of sessions) {
      if (!session.stageId || session.endedAt === undefined) continue;
      const current = result[session.stageId] ?? { stars: 0, score: 0 };
      result[session.stageId] = { stars: Math.max(current.stars, session.stars ?? 0), score: Math.max(current.score, session.score ?? 0) };
    }
    return result;
  }, {} as Record<string, { stars: number; score: number }>);


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
    setStarting(true);
    setErrorMessage("");
    setAudioBusy(false);
    if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    setAnswerFeedback(undefined);
    try {
      destroyGame();
      await settleWrites();
      await finishTrackedSession();
      if (disposed || token !== runToken) return;

      const activeMode = mode();
      const stage = activeStage();
      const selection = poolSelection();
      let candidates = (await getPlayableRows(playableOptionsForSelection(selection, Math.max(180, stage.words * 8), ["sound"]))).filter((row) => primaryPinyin(row));
      if (activeMode === "audio") candidates = await filterTtsSafeTargets(candidates);
      const data = candidates.slice(0, stage.words);
      if (disposed || token !== runToken) return;
      setTarget(data.length);
      if (!data.length) {
        setErrorMessage(selection.kind === "weak" ? "Hiện chưa có đủ từ yếu/due trong phạm vi này." : selection.kind === "daily" ? "Chưa có đủ từ đã học để chơi. Hãy học/ôn vài từ trước, hoặc chọn Theo giáo trình → Luyện toàn bài." : "Không đủ từ phù hợp trong phạm vi đã chọn.");
        return;
      }

      const settings = await db.settings.get("app");
      if (disposed || token !== runToken) return;
      const tones = settings?.fallingToneMode ?? "plain";
      setToneMode(tones);
      setAudioConfig({ rate: settings?.audioRate, voiceURI: settings?.audioVoiceURI, strategy: settings?.audioStrategy ?? "offline" });
      const createModule = await import("../../games/phaser/createFallingGame");
      if (disposed || token !== runToken) return;

      setCorrect(0);
      setWrong(0);
      setState(emptyState(stage.lives));
      setCurrentHanzi("");
      setPhase("playing");
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (disposed || token !== runToken || !mount) return;

      sessionId = await beginGameSession("falling", data.length, { stageId: stage.id, poolKey: poolShortLabel(selection) });
      if (disposed || token !== runToken) { await finishTrackedSession(); return; }

      const byId = new Map(data.map((row) => [gameTargetKey(row), row]));
      const encounters = new Map<string, { attempts: number; lastMs: number; committed: boolean }>();
      const skill = "sound" as const;
      const commitUnresolved = () => {
        for (const [id, encounter] of encounters) {
          if (encounter.committed || encounter.attempts <= 0) continue;
          const row = byId.get(id);
          if (!row) continue;
          encounter.committed = true;
          trackWrite((() => {
            const outcome = encounterOutcome(false, encounter.attempts);
            return affectsFsrs() ? recordGameAnswer(row, skill, outcome.correct, encounter.lastMs, "falling", outcome.hinted) : recordPracticeAnswer(row, false);
          })());
        }
      };

      controller = createModule.createFallingGame(mount, data.map((row) => ({
        id: gameTargetKey(row),
        hanzi: row.lexeme.hanzi,
        prompt: activeMode === "han" ? row.lexeme.hanzi : "听",
        expected: normalizeTyping(primaryPinyin(row), tones)
      })), {
        normalizeTyped: (value) => normalizeTyping(value, tones),
        isValidPrefix: (value, expected) => typingPrefixMatches(value, expected, tones),
        onState: (next) => { if (!disposed && token === runToken) setState(next); },
        onSpawn: async (item) => {
          if (disposed || token !== runToken) return;
          setCurrentHanzi(item.hanzi);
          if (activeMode !== "audio" || document.hidden) return;
          setAudioBusy(true);
          try { await speakChinese(item.hanzi, audioConfig()); }
          finally { if (!disposed && token === runToken) setAudioBusy(false); }
        },
        onResult: (item, isCorrect, ms) => {
          if (disposed || token !== runToken) return;
          const row = byId.get(item.id);
          if (!row) return;
          const encounter = encounters.get(item.id) ?? { attempts: 0, lastMs: ms, committed: false };
          encounter.lastMs = ms;
          if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
          setAnswerFeedback({ kind: isCorrect ? "correct" : "wrong", hanzi: row.lexeme.hanzi, pinyin: primaryPinyin(row), meaning: primaryMeaning(row) });
          feedbackTimer = window.setTimeout(() => setAnswerFeedback(undefined), 1500);
          if (isCorrect) {
            pulseGameFeedback("correct");
            if (activeMode === "han" && !document.hidden) void speakChinese(row.lexeme.hanzi, audioConfig());
            setCorrect((value) => value + 1);
            if (!encounter.committed) {
              encounter.committed = true;
              trackWrite((() => {
                const outcome = encounterOutcome(true, encounter.attempts);
                return affectsFsrs() ? recordGameAnswer(row, skill, outcome.correct, ms, "falling", outcome.hinted) : recordPracticeAnswer(row, true);
              })());
            }
          } else {
            pulseGameFeedback("wrong");
            if (!affectsFsrs()) trackWrite(recordPracticeAnswer(row, false));
            encounter.attempts += 1;
            setWrong((value) => value + 1);
          }
          encounters.set(item.id, encounter);
          if (sessionId) trackWrite(logGameEvent(sessionId, row, isCorrect, ms));
        },
        onPowerUp: () => pulseGameFeedback("powerup"),
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
        rampPerMinute: stage.rampPerMinute,
        powerUps: stage.powerUps
      });
      controller.refresh();
    } catch (error) {
      console.error("Falling start failed", error);
      if (!disposed && token === runToken) {
        destroyGame();
        await finishTrackedSession().catch(() => undefined);
        setPhase("setup");
        setErrorMessage("Không khởi tạo được Falling. Thử lại; nếu vẫn lỗi hãy gửi console error.");
      }
    } finally {
      if (!disposed && token === runToken) setStarting(false);
    }
  };

  const replay = async () => {
    if (mode() !== "audio" || paused() || audioBusy() || document.hidden || !controller) return;
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
    controller.pause();
    stopChineseSpeech();
    setAudioBusy(false);
    setPauseReason(reason);
    setPaused(true);
  };
  const togglePause = () => {
    if (phase() !== "playing" || !controller) return;
    if (paused()) { controller.resume(); setPaused(false); setPauseReason(""); }
    else setPause("manual");
  };

  useArcadeLifecycle({ isPlaying: () => phase() === "playing" && Boolean(controller), isPaused: paused, pause: (reason) => setPause(reason), refresh: () => controller?.refresh() });

  const physicalKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || document.hidden || document.body.classList.contains("game-shortcuts-open")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (phase() === "setup" && event.key === "Enter") { event.preventDefault(); void start(); return; }
    if (phase() === "result" && event.key === "Enter") { event.preventDefault(); void start(); return; }
    if (phase() !== "playing") return;
    if (event.code === "Space") { event.preventDefault(); togglePause(); return; }
    if ((event.key === "r" || event.key === "R") && mode() === "audio") { event.preventDefault(); void replay(); return; }
    if (paused() || audioBusy()) return;
    if (event.key === "Backspace") { event.preventDefault(); controller?.backspace(); return; }
    if (/^[a-z0-5]$/i.test(event.key)) { event.preventDefault(); controller?.typeChar(event.key); }
  };

  onMount(async () => {
    window.addEventListener("keydown", physicalKeydown);
    const settings = await db.settings.get("app");
    if (disposed) return;
    setToneMode(settings?.fallingToneMode ?? "plain");
    setReducedMotion(Boolean(settings?.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches));
    setReady(true);
  });

  onCleanup(() => {
    disposed = true;
    runToken += 1;
    window.removeEventListener("keydown", physicalKeydown);
    if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
    destroyGame();
    void settleWrites().then(() => finishTrackedSession());
  });

  const nextStage = () => {
    const index = ARCADE_STAGES.findIndex((item) => item.id === stageId());
    const next = ARCADE_STAGES[index + 1];
    if (!next) { setPhase("setup"); return; }
    setStageId(next.id);
    void start();
  };
  const hasNextStage = () => ARCADE_STAGES.findIndex((item) => item.id === stageId()) < ARCADE_STAGES.length - 1;
  const resultStars = () => starsForResult(correct(), wrong(), target(), state().bestCombo, activeStage());
  const missionResults = () => stageMissions(activeStage(), correct(), wrong(), target(), state().bestCombo);
  const accuracy = () => Math.round((correct() / Math.max(1, correct() + wrong())) * 100);

  return (
    <GameFrame title="Falling Recall" subtitle="Panda Dojo · typing recall" meta={<span>Màn {activeStage().number} · {poolShortLabel(poolSelection())}</span>} shortcuts={[
      { keys: "A–Z", label: "Gõ pinyin" }, { keys: "⌫", label: "Xóa" }, ...(mode() === "audio" ? [{ keys: "R", label: "Nghe lại" }] : []), { keys: "Space", label: "Pause" }, { keys: "Enter", label: "Bắt đầu / chơi lại" }
    ]}>
      <Show when={ready()} fallback={<div class="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Đang chuẩn bị game…</div>}>
        <Show when={!reducedMotion()} fallback={
          <section class="mx-auto mt-3 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div class="text-xs font-extrabold uppercase tracking-widest text-blue-700">Reduced motion</div><h2 class="mt-2 text-2xl font-black text-slate-900">Falling đang được tắt.</h2><p class="mt-2 text-sm leading-6 text-slate-500">Dùng Speed 20 để luyện cùng skill mà không có vật thể rơi.</p><div class="mt-5 flex flex-wrap gap-2"><A class="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-4 font-bold text-white no-underline" href="/games/speed">Mở Speed 20</A><A class="inline-flex min-h-12 items-center rounded-xl bg-slate-100 px-4 font-bold text-slate-800 no-underline" href="/games">Game khác</A></div>
          </section>
        }>
          <Show when={phase() === "setup"}>
            <section class="mx-auto mt-2 w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div class="grid lg:grid-cols-[1.05fr_0.95fr]">
                <div class="border-b border-slate-200 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                  <div class="flex items-start gap-4">
                    <img src="/mascot/panda-ranger.png" alt="Panda Dojo" class="size-12 shrink-0 object-contain sm:size-14"/>
                    <div><div class="text-xs font-extrabold uppercase tracking-[0.12em] text-blue-700">Panda Dojo</div><h2 class="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Chọn trận luyện</h2><p class="mt-1.5 max-w-xl text-xs leading-5 text-slate-500">Gõ đúng pinyin để gấu phóng phi tiêu vào chữ; đáp án đúng được đọc lại để củng cố âm. Combo càng dài, vật phẩm càng sớm xuất hiện.</p></div>
                  </div>

                  <div class="mt-4"><div class="text-xs font-black uppercase tracking-wider text-slate-500">1 · Kỹ năng</div><div class="mt-2 grid gap-2 sm:grid-cols-2">{(Object.keys(modeCopy) as Mode[]).map((key) => <button type="button" class={`rounded-2xl border p-3 text-left transition ${mode() === key ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300"}`} onClick={() => setMode(key)}><div class="text-sm font-black text-slate-900">{modeCopy[key].label}</div><div class="mt-1 text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">{modeCopy[key].skill}</div><p class="mt-2 text-xs leading-5 text-slate-500">{modeCopy[key].description}</p></button>)}</div></div>

                  <div class="mt-4"><div class="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">2 · Bộ từ</div><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="blue" /></div>

                  <p class="mt-3 text-[0.6875rem] leading-4 text-slate-400">Web dùng bàn phím · iPad/mobile có keyboard trong game · tự bắn khi khớp hoàn toàn.</p>
                </div>

                <div class="bg-slate-50/70 p-4 sm:p-5">
                  <div class="flex items-end justify-between gap-3"><div><div class="text-xs font-black uppercase tracking-wider text-slate-500">3 · Chọn màn</div><h3 class="mt-1 text-lg font-black text-slate-900">Mỗi màn có nhịp và nhiệm vụ riêng</h3></div><span class="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">4 màn</span></div>
                  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{ARCADE_STAGES.map((stage) => <button type="button" class={`group rounded-xl border p-3 text-left transition ${stageId() === stage.id ? "border-blue-300 bg-white ring-2 ring-blue-100 shadow-sm" : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white"}`} onClick={() => setStageId(stage.id)}><div class="flex items-center justify-between gap-3"><span class="grid size-9 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">{stage.number}</span><span class={`rounded-full px-2 py-1 text-[0.6875rem] font-black ${stage.id === "master" ? "bg-red-50 text-red-700" : stage.id === "storm" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{stage.difficulty}</span></div><div class="mt-2 text-sm font-black text-slate-900">{stage.name}</div><p class="mt-1 text-xs text-slate-500">{stage.subtitle}</p><div class="mt-2 flex flex-wrap gap-1.5 text-[0.6875rem] font-bold text-slate-600"><span class="rounded-full bg-slate-100 px-2 py-1">{stage.words} từ</span><span class="rounded-full bg-slate-100 px-2 py-1">{stage.lives} mạng</span><span class="rounded-full bg-slate-100 px-2 py-1">+{Math.round(stage.rampPerMinute*100)}% / phút</span><span class="rounded-full bg-slate-100 px-2 py-1">{stage.powerUps.length} power-up</span><span class="rounded-full bg-amber-50 px-2 py-1 text-amber-700">★ {stageBests()[stage.id]?.stars ?? 0}/3</span></div><Show when={(stageBests()[stage.id]?.score ?? 0) > 0}><div class="mt-2 text-[0.6875rem] font-bold text-slate-400">Kỷ lục {stageBests()[stage.id]!.score.toLocaleString("vi-VN")} điểm</div></Show></button>)}</div>
                  <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5">
                    <div class="text-[0.6875rem] font-black uppercase tracking-[0.1em] text-slate-400">Nhiệm vụ màn</div>
                    <div class="mt-2 grid gap-2 text-xs text-slate-600">
                      <div class="flex items-center gap-2"><Circle size={15} class="text-blue-500"/><span>Hoàn thành toàn bộ {activeStage().words} mục tiêu</span></div>
                      <div class="flex items-center gap-2"><Circle size={15} class="text-blue-500"/><span>Độ chính xác ≥ {activeStage().missionAccuracy}%</span></div>
                      <div class="flex items-center gap-2"><Circle size={15} class="text-blue-500"/><span>Combo ≥ ×{activeStage().missionCombo}</span></div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2 text-[0.6875rem] font-bold text-slate-500"><span class="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-cyan-700"><TimerReset size={13}/>Slow</span><Show when={activeStage().powerUps.includes("heart")}><span class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700"><Heart size={13}/>Hồi tim</span></Show><Show when={activeStage().powerUps.includes("shield")}><span class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700"><Shield size={13}/>Khiên</span></Show></div>
                  </div>
                  <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{errorMessage()}</div></Show>
                  <button class="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50" disabled={starting()} onClick={() => void start()}>{starting() ? "Đang chuẩn bị…" : `Vào màn ${activeStage().number} · ${activeStage().name}`}<span class="hidden sm:inline">→</span></button>
                </div>
              </div>
            </section>
          </Show>

          <Show when={phase() === "playing"}>
            <section class="mx-auto flex w-full max-w-none flex-col gap-2.5">
              <div class="relative h-[clamp(19rem,43dvh,29rem)] overflow-hidden rounded-[1.25rem] border border-slate-900/10 bg-slate-950 shadow-[0_1rem_2.5rem_rgba(15,23,42,0.18)] touch-capable:h-[clamp(23rem,50dvh,33rem)] fine-pointer:h-[clamp(24rem,52dvh,34rem)] landscape:touch-capable:h-[clamp(18rem,55dvh,26rem)]">
                <div class="h-full w-full overflow-hidden [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:touch-none" ref={mount}/>

                <div class="pointer-events-none absolute inset-x-0 top-0 z-10 p-2.5 sm:p-3">
                  <div class="flex flex-wrap items-center gap-1 sm:gap-1.5">
                    <span class="rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white shadow-sm backdrop-blur">M{activeStage().number} · {activeStage().name}</span>
                    <span class="rounded-full border border-white/10 bg-blue-500/90 px-2 py-1 text-[0.625rem] font-black text-white shadow-sm">{modeCopy[mode()].label}</span>
                    <span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur"><Heart size={12} fill="currentColor"/> {state().lives}</span>
                    <Show when={state().shield > 0}><span class="inline-flex items-center gap-1 rounded-full border border-blue-300/20 bg-blue-400/85 px-2 py-1 text-[0.625rem] font-black text-slate-950"><Shield size={12}/> Khiên</span></Show>
                    <Show when={state().slowMs > 0}><span class="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/90 px-2 py-1 text-[0.625rem] font-black text-slate-950"><TimerReset size={12}/> {(state().slowMs/1000).toFixed(1)}s</span></Show>
                    <span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur"><Gauge size={12}/> ×{state().speedFactor.toFixed(2)}</span>
                    <span class="rounded-full border border-amber-200/20 bg-amber-400/90 px-2 py-1 text-[0.625rem] font-black text-slate-950">×{state().combo}</span>
                    <span class="rounded-full border border-white/10 bg-slate-950/72 px-2 py-1 text-[0.625rem] font-black text-white backdrop-blur">{state().score.toLocaleString("vi-VN")}</span>
                    <div class="pointer-events-auto ml-auto flex gap-1.5">
                      <Show when={mode() === "audio"}><button class="min-h-8 rounded-lg border border-white/15 bg-slate-950/72 px-2.5 text-[0.625rem] font-black text-white backdrop-blur transition hover:bg-slate-900 disabled:opacity-40" type="button" disabled={paused() || audioBusy()} onClick={() => void replay()}><span class="inline-flex items-center gap-1"><Volume2 size={13}/>Nghe</span></button></Show>
                      <button class="min-h-8 rounded-lg border border-white/15 bg-slate-950/72 px-2.5 text-[0.625rem] font-black text-white backdrop-blur transition hover:bg-slate-900" type="button" onClick={togglePause}>{paused() ? "Tiếp" : "Pause"}</button>
                    </div>
                  </div>
                  <div class="mt-2 flex items-center gap-1.5">
                    <div class="h-1 flex-1 overflow-hidden rounded-full bg-white/15"><div class="h-full rounded-full bg-cyan-300 shadow-[0_0_1rem_rgba(103,232,249,0.7)] transition-[width]" style={{ width: `${target() ? Math.min(100, (correct() / target()) * 100) : 0}%` }}/></div>
                    <div class="flex items-center gap-1 rounded-full bg-slate-950/60 px-1.5 py-1 backdrop-blur" title="5 câu đúng liên tiếp để nhận vật phẩm"><span class="hidden text-[0.625rem] font-black uppercase tracking-wide text-slate-300 sm:inline">Item</span>{[0,1,2,3,4].map((index) => <span class={`size-1.5 rounded-full ${index < (state().combo % 5) ? "bg-cyan-300 shadow-[0_0_.5rem_rgba(103,232,249,.9)]" : "bg-white/20"}`}/>)}</div>
                    <span class="rounded-full bg-slate-950/60 px-1.5 py-1 text-[0.625rem] font-black text-white backdrop-blur">{correct()}/{target()}</span>
                  </div>
                </div>

                <Show when={paused()}><div class="absolute inset-0 z-20 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"><div class="grid max-w-sm justify-items-center gap-2 rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-center text-white shadow-2xl"><b class="text-xl font-black">Đã tạm dừng</b><p class="text-xs leading-5 text-slate-300">{pauseReason() === "background" || pauseReason() === "pagehide" ? "Game tự pause khi bạn chuyển app hoặc khóa màn hình." : "Nhịp chơi và mạng được giữ nguyên."}</p><button class="mt-1 min-h-12 rounded-xl bg-white px-5 text-sm font-extrabold text-slate-900" type="button" onClick={togglePause}>▶ Tiếp tục</button></div></div></Show>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-950 p-2.5 text-white shadow-lg sm:p-3 touch-capable:sticky touch-capable:bottom-[max(0.5rem,env(safe-area-inset-bottom))] touch-capable:z-20">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 fine-pointer:hidden">
                  <div class="flex items-center gap-2"><span class="grid size-9 place-items-center rounded-xl bg-white/10 text-cyan-200"><Keyboard size={18} strokeWidth={2.2}/></span><div><div class="text-[0.625rem] font-black uppercase tracking-[0.14em] text-slate-500">Pinyin console</div><div class="text-xs font-bold text-slate-300">{toneMode() === "numbers" ? "Nhập không dấu + số thanh, ví dụ qi1xian4" : "Nhập pinyin không dấu, ví dụ qixian"}</div></div></div>
                  <div class="flex items-center gap-2"><Show when={mode() === "audio"}><button class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/8 px-3 text-xs font-black text-white transition hover:bg-white/12 disabled:opacity-40" type="button" disabled={paused() || audioBusy()} onClick={() => void replay()}><Volume2 size={15}/>Nghe lại</button></Show><button class="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/8 px-3 text-xs font-black text-white transition hover:bg-white/12" type="button" onClick={togglePause}>{paused() ? <><Play size={15}/>Tiếp</> : <><Pause size={15}/>Pause</>}</button></div>
                </div>

                <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div class={`min-h-[4.25rem] rounded-2xl border px-4 py-2.5 transition ${state().validPrefix ? "border-white/10 bg-white/8" : "border-red-400/50 bg-red-500/15"}`} aria-live="polite">
                    <div class="flex min-h-7 flex-wrap items-center justify-center gap-1 font-mono text-lg font-black tracking-[0.08em] sm:text-xl"><Show when={!audioBusy()} fallback={<span class="text-sm tracking-normal text-cyan-200">Đang phát âm…</span>}><Show when={state().typed.length > 0} fallback={<span class="text-sm tracking-normal text-slate-500">Gõ pinyin để khóa mục tiêu…</span>}>{[...state().typed].map((char) => <span class="grid min-w-5 place-items-center border-b-2 border-cyan-300/70 pb-0.5 text-white">{char}</span>)}</Show></Show></div>
                    <div class="mt-1 flex min-h-5 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center">
                      <Show when={answerFeedback()} fallback={<span class={`text-[0.6875rem] font-bold ${state().validPrefix ? "text-slate-500" : "text-red-300"}`}>{state().validPrefix ? "Khớp hoàn toàn sẽ tự bắn" : "Prefix chưa đúng — xóa ký tự cuối rồi sửa"}</span>}>{(feedback) => <><span class={`text-[0.625rem] font-black uppercase tracking-[0.1em] ${feedback().kind === "correct" ? "text-emerald-300" : "text-rose-300"}`}>{feedback().kind === "correct" ? "✓" : "Đáp án"}</span><span class="font-black text-white">{feedback().hanzi}</span><span class="font-mono font-black text-cyan-200">{feedback().pinyin}</span><Show when={feedback().meaning}><span class="text-[0.6875rem] font-bold text-slate-400">{feedback().meaning}</span></Show></>}</Show>
                    </div>
                  </div>
                  <div class="flex justify-center gap-2 lg:justify-end"><button class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 text-xs font-black text-white transition hover:bg-white/12 disabled:opacity-40" type="button" disabled={paused() || audioBusy() || !state().typed} onClick={() => controller?.backspace()}><Delete size={16}/>Xóa</button><button class="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 text-xs font-black text-white transition hover:bg-white/12 disabled:opacity-40" type="button" disabled={paused() || audioBusy() || !state().typed} onClick={() => controller?.clear()}><Eraser size={16}/>Clear</button></div>
                </div>

                <div class="mt-3 hidden flex-wrap justify-center gap-2 fine-pointer:flex touch-capable:!hidden"><ShortcutHint keys="A–Z">Gõ trực tiếp</ShortcutHint><ShortcutHint keys="⌫">Xóa</ShortcutHint><ShortcutHint keys="Space">Pause</ShortcutHint></div>
                <div class="mt-3 hidden gap-1.5 touch-capable:grid" aria-label="Bàn phím pinyin trong game">
                  <Show when={toneMode() === "numbers"}><div class="flex gap-1.5">{["1","2","3","4","5"].map((key) => <button class={keyClass} type="button" disabled={paused() || audioBusy()} aria-label={`Thanh ${key}`} onClick={() => controller?.typeChar(key)}>{key}</button>)}</div></Show>
                  {keys.map((row) => <div class="flex gap-1.5">{[...row].map((key) => <button class={keyClass} type="button" disabled={paused() || audioBusy()} aria-label={`Phím ${key}`} onClick={() => controller?.typeChar(key)}>{key}</button>)}</div>)}
                </div>
              </div>
            </section>
          </Show>

          <Show when={phase() === "result"}>
            <GameResult eyebrow={resultStars() >= 2 ? "Qua màn" : "Kết quả"} title={<>{"★".repeat(resultStars())}{"☆".repeat(3 - resultStars())}</>} description={<>{activeStage().name} · {poolShortLabel(poolSelection())} · {accuracy()}% chính xác · {affectsFsrs() ? "cập nhật SRS" : "practice only"}</>} onRetry={() => void start()} busy={starting()} onNext={hasNextStage() ? nextStage : undefined} nextLabel={hasNextStage() ? `Màn ${activeStage().number + 1}` : undefined}>
              <div class="mx-auto mt-5 grid max-w-lg grid-cols-3 gap-2"><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">Điểm</div><div class="mt-1 text-xl font-black text-slate-900">{state().score.toLocaleString("vi-VN")}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">Best combo</div><div class="mt-1 text-xl font-black text-slate-900">×{state().bestCombo}</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">Đúng</div><div class="mt-1 text-xl font-black text-slate-900">{correct()}/{target()}</div></div></div>
              <div class="mx-auto mt-3 grid max-w-lg gap-2 text-left">{missionResults().map((mission) => <div class={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${mission.completed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{mission.completed ? <CheckCircle2 size={16}/> : <Circle size={16}/>}<span>{mission.label}</span></div>)}</div>
              <button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800" onClick={() => setPhase("setup")}>Chọn chế độ / bộ từ / màn khác</button>
            </GameResult>
          </Show>
        </Show>
      </Show>
    </GameFrame>
  );
}
