import type { StudyCardType } from "../domain/models";
const labels: Record<StudyCardType, string> = { recognition: "Nhận mặt", recall: "Nhớ ngược", sound: "Âm / pinyin", usage: "Cách dùng" };
export function SkillBars(props: { skills: Partial<Record<StudyCardType, number>> }) {
  return <div class="grid gap-2 sm:grid-cols-2">{(["recognition","recall","sound","usage"] as StudyCardType[]).map((type) => {
    const value = props.skills[type] ?? 0;
    return <div class="rounded-xl bg-slate-50 p-3">
      <div class="flex items-center justify-between gap-2 text-xs"><b class="text-slate-700">{labels[type]}</b><span class="font-extrabold tabular-nums text-slate-500">{value}/5</span></div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-blue-600" style={{ width: `${value * 20}%` }} /></div>
    </div>;
  })}</div>;
}
