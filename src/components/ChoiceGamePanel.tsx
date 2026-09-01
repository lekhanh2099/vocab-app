import { For, Show, type JSX } from "solid-js";
import { ShortcutHint } from "./GameFrame";

export interface ChoiceOptionView {
  key: string;
  label: string;
  secondary?: string;
}

interface ChoiceGamePanelProps {
  eyebrow?: string;
  prompt: JSX.Element;
  subtitle?: JSX.Element;
  promptSize?: "normal" | "context";
  options: ChoiceOptionView[];
  answered: boolean;
  selectedKey?: string;
  correctKeys: Set<string>;
  busy?: boolean;
  onSelect: (key: string, index: number) => void;
  audio?: boolean;
  onReplay?: () => void;
  feedback?: JSX.Element;
  feedbackCorrect?: boolean;
  onNext?: () => void;
  nextLabel?: string;
}

export function GameProgress(props: { value: number; total: number; label?: JSX.Element }) {
  const pct = () => props.total > 0 ? Math.max(0, Math.min(100, (props.value / props.total) * 100)) : 0;
  return (
    <div class="flex items-center gap-3" aria-label={`Tiến độ ${props.value}/${props.total}`}>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div class="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: `${pct()}%` }} />
      </div>
      <span class="shrink-0 text-xs font-extrabold tabular-nums text-slate-500">{props.label ?? `${props.value}/${props.total}`}</span>
    </div>
  );
}

export function ChoiceGamePanel(props: ChoiceGamePanelProps) {
  return (
    <section class="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div class="mx-auto max-w-3xl text-center">
        <Show when={props.eyebrow}><div class="text-[0.6875rem] font-extrabold uppercase tracking-[0.1em] text-blue-700">{props.eyebrow}</div></Show>
        <div class={props.promptSize === "context"
          ? "mt-2 text-xl font-black leading-relaxed tracking-[-0.02em] text-slate-900 sm:text-2xl md:text-3xl"
          : "mt-2 text-4xl font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-5xl"}>{props.prompt}</div>
        <Show when={props.subtitle}><div class="mt-2 text-sm leading-6 text-slate-500">{props.subtitle}</div></Show>
        <Show when={props.audio && props.onReplay}>
          <button type="button" class="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50" disabled={props.busy} onClick={props.onReplay}>
            🔊 Nghe lại <span class="hidden sm:inline"><ShortcutHint keys="R">Replay</ShortcutHint></span>
          </button>
        </Show>
      </div>

      <div class="mt-5 grid gap-2 sm:grid-cols-2 sm:gap-3">
        <For each={props.options}>{(option, index) => {
          const isCorrect = () => props.answered && props.correctKeys.has(option.key);
          const isWrong = () => props.answered && option.key === props.selectedKey && !props.correctKeys.has(option.key);
          return (
            <button
              type="button"
              disabled={props.answered || props.busy}
              aria-pressed={option.key === props.selectedKey}
              class={`relative min-h-16 rounded-xl border p-3 pr-12 text-left transition sm:min-h-20 sm:p-4 sm:pr-12 ${isCorrect()
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : isWrong()
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"}`}
              onClick={() => props.onSelect(option.key, index())}
            >
              <span class="block text-sm font-extrabold leading-5 sm:text-base">{option.label}</span>
              <Show when={option.secondary}><span class="mt-1 block text-xs leading-5 text-slate-500">{option.secondary}</span></Show>
              <span class="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg border border-slate-200 bg-white/80 font-mono text-[0.6875rem] font-bold text-slate-500">{index() + 1}</span>
            </button>
          );
        }}</For>
      </div>

      <Show when={props.answered}>
        <div class={`mt-3 rounded-xl border p-3 text-sm leading-6 ${props.feedbackCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} aria-live="polite">
          {props.feedback}
        </div>
        <Show when={props.onNext}>
          <button type="button" class="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:min-w-36" disabled={props.busy} onClick={props.onNext}>
            {props.busy ? "Đang lưu…" : props.nextLabel ?? "Tiếp"}
            <span class="hidden sm:inline"><ShortcutHint keys="Enter">Enter</ShortcutHint></span>
          </button>
        </Show>
      </Show>
    </section>
  );
}
