import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { GameFrame, GameResult } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { ChoiceGamePanel, GameProgress } from "../../components/ChoiceGamePanel";
import type { ContextItem, StudyCardType, VocabularyRow } from "../../domain/models";
import { db } from "../../db/database";
import { useGameKeys } from "../../features/games/useGameKeys";
import { stopChineseSpeech } from "../../features/audio/speech";
import { speakChineseApp } from "../../features/audio/appSpeech";
import { filterTtsSafeTargets } from "../../features/audio/ttsSafety";
import { beginGameSession, finishGameSession, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordPracticeAnswer, shuffle } from "../../games/shared/gameData";
import { choosePlausibleDistractorsByLabel } from "../../games/shared/distractors";
import { filterUnambiguousMeaningTargets } from "../../games/shared/targeting";
import { createGamePoolSelection, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";

type StageKind = "recognition" | "recall" | "pinyin" | "audio" | "usage" | "source";
type Phase = "setup" | "playing" | "result";
interface Choice { key: string; label: string; row?: VocabularyRow }
interface Round { kind: StageKind; name: string; prompt: string; sub: string; skill?: StudyCardType; correctKeys: Set<string>; choices: Choice[]; senseId?: string; audio?: boolean }

export default function Boss() {
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [pool, setPool] = createSignal<VocabularyRow[]>([]);
  const [boss, setBoss] = createSignal<VocabularyRow>();
  const [bossContext, setBossContext] = createSignal<ContextItem>();
  const [stage, setStage] = createSignal(0);
  const [results, setResults] = createSignal<boolean[]>([]);
  const [answered, setAnswered] = createSignal(false);
  const [picked, setPicked] = createSignal("");
  const [startedAt, setStartedAt] = createSignal(Date.now());
  const [loading, setLoading] = createSignal(false);
  const [committing, setCommitting] = createSignal(false);
  const [audioPriming, setAudioPriming] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal("");
  let sessionId = "";
  let selectToken = 0;
  let disposed = false;
  const responseTimes: number[] = [];

  const finish = async () => {
    if (!sessionId) return;
    const id = sessionId; sessionId = ""; await finishGameSession(id);
  };

  const selectBoss = async (source: VocabularyRow[], avoidCurrent = false) => {
    const token = ++selectToken;
    stopChineseSpeech(); setLoading(true); setCommitting(false); setAudioPriming(false); setErrorMessage("");
    await finish();
    if (disposed || token !== selectToken) return;
    const currentId = avoidCurrent ? boss()?.lexeme.id : undefined;
    const candidates = currentId ? source.filter((row) => row.lexeme.id !== currentId) : source;
    const selected = shuffle(candidates.length ? candidates : source)[0];
    setBoss(selected); setStage(0); setResults([]); responseTimes.length = 0; setAnswered(false); setPicked(""); setStartedAt(Date.now());
    if (!selected) { setBossContext(undefined); setLoading(false); setErrorMessage("Không đủ từ phù hợp để tạo Boss trong bộ đã chọn."); return; }
    const selectedSenseIds = new Set(selected.senses.map((sense) => sense.id));
    const sameLexemeTargets = source.filter((row) => row.lexeme.id === selected.lexeme.id).length;
    const contexts = await db.contexts.where("lexemeId").equals(selected.lexeme.id).filter((item) => item.verified === true && item.sentenceZh.includes(selected.lexeme.hanzi) && (item.senseId ? selectedSenseIds.has(item.senseId) : sameLexemeTargets === 1)).toArray();
    if (disposed || token !== selectToken) return;
    setBossContext(shuffle(contexts)[0]);
    const newSessionId = await beginGameSession("boss", bossContext() ? 5 : 4);
    if (disposed || token !== selectToken) { await finishGameSession(newSessionId); return; }
    sessionId = newSessionId; setLoading(false); setPhase("playing");
  };

  const startBoss = async (avoidCurrent = false) => {
    const token = ++selectToken;
    setLoading(true); setErrorMessage(""); stopChineseSpeech(); await finish();
    if (disposed || token !== selectToken) return;
    const audioSafe = await filterTtsSafeTargets((await getPlayableRows(playableOptionsForSelection(poolSelection(), 220))).filter((row) => primaryMeaning(row) && primaryPinyin(row) && row.books.length > 0));
    if (disposed || token !== selectToken) return;
    const playable = filterUnambiguousMeaningTargets(audioSafe);
    setPool(playable);
    // selectBoss owns its own token; call after this async load has completed.
    await selectBoss(playable, avoidCurrent);
  };

  onCleanup(() => { disposed = true; selectToken += 1; stopChineseSpeech(); void finish(); });

  const rounds = createMemo<Round[]>(() => {
    const selected = boss(); if (!selected) return [];
    const playable = pool();
    const wordChoices = () => shuffle([selected, ...choosePlausibleDistractorsByLabel(selected, playable, (row) => row.lexeme.hanzi, 3)]).map((row) => ({ key: row.lexeme.id, label: row.lexeme.hanzi, row }));
    const meaningChoices = () => shuffle([selected, ...choosePlausibleDistractorsByLabel(selected, playable.filter((row) => primaryMeaning(row)), primaryMeaning, 3)]).map((row) => ({ key: row.lexeme.id, label: primaryMeaning(row), row }));
    const usage = bossContext();
    const core: Round[] = [
      { kind: "recognition", name: "Nhận mặt", prompt: selected.lexeme.hanzi, sub: "Chọn nghĩa.", skill: "recognition", correctKeys: new Set([selected.lexeme.id]), choices: meaningChoices() },
      { kind: "recall", name: "Gọi lại", prompt: primaryMeaning(selected), sub: "Chọn chữ Hán.", skill: "recall", correctKeys: new Set([selected.lexeme.id]), choices: wordChoices() },
      { kind: "pinyin", name: "Âm đọc", prompt: primaryPinyin(selected), sub: "Chọn chữ Hán.", skill: "sound", correctKeys: new Set([selected.lexeme.id]), choices: wordChoices() },
      { kind: "audio", name: "Nghe", prompt: "🔊", sub: "Nghe rồi chọn chữ Hán.", skill: "sound", correctKeys: new Set([selected.lexeme.id]), choices: wordChoices(), audio: true }
    ];
    if (usage) core.push({
      kind: "usage", name: "Cách dùng", prompt: usage.sentenceZh.replace(selected.lexeme.hanzi, "____"), sub: usage.translationVi || "Chọn từ khớp ngữ cảnh nguồn.", skill: "usage", correctKeys: new Set([selected.lexeme.id]), choices: wordChoices(), senseId: usage.senseId
    });
    return core;
  });

  const round = () => rounds()[stage()];

  const answer = async (choice: Choice) => {
    const selected = boss(), currentRound = round();
    if (phase() !== "playing" || answered() || committing() || audioPriming() || !selected || !currentRound) return;
    const ok = currentRound.correctKeys.has(choice.key), ms = Date.now() - startedAt(); responseTimes[stage()] = ms;
    setAnswered(true); setPicked(choice.key); setResults((value) => [...value, ok]); setCommitting(true);
    try { if (sessionId) await logGameEvent(sessionId, selected, ok, ms); }
    finally { if (!disposed) setCommitting(false); }
  };

  const commitBossOutcomes = async () => {
    const selected = boss(); if (!selected) return;
    const values = results(), rs = rounds();
    const grouped = new Map<StudyCardType, { oks: boolean[]; times: number[]; senseId?: string }>();
    rs.forEach((item, i) => { if (!item.skill) return; const bucket = grouped.get(item.skill) ?? { oks: [], times: [], senseId: item.senseId }; bucket.oks.push(Boolean(values[i])); bucket.times.push(responseTimes[i] ?? 0); bucket.senseId = bucket.senseId ?? item.senseId; grouped.set(item.skill, bucket); });
    await Promise.all([...grouped.entries()].map(([, bucket]) => {
      const allCorrect = bucket.oks.every(Boolean);
      // Boss is diagnostic practice: any miss in a skill keeps the lexeme in needs-review, but never moves FSRS.
      return recordPracticeAnswer(selected, allCorrect);
    }));
  };

  const next = async () => {
    if (!answered() || committing()) return;
    const nextStage = stage() + 1;
    if (nextStage >= rounds().length) {
      setCommitting(true);
      try { await commitBossOutcomes(); await finish(); if (!disposed) setPhase("result"); }
      finally { if (!disposed) setCommitting(false); }
      return;
    }
    setStage(nextStage); setAnswered(false); setPicked(""); setStartedAt(Date.now());
    const nextRound = rounds()[nextStage];
    if (nextRound?.audio && boss()) {
      const token = selectToken, expectedStage = nextStage; setAudioPriming(true);
      window.setTimeout(() => { const selected = boss(); if (!selected || disposed || token !== selectToken || stage() !== expectedStage) return; void (async () => { await speakChineseApp(selected.lexeme.hanzi); if (disposed || token !== selectToken || stage() !== expectedStage || boss() !== selected) return; setStartedAt(Date.now()); setAudioPriming(false); })(); }, 80);
    }
  };

  const replay = async () => {
    const selected = boss(); if (!round()?.audio || !selected || audioPriming() || answered() || document.hidden) return;
    const elapsed = Math.max(0, Date.now() - startedAt()); setAudioPriming(true);
    try { await speakChineseApp(selected.lexeme.hanzi); }
    finally { if (!disposed && boss() === selected && !answered()) setStartedAt(Date.now() - elapsed); if (!disposed) setAudioPriming(false); }
  };

  useGameKeys({
    option: (optionIndex) => { const choice = round()?.choices[optionIndex]; if (choice) void answer(choice); },
    next: () => { if (phase() === "setup" || phase() === "result") { if (!loading()) void startBoss(phase() === "result"); } else if (answered() && !committing()) void next(); },
    replay: () => { void replay(); }, restart: () => { if (phase() !== "playing" && !loading()) void startBoss(true); }, enabled: () => !loading() && !committing() && !audioPriming()
  });

  const optionViews = () => round()?.choices.map((choice) => ({ key: choice.key, label: choice.label })) ?? [];
  const selectByKey = (key: string) => { const choice = round()?.choices.find((item) => item.key === key); if (choice) void answer(choice); };
  const passed = () => results().filter(Boolean).length;

  return (
    <GameFrame title="Boss Battle" subtitle="Một từ · kiểm 5 chiều" meta={<span>{phase() === "playing" ? `${Math.min(stage()+1, rounds().length)}/${rounds().length}` : poolShortLabel(poolSelection())}</span>} shortcuts={[{ keys: "1–4", label: "Chọn đáp án" }, { keys: "Enter", label: "Bắt đầu / round tiếp" }, { keys: "R", label: "Nghe lại ở round audio" }]} compact>
      <Show when={phase() === "setup"}>
        <section class="mx-auto mt-3 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="flex items-start gap-4"><div class="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-50 text-3xl">👑</div><div><div class="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Challenge</div><h2 class="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Một Boss, bốn kỹ năng lõi + usage khi có câu thật</h2><p class="mt-2 text-sm leading-6 text-slate-500">Boss được giữ ẩn trước khi bắt đầu để không làm lộ đáp án recall. Luôn có nhận mặt → gọi lại → pinyin → audio; Usage chỉ xuất hiện khi có context đã kiểm chứng.</p></div></div>
          <div class="mt-6 grid gap-2 sm:grid-cols-4">{["Nhận mặt","Gọi lại","Âm đọc","Nghe"].map((label,i)=><div class="rounded-xl bg-slate-50 p-3 text-center"><div class="mx-auto grid size-7 place-items-center rounded-full bg-slate-900 text-[0.6875rem] font-black text-white">{i+1}</div><div class="mt-2 text-xs font-black text-slate-700">{label}</div></div>)}</div>
          <div class="mt-6"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="amber" practiceOnly /></div>
          <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage()}</div></Show>
          <button class="mt-6 min-h-12 w-full rounded-2xl bg-slate-900 px-5 text-sm font-black text-white sm:w-auto" disabled={loading()} onClick={()=>void startBoss(false)}>{loading()?"Đang triệu hồi Boss…":"Bắt đầu Boss Battle"}</button>
        </section>
      </Show>

      <Show when={phase() === "playing"}>
        <Show when={boss()}>{(selected) => <Show when={round()}>{(currentRound) => <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <div class="flex items-center gap-3"><div class="flex-1"><GameProgress value={stage()} total={rounds().length}/></div><span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">{currentRound().name}</span></div>
          <ChoiceGamePanel eyebrow={`Round ${stage()+1}/${rounds().length} · ${currentRound().name}`} prompt={currentRound().prompt} promptSize={currentRound().kind === "usage" ? "context" : "normal"} subtitle={currentRound().sub} options={optionViews()} answered={answered()} selectedKey={picked()} correctKeys={currentRound().correctKeys} busy={committing()||audioPriming()} audio={currentRound().audio} onReplay={()=>void replay()} onSelect={(key)=>selectByKey(key)} feedbackCorrect={currentRound().correctKeys.has(picked())} feedback={<><b>{currentRound().correctKeys.has(picked())?"Qua round":"Trượt round"} · {selected().lexeme.hanzi} {primaryPinyin(selected())}</b><br/>{primaryMeaning(selected())}</>} onNext={()=>void next()} nextLabel={stage()===rounds().length-1?"Xem kết quả":"Round tiếp"}/>
        </div>}</Show>}</Show>
      </Show>

      <Show when={phase() === "result" && boss()}>{(selected)=><GameResult eyebrow="Boss Result" title={<>{selected().lexeme.hanzi} · {passed()}/{rounds().length}</>} description={passed()===rounds().length?<>Perfect Boss. Practice diagnostic hoàn tất; lịch FSRS không bị đẩy.</>:passed()>=Math.max(3,rounds().length-1)?<>Khá chắc, còn một lỗ hổng. Pinyin + audio được gộp thành một sound outcome.</>:<>Chưa ổn toàn diện; lỗi practice sẽ được đánh dấu để quay lại ở Từ yếu.</>} onRetry={()=>void startBoss(true)} retryLabel="Boss khác" busy={loading()} nextHref="/games/falling" nextLabel="Vào Falling Recall"><div class="mt-4 flex flex-wrap justify-center gap-2">{results().map((ok,i)=><span class={`rounded-full px-2.5 py-1 text-xs font-extrabold ${ok?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>{rounds()[i]?.name} {ok?"✓":"✗"}</span>)}</div><button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline underline-offset-4" onClick={()=>setPhase("setup")}>Đổi bộ Boss</button></GameResult>}</Show>
    </GameFrame>
  );
}
