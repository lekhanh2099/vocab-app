import { A } from "@solidjs/router";
import { Select } from "@kobalte/core/select";
import { Check, ChevronDown } from "lucide-solid";
import { For, Show, type JSX, type ParentProps } from "solid-js";

export const surface = "rounded-2xl border border-slate-200 bg-white shadow-sm";
export const inputClass = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70";
export const buttonPrimary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white no-underline transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-50 px-4 text-sm font-extrabold text-blue-700 no-underline transition hover:bg-blue-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
export const buttonGhost = "inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-extrabold text-slate-800 no-underline transition hover:bg-slate-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
export const buttonDanger = "inline-flex min-h-11 items-center justify-center rounded-xl bg-red-50 px-4 text-sm font-extrabold text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export interface AppSelectOption {
  value: string;
  label: string;
  description?: string;
}

export function AppSelect(props: {
  label: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const values = () => props.options.map((option) => option.value);
  const optionFor = (value: string | undefined) => props.options.find((option) => option.value === value);
  const resolvedValue = () => values().includes(props.value) ? props.value : (values()[0] ?? "");

  return <Select<string>
      class="grid min-w-0 gap-1.5"
      value={resolvedValue()}
      options={values()}
      disabled={props.disabled}
      placeholder={props.placeholder ?? "Chọn…"}
      onChange={(value) => props.onChange(value ?? "")}
      itemComponent={(itemProps) => {
        const option = () => optionFor(itemProps.item.rawValue);
        return <Select.Item
          item={itemProps.item}
          class="relative flex min-h-11 cursor-default select-none items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-900 data-[selected]:font-extrabold"
        >
          <div class="min-w-0 flex-1">
            <Select.ItemLabel class="block truncate">{option()?.label ?? itemProps.item.rawValue}</Select.ItemLabel>
            <Show when={option()?.description}><div class="mt-0.5 truncate text-[0.6875rem] font-medium text-slate-400">{option()?.description}</div></Show>
          </div>
          <Select.ItemIndicator class="grid size-5 shrink-0 place-items-center text-blue-700"><Check size={16} strokeWidth={2.5}/></Select.ItemIndicator>
        </Select.Item>;
      }}
    >
      <Select.Label class="text-xs font-bold text-slate-600">{props.label}</Select.Label>
      <Select.Trigger
        aria-label={props.label}
        class="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-800 outline-none transition data-[expanded]:border-blue-300 data-[expanded]:ring-4 data-[expanded]:ring-blue-100/60 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Select.Value<string>>{(state) => {
          const selected = optionFor(state.selectedOption());
          return <span class="truncate">{selected?.label ?? props.placeholder ?? "Chọn…"}</span>;
        }}</Select.Value>
        <Select.Icon class="shrink-0 text-slate-400 data-[expanded]:rotate-180"><ChevronDown size={16}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="z-[100] max-h-[min(24rem,70dvh)] min-w-[var(--kb-popper-anchor-width)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl outline-none">
          <Select.Listbox class="max-h-[min(23rem,68dvh)] overflow-y-auto outline-none" />
        </Select.Content>
      </Select.Portal>
    </Select>;
}

export function PageHero(props: ParentProps & { eyebrow?: string; title: JSX.Element; description?: JSX.Element; actions?: JSX.Element }) {
  return <section class={`${surface} p-5 sm:p-6 lg:p-7`}>
    <Show when={props.eyebrow}><div class="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-blue-700">{props.eyebrow}</div></Show>
    <h1 class="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">{props.title}</h1>
    <Show when={props.description}><div class="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{props.description}</div></Show>
    <Show when={props.actions}><div class="mt-5 flex flex-wrap gap-2">{props.actions}</div></Show>
    {props.children}
  </section>;
}

export function SectionHeader(props: { title: JSX.Element; meta?: JSX.Element; description?: JSX.Element }) {
  return <div class="mt-6 flex items-end justify-between gap-3 px-0.5">
    <div class="min-w-0"><h2 class="text-base font-black tracking-[-0.02em] text-slate-900 sm:text-lg">{props.title}</h2><Show when={props.description}><div class="mt-1 text-xs leading-5 text-slate-500">{props.description}</div></Show></div>
    <Show when={props.meta}><div class="shrink-0 text-xs text-slate-500">{props.meta}</div></Show>
  </div>;
}

export function Field(props: ParentProps & { label: string }) {
  return <label class="grid min-w-0 gap-1.5 text-xs font-bold text-slate-600"><span>{props.label}</span>{props.children}</label>;
}

export function Badge(props: ParentProps & { tone?: "neutral" | "blue" | "green" | "red" | "amber" }) {
  const tone = () => ({
    neutral: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700"
  }[props.tone ?? "neutral"]);
  return <span class={`inline-flex min-h-7 items-center rounded-full px-2.5 text-[0.6875rem] font-extrabold ${tone()}`}>{props.children}</span>;
}

export function EmptyState(props: { title: string; description: string; href?: string; action?: string }) {
  return <section class={`${surface} p-5 text-center sm:p-7`}><h2 class="text-xl font-black text-slate-900">{props.title}</h2><p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{props.description}</p><Show when={props.href}><A class={`${buttonPrimary} mt-4`} href={props.href!}>{props.action ?? "Mở"}</A></Show></section>;
}
