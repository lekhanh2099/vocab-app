import { A, useLocation } from "@solidjs/router";
import { Activity, BookOpen, Gamepad2, Home, Library, Settings } from "lucide-solid";
import { ErrorBoundary, Show, Suspense, type ParentProps } from "solid-js";
import { ReloadPrompt } from "../components/ReloadPrompt";

type NavIcon = typeof Home;
const navItems: ReadonlyArray<{ href: string; label: string; icon: NavIcon }> = [
  { href: "/", label: "Hôm nay", icon: Home },
  { href: "/study", label: "Ôn", icon: BookOpen },
  { href: "/games", label: "Game", icon: Gamepad2 },
  { href: "/vocab", label: "Kho từ", icon: Library },
  { href: "/progress", label: "Tiến độ", icon: Activity }
];

export function AppShell(props: ParentProps) {
  const location = useLocation();
  const isGameSession = () => /^\/games\/.+/.test(location.pathname);

  return (
    <div class={`min-h-dvh bg-[#f7f7f5] text-slate-900 ${isGameSession() ? "" : "pb-[calc(4.75rem_+_env(safe-area-inset-bottom))] md:pb-0"}`}>
      <Show when={!isGameSession()}>
        <header class="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f7f5]/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div class="mx-auto flex min-h-16 w-full max-w-[72rem] items-center gap-4 px-3 sm:px-4 lg:px-6">
            <A href="/" class="flex min-w-0 items-center gap-2.5 no-underline" end><img src="/icons/icon-192.png" alt="" class="size-9 shrink-0 rounded-xl shadow-sm"/><span class="min-w-0"><b class="block truncate text-lg font-black tracking-[-0.03em] text-slate-900">Vocab Universe</b><span class="mt-0.5 hidden text-[0.6875rem] text-slate-500 sm:block">Solid · FSRS · offline-first</span></span></A>
            <nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Điều hướng chính desktop">{navItems.map((item) => {
              const Icon = item.icon;
              return <A href={item.href} end={item.href === "/"} activeClass="bg-blue-50 text-blue-700" class="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold text-slate-600 no-underline transition hover:bg-slate-100"><Icon size={16} strokeWidth={2.2}/>{item.label}</A>;
            })}</nav>
            <A href="/settings" class="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 no-underline shadow-sm transition hover:border-slate-300 hover:text-slate-950" aria-label="Cài đặt"><Settings size={19} strokeWidth={2.2}/></A>
          </div>
        </header>
      </Show>

      <main class={isGameSession() ? "w-full" : "mx-auto w-full max-w-[72rem] px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"}>
        <ErrorBoundary fallback={(_error, reset) => (
          <section class="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-5 shadow-sm" role="alert"><div class="text-xs font-extrabold uppercase tracking-widest text-red-700">Runtime recovery</div><h1 class="mt-2 text-2xl font-black text-slate-900">{isGameSession() ? "Game gặp lỗi và đã được dừng an toàn." : "Màn hình này gặp lỗi."}</h1><p class="mt-2 text-sm leading-6 text-slate-500">Progress đã ghi trước đó vẫn nằm trong IndexedDB.</p><div class="mt-4 flex flex-wrap gap-2"><button class="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white" type="button" onClick={reset}>Thử lại</button><A class="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-extrabold text-slate-800 no-underline" href={isGameSession() ? "/games" : "/"}>{isGameSession() ? "Về Game" : "Về Hôm nay"}</A></div></section>
        )}>
          <Suspense fallback={<div class="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Đang tải…</div>}>{props.children}</Suspense>
        </ErrorBoundary>
      </main>

      <Show when={!isGameSession()}>
        <nav class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Điều hướng chính mobile"><div class="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-2 py-1.5">{navItems.map((item) => {
          const Icon = item.icon;
          return <A href={item.href} end={item.href === "/"} activeClass="bg-blue-50 text-blue-700" class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.625rem] font-bold text-slate-500 no-underline"><Icon size={19} strokeWidth={2.2}/><span>{item.label}</span></A>;
        })}</div></nav>
      </Show>
      <Show when={!isGameSession()}><ReloadPrompt /></Show>
    </div>
  );
}
