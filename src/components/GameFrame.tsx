import { A, useNavigate } from "@solidjs/router";
import { ArrowLeft, CircleHelp } from "lucide-solid";
import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX, type ParentProps } from "solid-js";

export interface GameShortcut { keys: string; label: string; }
interface GameFrameProps extends ParentProps { title: string; subtitle?: string; meta?: JSX.Element; shortcuts?: GameShortcut[]; compact?: boolean; }

const kbdClass = "inline-flex min-h-5 min-w-6 items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[0.6875rem] font-bold leading-none text-slate-700 shadow-sm";

export function GameFrame(props: GameFrameProps) {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = createSignal(false);

  createEffect(() => document.body.classList.toggle("game-shortcuts-open", showHelp()));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (showHelp()) { setShowHelp(false); return; }
      navigate("/games");
      return;
    }
    if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setShowHelp((value) => !value);
    }
  };

  onMount(() => window.addEventListener("keydown", onKeyDown));
  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown);
    document.body.classList.remove("game-shortcuts-open");
  });

  return (
    <div class={`game-page mx-auto flex min-h-dvh w-full flex-col gap-4 px-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:px-4 lg:px-6 ${props.compact ? "max-w-5xl" : "max-w-none"}`}>
      <header class="sticky top-0 z-30 grid min-h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-slate-200/80 bg-[#f7f7f5]/95 pb-2 pt-[calc(0.5rem_+_env(safe-area-inset-top))] backdrop-blur-xl sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3">
        <A href="/games" class="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-800 no-underline shadow-sm transition hover:border-slate-300 hover:shadow sm:px-3" aria-label="Quay lại danh sách game">
          <ArrowLeft size={18} strokeWidth={2.4}/><span class="hidden sm:inline">Game</span>
        </A>
        <div class="min-w-0 text-center sm:text-left">
          <h1 class="truncate text-base font-extrabold tracking-[-0.02em] text-slate-900 sm:text-lg">{props.title}</h1>
          <Show when={props.subtitle}><p class="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{props.subtitle}</p></Show>
        </div>
        <div class="flex min-w-0 items-center justify-end gap-2">
          <Show when={props.meta}><div class="hidden whitespace-nowrap text-xs text-slate-500 md:block">{props.meta}</div></Show>
          <Show when={(props.shortcuts?.length ?? 0) > 0}>
            <button class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow sm:min-w-0 sm:gap-1.5 sm:px-3" type="button" onClick={() => setShowHelp((value) => !value)} aria-expanded={showHelp()} aria-label="Xem phím tắt">
              <CircleHelp size={18} strokeWidth={2.3}/><span class="hidden sm:inline">Phím tắt</span>
            </button>
          </Show>
        </div>
      </header>

      <Show when={showHelp() && (props.shortcuts?.length ?? 0) > 0}>
        <button type="button" class="fixed inset-0 z-40 cursor-default bg-slate-950/10" aria-label="Đóng bảng phím tắt" onClick={() => setShowHelp(false)} />
        <section class="fixed left-1/2 top-[calc(4.25rem_+_env(safe-area-inset-top))] z-50 flex w-[min(calc(100%_-_1.5rem),48rem)] -translate-x-1/2 flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl" role="dialog" aria-modal="true" aria-label="Phím tắt game">
          <For each={props.shortcuts}>{(item) => <span class="inline-flex items-center gap-1.5"><kbd class={kbdClass}>{item.keys}</kbd>{item.label}</span>}</For>
          <span class="inline-flex items-center gap-1.5"><kbd class={kbdClass}>Esc</kbd>Đóng / thoát</span>
          <span class="inline-flex items-center gap-1.5"><kbd class={kbdClass}>?</kbd>Ẩn / hiện</span>
        </section>
      </Show>

      {props.children}
    </div>
  );
}

interface GameResultProps {
  eyebrow?: string; title: JSX.Element; description?: JSX.Element; onRetry?: () => void; retryLabel?: string; onNext?: () => void; nextHref?: string; nextLabel?: string; busy?: boolean; children?: JSX.Element;
}

export function GameResult(props: GameResultProps) {
  return (
    <section class="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:mt-8 sm:p-7" role="status">
      <div class="text-[0.6875rem] font-extrabold uppercase tracking-[0.1em] text-blue-700">{props.eyebrow ?? "Hoàn tất"}</div>
      <h1 class="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">{props.title}</h1>
      <Show when={props.description}><p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{props.description}</p></Show>
      {props.children}
      <div class="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:justify-center">
        <Show when={props.onRetry}><button class="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:opacity-50" type="button" disabled={props.busy} onClick={props.onRetry}>{props.busy ? "Đang chuẩn bị…" : props.retryLabel ?? "Chơi lại"}</button></Show>
        <Show when={props.onNext}><button class="min-h-12 rounded-xl bg-blue-50 px-4 text-sm font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50" type="button" disabled={props.busy} onClick={props.onNext}>{props.nextLabel ?? "Màn tiếp theo"}</button></Show>
        <Show when={!props.onNext && props.nextHref}><A class="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-50 px-4 text-sm font-extrabold text-blue-700 no-underline hover:bg-blue-100" href={props.nextHref!}>{props.nextLabel ?? "Game tiếp theo"}</A></Show>
        <A class="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-extrabold text-slate-800 no-underline hover:bg-slate-200" href="/games">Danh sách game</A>
      </div>
    </section>
  );
}

export function ShortcutHint(props: { keys: string; children: JSX.Element }) {
  return <span class="inline-flex items-center gap-1.5 text-xs text-slate-500"><kbd class={kbdClass}>{props.keys}</kbd>{props.children}</span>;
}
