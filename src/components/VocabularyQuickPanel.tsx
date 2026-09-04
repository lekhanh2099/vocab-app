import { A, useNavigate } from "@solidjs/router";
import { ChevronLeft, ChevronRight, ExternalLink, Star, Volume2, X } from "lucide-solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { SkillBars } from "./SkillBars";
import { Badge, buttonGhost, buttonPrimary, buttonSecondary } from "./ui";
import { createDexieQuery } from "../db/liveQuery";
import { getVocabularyRow, toggleFavorite } from "../db/repositories";
import { speakChineseApp } from "../features/audio/appSpeech";

interface Props {
  lexemeId?: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  position?: number;
  total?: number;
}

export function VocabularyQuickPanel(props: Props) {
  const navigate = useNavigate();
  const [refresh, setRefresh] = createSignal(0);
  const row = createDexieQuery(async () => {
    refresh();
    return props.lexemeId ? getVocabularyRow(props.lexemeId) : undefined;
  }, undefined);

  createEffect(() => {
    if (!props.lexemeId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); }
      else if (event.key === "ArrowLeft" && props.hasPrevious) { event.preventDefault(); props.onPrevious?.(); }
      else if (event.key === "ArrowRight" && props.hasNext) { event.preventDefault(); props.onNext?.(); }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  const doFavorite = async () => {
    const item = row();
    if (!item) return;
    await toggleFavorite(item.lexeme.id);
    setRefresh((value) => value + 1);
  };
  const speak = () => {
    const item = row();
    if (item) void speakChineseApp(item.lexeme.hanzi);
  };
  const study = () => {
    const item = row();
    if (!item) return;
    props.onClose();
    navigate(`/study?lexeme=${item.lexeme.id}&limit=10`);
  };

  return <Show when={props.lexemeId}>
    <div class="fixed inset-0 z-[80] flex items-end justify-end sm:items-stretch" role="presentation">
      <button type="button" class="absolute inset-0 cursor-default bg-slate-950/25 backdrop-blur-[1px]" aria-label="Đóng chi tiết từ" onClick={props.onClose} />
      <aside class="relative flex h-[min(92dvh,58rem)] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-slate-200 bg-[#f7f7f5] shadow-2xl sm:h-full sm:max-w-[42rem] sm:rounded-none sm:border-y-0 sm:border-r-0" role="dialog" aria-modal="true" aria-label="Chi tiết từ nhanh">
        <header class="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-4">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <button type="button" class={`${buttonGhost} size-11 px-0`} disabled={!props.hasPrevious} aria-label="Từ trước" onClick={props.onPrevious}><ChevronLeft size={19}/></button>
            <button type="button" class={`${buttonGhost} size-11 px-0`} disabled={!props.hasNext} aria-label="Từ tiếp theo" onClick={props.onNext}><ChevronRight size={19}/></button>
            <Show when={props.position && props.total}><span class="ml-1 truncate text-xs font-bold tabular-nums text-slate-500">{props.position} / {props.total}</span></Show>
          </div>
          <button type="button" class={`${buttonGhost} size-11 px-0`} aria-label="Đóng" onClick={props.onClose}><X size={19}/></button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5">
          <Show when={row()} fallback={<div class="grid min-h-48 place-items-center text-sm font-semibold text-slate-500">Đang tải chi tiết…</div>}>
            {(item) => <>
              <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="text-5xl font-black tracking-[-0.045em] text-slate-950 sm:text-6xl">{item().lexeme.hanzi}</div>
                    <div class="mt-2 text-lg font-extrabold text-blue-700 sm:text-xl">{item().readings.map((reading) => reading.pinyin).join(" / ")}</div>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      {item().senses.slice(0, 3).map((sense) => <Badge>{sense.pos || "chưa phân loại"}</Badge>)}
                    </div>
                  </div>
                  <button type="button" class={`${buttonGhost} size-11 px-0 text-lg`} aria-label={item().favorite ? "Bỏ đánh dấu" : "Đánh dấu"} onClick={() => void doFavorite()}><Star size={20} fill={item().favorite ? "currentColor" : "none"}/></button>
                </div>

                <div class="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button type="button" class={buttonSecondary} onClick={speak}><Volume2 size={17}/> Đọc</button>
                  <button type="button" class={buttonPrimary} onClick={study}>Ôn nhanh 10</button>
                  <A class={`${buttonGhost} col-span-2 sm:col-span-1`} href={`/vocab/${item().lexeme.id}`}><ExternalLink size={16}/> Mở trang chi tiết</A>
                </div>
              </section>

              <section class="mt-4">
                <div class="mb-2 flex items-center justify-between gap-3"><h2 class="text-base font-black text-slate-950 sm:text-lg">Nghĩa & cách đọc</h2><span class="text-xs font-bold text-slate-500">{item().senses.length} sense</span></div>
                <div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
                  {item().senses.map((sense, index) => <div class="py-3.5">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1"><b class="text-base text-slate-900">{index + 1}. {sense.meaningVi || "—"}</b><Show when={sense.hanViet}><span class="text-sm text-slate-500">Hán Việt: {sense.hanViet}</span></Show></div>
                    <div class="mt-1 text-sm text-slate-500">{sense.pos || "chưa phân loại"} · {item().readings.find((reading) => reading.id === sense.readingId)?.pinyin || "—"}</div>
                  </div>)}
                </div>
              </section>

              <section class="mt-4">
                <div class="mb-2 flex items-center justify-between gap-3"><h2 class="text-base font-black text-slate-950 sm:text-lg">Kỹ năng</h2><span class="text-xs font-bold text-slate-500">FSRS mastery</span></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><SkillBars skills={item().cardMastery} /></div>
              </section>

              <section class="mt-4 pb-4">
                <div class="mb-2 flex items-center justify-between gap-3"><h2 class="text-base font-black text-slate-950 sm:text-lg">Xuất hiện trong nguồn</h2><span class="text-xs font-bold text-slate-500">{item().occurrences.length} lượt</span></div>
                <div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
                  {item().occurrences.map((occurrence) => {
                    const book = item().books.find((bookItem) => bookItem.id === occurrence.bookId);
                    const lesson = item().lessons.find((lessonItem) => lessonItem.id === occurrence.lessonId);
                    return <div class="py-3.5">
                      <div class="flex flex-wrap items-center gap-2"><Badge tone="blue">{book?.nameVi ?? occurrence.bookId}</Badge><b class="text-sm text-slate-700">{lesson ? `${lesson.label} ${lesson.index}` : occurrence.lessonId}</b></div>
                      <Show when={lesson?.title}><div class="mt-2 text-sm font-semibold text-slate-800">{lesson?.title}</div></Show>
                      <div class="mt-1 text-sm leading-5 text-slate-500">{occurrence.rawPinyin}{occurrence.rawMeaningVi ? ` · ${occurrence.rawMeaningVi}` : ""}{occurrence.rawHanViet ? ` · HV ${occurrence.rawHanViet}` : ""}{occurrence.rawPos ? ` · ${occurrence.rawPos}` : ""}</div>
                    </div>;
                  })}
                </div>
              </section>
            </>}
          </Show>
        </div>
      </aside>
    </div>
  </Show>;
}
