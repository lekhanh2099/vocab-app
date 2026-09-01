import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { GameFrame, GameResult } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { pulseGameFeedback } from "../../features/games/feedback";
import type { VocabularyRow } from "../../domain/models";
import { beginGameSession, finishGameSession, gameTargetKey, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, shuffle } from "../../games/shared/gameData";
import { createGamePoolSelection, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";
import { filterUnambiguousMeaningTargets } from "../../games/shared/targeting";

type Tile = { id: string; targetId: string; type: "zh" | "vi"; text: string };
type Phase = "setup" | "playing" | "result";
const keyMap = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

export default function MatchGame() {
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [requestedPairs, setRequestedPairs] = createSignal<4 | 6>(6);
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [rows, setRows] = createSignal<VocabularyRow[]>([]);
  const [tiles, setTiles] = createSignal<Tile[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [done, setDone] = createSignal(new Set<string>());
  const [mismatch, setMismatch] = createSignal(new Set<string>());
  const [score, setScore] = createSignal(0);
  const [misses, setMisses] = createSignal(0);
  const [lastMatched, setLastMatched] = createSignal<{ hanzi: string; pinyin: string; meaning: string }>();
  const [pickedAt, setPickedAt] = createSignal(Date.now());
  const [runStartedAt, setRunStartedAt] = createSignal(Date.now());
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const pairCount = () => rows().length;
  const completedPairs = () => done().size / 2;
  const [locked, setLocked] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  let sessionId = "";
  let mismatchTimer = 0;
  let loadToken = 0;
  let disposed = false;

  const finish = async () => {
    if (!sessionId) return;
    const id = sessionId;
    sessionId = "";
    await finishGameSession(id);
  };

  const start = async () => {
    const token = ++loadToken;
    window.clearTimeout(mismatchTimer);
    setLoading(true);
    setErrorMessage("");
    setLocked(true);
    setSelected();
    setDone(new Set<string>());
    setMismatch(new Set<string>());
    setScore(0);
    setMisses(0);
    setLastMatched();
    setElapsedMs(0);
    await finish();
    if (disposed || token !== loadToken) return;
    const data = shuffle(filterUnambiguousMeaningTargets((await getPlayableRows(playableOptionsForSelection(poolSelection(), 100))).filter((row) => primaryMeaning(row)))).slice(0, requestedPairs());
    if (disposed || token !== loadToken) return;
    if (data.length < 2) {
      setRows([]); setTiles([]); setLoading(false); setLocked(false); setPhase("setup");
      setErrorMessage("Cần ít nhất 2 từ đã học có nghĩa Việt rõ trong phạm vi này. Hãy đổi pool hoặc học thêm vài từ trước.");
      return;
    }
    setRows(data);
    setTiles(shuffle(data.flatMap((row) => {
      const targetId = gameTargetKey(row);
      return [
        { id: `${targetId}:zh`, targetId, type: "zh" as const, text: row.lexeme.hanzi },
        { id: `${targetId}:vi`, targetId, type: "vi" as const, text: primaryMeaning(row) }
      ];
    })));
    setRunStartedAt(Date.now());
    setPhase("playing");
    setLoading(false);
    setLocked(false);
    if (data.length) {
      const newSessionId = await beginGameSession("match", data.length);
      if (disposed || token !== loadToken) { await finishGameSession(newSessionId); return; }
      sessionId = newSessionId;
    }
  };

  onCleanup(() => {
    disposed = true;
    loadToken += 1;
    window.clearTimeout(mismatchTimer);
    void finish();
  });

  const completeRun = async () => {
    setElapsedMs(Date.now() - runStartedAt());
    await finish();
    if (!disposed) setPhase("result");
  };

  const pick = async (tile: Tile) => {
    if (phase() !== "playing" || locked() || done().has(tile.id)) return;
    const first = selected();
    if (!first) {
      setSelected(tile.id);
      setPickedAt(Date.now());
      return;
    }
    if (first === tile.id) { setSelected(); return; }
    const a = tiles().find((item) => item.id === first);
    if (!a) { setSelected(); return; }
    const correct = a.targetId === tile.targetId && a.type !== tile.type;
    const row = rows().find((item) => gameTargetKey(item) === a.targetId);
    if (!row) return;
    const ms = Date.now() - pickedAt();
    setLocked(true);

    if (correct) {
      pulseGameFeedback("correct");
      const nextDone = new Set(done());
      nextDone.add(a.id); nextDone.add(tile.id);
      setDone(nextDone); setScore((value) => value + 1); setSelected();
      setLastMatched({ hanzi: row.lexeme.hanzi, pinyin: primaryPinyin(row), meaning: primaryMeaning(row) });
      if (sessionId) await logGameEvent(sessionId, row, true, ms);
      if (nextDone.size === pairCount() * 2) { await completeRun(); return; }
      if (!disposed) setLocked(false);
      return;
    }

    pulseGameFeedback("wrong");
    setMisses((value) => value + 1);
    setMismatch(new Set([a.id, tile.id]));
    if (sessionId) await logGameEvent(sessionId, row, false, ms);
    if (disposed) return;
    mismatchTimer = window.setTimeout(() => {
      if (disposed) return;
      setMismatch(new Set<string>()); setSelected(); setLocked(false);
    }, 520);
  };

  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || document.hidden || document.body.classList.contains("game-shortcuts-open")) return;
    if (event.metaKey || event.ctrlKey || event.altKey || loading()) return;
    if (event.key === "Enter" && (phase() === "setup" || phase() === "result")) { event.preventDefault(); void start(); return; }
    if (phase() !== "playing" || locked()) return;
    const index = keyMap.indexOf(event.key);
    if (index < 0) return;
    const tile = tiles()[index]; if (!tile) return;
    event.preventDefault(); void pick(tile);
  };
  onMount(() => window.addEventListener("keydown", keydown));
  onCleanup(() => window.removeEventListener("keydown", keydown));

  const durationText = () => `${(elapsedMs() / 1000).toFixed(1)}s`;

  return (
    <GameFrame title="Match" subtitle="Warm-up · ghép Hán ↔ nghĩa" meta={<span>{phase() === "playing" ? `${completedPairs()}/${pairCount()}` : `${requestedPairs()} cặp · ${poolShortLabel(poolSelection())}`}</span>} shortcuts={[{ keys: "1–9 0 - =", label: "Chọn ô" }, { keys: "Enter", label: "Bắt đầu / chơi lại" }]} compact>
      <Show when={phase() === "setup"}>
        <section class="mx-auto mt-3 w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Warm-up</div>
          <h2 class="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Nhìn nhanh, nối cặp, vào guồng học</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Match không tăng FSRS mastery. Nó chỉ làm nóng recognition trước khi vào Falling/Boss, nên luật phải đơn giản và feedback phải tức thì.</p>
          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            {([4,6] as const).map((count) => <button type="button" class={`rounded-2xl border p-4 text-left ${requestedPairs() === count ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white"}`} onClick={() => setRequestedPairs(count)}><div class="font-black text-slate-900">{count === 4 ? "Nhanh · 4 cặp" : "Chuẩn · 6 cặp"}</div><p class="mt-1 text-xs text-slate-500">{count === 4 ? "Phù hợp màn hình nhỏ / khởi động 1 phút." : "Đủ thử thách nhưng vẫn đọc rõ trên iPad và web."}</p></button>)}
          </div>
          <div class="mt-5"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="emerald" practiceOnly /></div>
          <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{errorMessage()}</div></Show>
          <button class="mt-5 min-h-12 w-full rounded-2xl bg-emerald-700 px-5 text-sm font-black text-white sm:w-auto" disabled={loading()} onClick={() => void start()}>{loading() ? "Đang tạo bàn…" : "Bắt đầu Match"}</button>
        </section>
      </Show>

      <Show when={phase() === "playing"}>
        <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <div class="flex items-center gap-3"><div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${pairCount() ? (completedPairs() / pairCount()) * 100 : 0}%` }}/></div><span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">{completedPairs()}/{pairCount()}</span><span class="rounded-full bg-red-50 px-2.5 py-1 text-xs font-extrabold text-red-700">sai {misses()}</span></div>
          <Show when={lastMatched()}>{(item) => <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center"><b class="text-base text-emerald-950">✓ {item().hanzi}</b><span class="ml-2 text-sm font-bold text-emerald-700">{item().pinyin}</span><div class="mt-0.5 text-xs text-emerald-800">{item().meaning}</div></div>}</Show>
          <section class="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div class="grid grid-cols-2 gap-2 sm:gap-3">{tiles().map((tile, tileIndex) => {
              const isDone = () => done().has(tile.id), isSelected = () => selected() === tile.id, isMismatch = () => mismatch().has(tile.id);
              return <button type="button" aria-pressed={isSelected()} disabled={isDone() || locked()} class={`relative min-h-20 overflow-hidden rounded-2xl border p-3 pr-9 text-center text-sm font-extrabold leading-5 transition sm:min-h-24 sm:p-4 sm:pr-10 sm:text-base ${isDone() ? "border-emerald-200 bg-emerald-50 text-emerald-800" : isMismatch() ? "border-red-300 bg-red-50 text-red-800 animate-pulse" : isSelected() ? "border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"}`} onClick={() => void pick(tile)}>{isDone() ? `✓ ${tile.text}` : tile.text}<span class="absolute right-2 top-2 grid size-6 place-items-center rounded-md border border-slate-200 bg-white/80 font-mono text-[0.625rem] font-bold text-slate-400">{keyMap[tileIndex]}</span></button>;
            })}</div>
            <p class="mt-3 text-center text-xs leading-5 text-slate-500">Chọn một ô Hán và một ô nghĩa. Cặp đúng khóa tại chỗ; cặp sai flash đỏ rồi trả quyền chọn.</p>
          </section>
        </div>
      </Show>

      <Show when={phase() === "result"}><GameResult eyebrow="Match Result" title={<>{score()}/{pairCount()} cặp</>} description={<>{misses()} lần ghép sai · {durationText()} · {poolShortLabel(poolSelection())}. Match chỉ lưu game stats, không tăng/giảm FSRS.</>} onRetry={() => void start()} busy={loading()} nextHref="/games/falling" nextLabel="Vào Falling Recall"><button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline underline-offset-4" onClick={() => setPhase("setup")}>Đổi số cặp</button></GameResult></Show>
    </GameFrame>
  );
}
