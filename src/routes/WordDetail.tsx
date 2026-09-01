import { A, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { SkillBars } from "../components/SkillBars";
import { Badge, buttonGhost, buttonPrimary, buttonSecondary, EmptyState, SectionHeader, surface } from "../components/ui";
import { createDexieQuery } from "../db/liveQuery";
import { getVocabularyRow, toggleFavorite } from "../db/repositories";
import { speakChineseApp } from "../features/audio/appSpeech";

export default function WordDetail() {
  const params = useParams();
  const refresh = createSignal(0); const bump = refresh[1];
  const row = createDexieQuery(async () => {
    refresh[0]();
    const lexemeId = params.id;
    return lexemeId ? getVocabularyRow(lexemeId) : undefined;
  }, undefined);

  const doFavorite = async () => { const item = row(); if (!item) return; await toggleFavorite(item.lexeme.id); bump((v) => v + 1); };
  const speak = () => { const item = row(); if (item) void speakChineseApp(item.lexeme.hanzi); };

  return <Show when={row()} fallback={<EmptyState title="Không tìm thấy từ." description="Lexeme này không có trong canonical dataset." href="/vocab" action="Về Kho từ" />}>{(item) => <>
    <section class={`${surface} p-5 sm:p-6`}>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0"><div class="text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">{item().lexeme.hanzi}</div><div class="mt-2 text-base font-extrabold text-blue-700 sm:text-lg">{item().readings.map((x) => x.pinyin).join(" / ")}</div></div>
        <button class={`${buttonGhost} min-w-11 px-3 text-lg`} aria-label={item().favorite ? "Bỏ đánh dấu" : "Đánh dấu"} onClick={() => void doFavorite()}>{item().favorite ? "★" : "☆"}</button>
      </div>
      <div class="mt-5 flex flex-wrap gap-2"><button class={buttonSecondary} onClick={speak}>🔊 Đọc</button><A class={buttonPrimary} href={`/study?lexeme=${item().lexeme.id}`}>Ôn từ này</A><A class={buttonGhost} href="/vocab">← Kho từ</A></div>
    </section>

    <SectionHeader title="Nghĩa & cách đọc" meta={`${item().senses.length} sense`} />
    <section class={`${surface} mt-3 divide-y divide-slate-100 px-4 sm:px-5`}>
      {item().senses.map((sense, index) => <div class="py-4"><div class="flex flex-wrap items-baseline gap-2"><b class="text-sm text-slate-900">{index + 1}. {sense.meaningVi || "—"}</b><Show when={sense.hanViet}><span class="text-xs text-slate-500">Hán Việt: {sense.hanViet}</span></Show></div><div class="mt-1 text-xs text-slate-500">{sense.pos || "chưa phân loại"} · {item().readings.find((x) => x.id === sense.readingId)?.pinyin || "—"}</div></div>)}
    </section>

    <SectionHeader title="Kỹ năng" meta="FSRS derived mastery" />
    <section class={`${surface} mt-3 p-4 sm:p-5`}><SkillBars skills={item().cardMastery} /></section>

    <SectionHeader title="Xuất hiện trong nguồn" meta={`${item().occurrences.length} lượt`} description="Giữ nguyên provenance, không mất bài/unit khi deduplicate." />
    <section class={`${surface} mt-3 divide-y divide-slate-100 px-4 sm:px-5`}>
      {item().occurrences.map((occ) => {
        const book = item().books.find((x) => x.id === occ.bookId);
        const lesson = item().lessons.find((x) => x.id === occ.lessonId);
        return <div class="py-4"><div class="flex flex-wrap items-center gap-2"><Badge tone="blue">{book?.nameVi ?? occ.bookId}</Badge><b class="text-xs text-slate-700">{lesson ? `${lesson.label} ${lesson.index}` : occ.lessonId}</b></div><div class="mt-2 text-sm text-slate-700">{lesson?.title}</div><div class="mt-1 text-xs leading-5 text-slate-500">{occ.rawPinyin}{occ.rawMeaningVi ? ` · ${occ.rawMeaningVi}` : ""}{occ.rawHanViet ? ` · HV ${occ.rawHanViet}` : ""}{occ.rawPos ? ` · ${occ.rawPos}` : ""}</div></div>;
      })}
    </section>
  </>}</Show>;
}
