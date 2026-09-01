import { Show } from "solid-js";
import { useRegisterSW } from "virtual:pwa-register/solid";
import { buttonGhost, buttonPrimary } from "./ui";

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({ onRegisterError(error) { console.error("Service worker registration failed", error); } });
  const close = () => { setOfflineReady(false); setNeedRefresh(false); };
  return <Show when={offlineReady() || needRefresh()}>
    <div class="fixed inset-x-3 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-lg items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl md:bottom-4" role="status">
      <span class="min-w-0 flex-1 text-xs font-bold leading-5 text-slate-700">{needRefresh() ? "Có phiên bản mới. Update khi không ở giữa game." : "App đã sẵn sàng offline."}</span>
      <Show when={needRefresh()}><button class={`${buttonPrimary} min-h-9 px-3 text-xs`} onClick={() => void updateServiceWorker(true)}>Update</button></Show>
      <button class={`${buttonGhost} min-h-9 px-3 text-xs`} onClick={close}>Đóng</button>
    </div>
  </Show>;
}
