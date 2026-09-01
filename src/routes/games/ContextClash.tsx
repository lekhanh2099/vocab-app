import { A } from "@solidjs/router";
import { createSignal, onCleanup, Show } from "solid-js";
import { GameFrame, GameResult } from "../../components/GameFrame";
import { GamePoolSelector } from "../../components/GamePoolSelector";
import { ChoiceGamePanel, GameProgress } from "../../components/ChoiceGamePanel";
import { db } from "../../db/database";
import type { ContextItem, VocabularyRow } from "../../domain/models";
import { useGameKeys } from "../../features/games/useGameKeys";
import { beginGameSession, finishGameSession, gameTargetKey, getPlayableRows, logGameEvent, primaryMeaning, primaryPinyin, recordGameAnswer, recordPracticeAnswer, shuffle } from "../../games/shared/gameData";
import { createGamePoolSelection, gamePoolAffectsFsrs, playableOptionsForSelection, poolShortLabel } from "../../games/shared/poolSelection";
import { expandRowsByReading } from "../../games/shared/targeting";
import { choosePlausibleDistractorsByLabel } from "../../games/shared/distractors";

interface ContextQuestion { context: ContextItem; row: VocabularyRow; options: VocabularyRow[] }
type Phase = "setup" | "playing" | "result";

export default function ContextClash() {
  const [phase, setPhase] = createSignal<Phase>("setup");
  const [poolSelection, setPoolSelection] = createGamePoolSelection();
  const [requestedCount, setRequestedCount] = createSignal<10 | 20>(10);
  const [errorMessage, setErrorMessage] = createSignal("");
  const [questions, setQuestions] = createSignal<ContextQuestion[]>([]);
  const [index, setIndex] = createSignal(0);
  const [answered, setAnswered] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal("");
  const [score, setScore] = createSignal(0);
  const [loaded, setLoaded] = createSignal(true);
  const [committing, setCommitting] = createSignal(false);
  const [startedAt, setStartedAt] = createSignal(Date.now());
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
    setLoaded(false);
    setCommitting(false);
    setQuestions([]);
    setIndex(0);
    setAnswered(false);
    setSelectedKey("");
    setScore(0);
    await finish();
    if (disposed || token !== loadToken) return;

    const selection = poolSelection();
    const [allContexts, rows] = await Promise.all([
      db.contexts.filter((item) => item.verified === true).toArray(),
      getPlayableRows({ ...playableOptionsForSelection(selection, 600, ["usage"]), preserveSenses: true })
    ]);
    if (disposed || token !== loadToken) return;
    const contexts = selection.kind === "course"
      ? allContexts.filter((item) => (!selection.bookId || item.sourceBookId === selection.bookId) && (!selection.lessonId || item.sourceLessonId === selection.lessonId))
      : allContexts;
    const expanded = expandRowsByReading(rows.filter((row) => row.senses.length > 0));
    const byLexeme = new Map<string, VocabularyRow[]>();
    for (const row of expanded) {
      const list = byLexeme.get(row.lexeme.id) ?? [];
      list.push(row);
      byLexeme.set(row.lexeme.id, list);
    }
    const result: ContextQuestion[] = [];
    const seenTargets = new Set<string>();

    for (const context of shuffle(contexts)) {
      if (result.length >= requestedCount()) break;
      const candidates = byLexeme.get(context.lexemeId) ?? [];
      const baseRow = context.senseId
        ? candidates.find((candidate) => candidate.senses.some((sense) => sense.id === context.senseId))
        : candidates.length === 1 ? candidates[0] : undefined;
      if (!baseRow || !context.sentenceZh.includes(baseRow.lexeme.hanzi)) continue;
      const targetSense = context.senseId ? baseRow.senses.find((sense) => sense.id === context.senseId) : baseRow.senses[0];
      if (!targetSense) continue;
      const row: VocabularyRow = { ...baseRow, targetSenseId: targetSense.id, senses: [targetSense] };
      if (seenTargets.has(gameTargetKey(row))) continue;
      // Polyphonic contexts without senseId are intentionally skipped; usage
      // must be attached to the reading/sense it actually demonstrates.
      const distractors = choosePlausibleDistractorsByLabel(row, expanded, (item) => item.lexeme.hanzi, 3);
      if (distractors.length < 3) continue;
      result.push({ context, row, options: shuffle([row, ...distractors]) });
      seenTargets.add(gameTargetKey(row));
    }

    setQuestions(result);
    setLoaded(true);
    setStartedAt(Date.now());
    if (!result.length) {
      setPhase("setup");
      setErrorMessage("Không có đủ context đã kiểm chứng trong phạm vi này.");
      return;
    }
    setErrorMessage("");
    setPhase("playing");
    if (result.length) {
      const newSessionId = await beginGameSession("context", result.length);
      if (disposed || token !== loadToken) { await finishGameSession(newSessionId); return; }
      sessionId = newSessionId;
    }
  };

  onCleanup(() => {
    disposed = true;
    loadToken += 1;
    void finish();
  });

  const question = () => questions()[index()];
  const done = () => phase() === "result";
  const sentence = () => {
    const current = question();
    if (!current) return "";
    return current.context.sentenceZh.replace(current.row.lexeme.hanzi, "____");
  };

  const answer = async (row: VocabularyRow) => {
    if (answered() || committing() || !question()) return;
    const current = question()!;
    const ok = row.lexeme.id === current.row.lexeme.id;
    const ms = Date.now() - startedAt();
    setSelectedKey(row.lexeme.id);
    if (ok) setScore((value) => value + 1);
    setAnswered(true);
    setCommitting(true);
    try {
      await Promise.all([
        gamePoolAffectsFsrs(poolSelection()) ? recordGameAnswer(current.row, "usage", ok, ms, "context", false, current.context.senseId) : recordPracticeAnswer(current.row, ok),
        sessionId ? logGameEvent(sessionId, current.row, ok, ms) : Promise.resolve()
      ]);
    } finally {
      if (!disposed) setCommitting(false);
    }
  };

  const next = async () => {
    if (!answered() || committing()) return;
    if (index() + 1 >= questions().length) {
      await finish();
      if (!disposed) setPhase("result");
      return;
    }
    setIndex((value) => value + 1);
    setAnswered(false);
    setSelectedKey("");
    setStartedAt(Date.now());
  };

  useGameKeys({
    option: (optionIndex) => { const row = question()?.options[optionIndex]; if (row) void answer(row); },
    next: () => { if ((phase() === "setup" || phase() === "result") && loaded()) void load(); else if (phase() === "playing" && answered() && !committing()) void next(); },
    restart: () => { if (phase() !== "playing" && loaded()) void load(); },
    enabled: () => loaded() && !committing()
  });

  const optionViews = () => question()?.options.map((row) => ({ key: row.lexeme.id, label: row.lexeme.hanzi, secondary: primaryMeaning(row) })) ?? [];
  const selectByKey = (key: string) => {
    const row = question()?.options.find((item) => item.lexeme.id === key);
    if (row) void answer(row);
  };

  return (
    <GameFrame title="Context Clash" subtitle="usage · source-backed only" meta={<span>{phase() === "playing" ? `${Math.min(index() + 1, questions().length)}/${questions().length}` : `${requestedCount()} · ${poolShortLabel(poolSelection())}`}</span>} shortcuts={[{ keys: "1–4", label: "Chọn từ" }, { keys: "Enter", label: "Bắt đầu / câu tiếp theo" }]} compact>
      <Show when={phase() === "setup"}>
        <section class="mx-auto mt-3 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Usage · verified only</div>
          <h2 class="mt-2 text-2xl font-black text-slate-900">Chọn phạm vi context thật</h2>
          <p class="mt-2 text-sm leading-6 text-slate-500">Context Clash chỉ dùng câu đã kiểm chứng và đúng sense. Chọn bài/unit chỉ hiện context có provenance thuộc chính bài đó.</p>
          <div class="mt-5"><GamePoolSelector value={poolSelection} onChange={setPoolSelection} accent="emerald" /></div>
          <div class="mt-4 flex gap-2">{([10,20] as const).map((count) => <button type="button" class={`min-h-11 rounded-xl border px-4 text-sm font-black ${requestedCount() === count ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setRequestedCount(count)}>{count} câu</button>)}</div>
          <Show when={errorMessage()}><div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{errorMessage()}</div></Show>
          <button class="mt-5 min-h-12 rounded-2xl bg-emerald-700 px-5 text-sm font-black text-white" disabled={!loaded()} onClick={() => void load()}>{loaded() ? "Bắt đầu Context Clash" : "Đang tải…"}</button>
        </section>
      </Show>

      <Show when={phase() === "playing"}>
        <Show when={question()}>{(current) => <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <GameProgress value={index()} total={questions().length}/>
          <ChoiceGamePanel
            eyebrow={`Usage · ${index() + 1}/${questions().length}`}
            prompt={sentence()}
            promptSize="context"
            subtitle={current().context.translationVi || "Chọn từ khớp ngữ cảnh nguồn."}
            options={optionViews()}
            answered={answered()}
            selectedKey={selectedKey()}
            correctKeys={new Set([current().row.lexeme.id])}
            busy={committing()}
            onSelect={(key) => selectByKey(key)}
            feedbackCorrect={selectedKey() === current().row.lexeme.id}
            feedback={<><b>{selectedKey() === current().row.lexeme.id ? "Đúng" : "Sai"} · {current().row.lexeme.hanzi} {primaryPinyin(current().row)}</b><br/>{primaryMeaning(current().row)}<div class="mt-1 text-xs opacity-75">Nguồn: {current().context.sourceBookId || "verified pack"}{current().context.sourceLessonId ? ` · ${current().context.sourceLessonId}` : ""}</div></>}
            onNext={() => void next()}
          />
        </div>}</Show>
      </Show>

      <Show when={phase() === "result"}>
        <GameResult eyebrow="Context Result" title={<>{score()}/{questions().length}</>} description={<>{gamePoolAffectsFsrs(poolSelection()) ? "Usage card đã được cập nhật riêng; recognition cao không che usage thấp." : "Practice only; lỗi được đánh dấu để quay lại ở Từ yếu."}</>} onRetry={() => void load()} busy={!loaded()} nextHref="/games/boss" nextLabel="Boss Battle">
          <button type="button" class="mt-4 text-xs font-extrabold text-slate-500 underline underline-offset-4" onClick={() => setPhase("setup")}>Đổi phạm vi</button>
        </GameResult>
      </Show>
    </GameFrame>
  );}
