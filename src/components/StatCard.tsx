export function StatCard(props: { value: string | number; label: string; detail?: string }) {
  return <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <strong class="block text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">{props.value}</strong>
    <span class="mt-2 block text-xs font-extrabold text-slate-700">{props.label}</span>
    {props.detail && <small class="mt-1 block text-[0.6875rem] leading-5 text-slate-500">{props.detail}</small>}
  </div>;
}
