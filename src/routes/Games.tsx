import { A } from "@solidjs/router";
import { createMemo } from "solid-js";
import { AudioLines, CheckCircle2, Circle, Crown, Gauge, Grid2X2, ListChecks, Target, Trophy, Zap } from "lucide-solid";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";

const quickGames = [
  ["汉", "Hán → Nghĩa", "/games/quiz/meaning", "Recognition"],
  ["HV", "Hán → Hán Việt", "/games/quiz/hanviet", "Recognition"],
  ["↩", "Nghĩa → Hán", "/games/quiz/reverse", "Recall"],
  ["ā", "Pinyin → Hán", "/games/quiz/pinyin", "Sound"],
  ["🎧", "Audio → Hán", "/games/quiz/audio", "Listening"]
] as const;


const memoryLoopGames = [
  ["1", "Falling", "Hán/Audio → tự gõ pinyin", "/games/falling"],
  ["2", "Shooter", "Nghĩa → nhận đúng chữ Hán", "/games/shooter"],
  ["3", "Audio Bomb", "Nghe → nhận chữ Hán", "/games/shooter?mode=audio"],
  ["4", "Boss", "Kiểm lỗ hổng nhiều chiều", "/games/boss"]
] as const;

const referenceGames = [
  ["⌘", "Source Challenge", "/games/quiz/source", "Provenance"],
  ["♻", "Duplicate Hunt", "/games/quiz/duplicates", "Cross-source"]
] as const;

export default function Games() {
  const contextCount = createDexieQuery(() => db.contexts.filter((item) => item.verified === true).count(), 0);
  const todayActivity = createDexieQuery(async () => {
    const start = new Date(); start.setHours(0,0,0,0); const startMs = start.getTime();
    const [events, sessions, reviews] = await Promise.all([
      db.gameEvents.orderBy("at").reverse().limit(400).toArray(),
      db.gameSessions.orderBy("startedAt").reverse().limit(80).toArray(),
      db.reviewLogs.orderBy("reviewedAt").reverse().limit(400).toArray()
    ]);
    return {
      correct: events.filter((item) => new Date(item.at).getTime() >= startMs && item.correct).length,
      arcadeFinished: sessions.filter((item) => item.endedAt && new Date(item.startedAt).getTime() >= startMs && ["falling","shooter","audio-bomb"].includes(item.mode)).length,
      scheduledReviews: reviews.filter((item) => new Date(item.reviewedAt).getTime() >= startMs).length
    };
  }, { correct: 0, arcadeFinished: 0, scheduledReviews: 0 });
  const missions = createMemo(() => [
    { label: "Retrieval đúng 15 lần", current: Math.min(15, todayActivity().correct), target: 15 },
    { label: "Hoàn thành 1 màn Arcade", current: Math.min(1, todayActivity().arcadeFinished), target: 1 },
    { label: "Ôn 20 card theo lịch", current: Math.min(20, todayActivity().scheduledReviews), target: 20 }
  ]);

  return <>
    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div class="grid lg:grid-cols-[1.12fr_0.88fr]">
        <div class="p-5 sm:p-7 lg:p-8">
          <div class="text-xs font-black uppercase tracking-[0.13em] text-blue-700">Game Lab</div>
          <h1 class="mt-2 max-w-3xl text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Không phải “nhiều mini game”. Mỗi game phải có một lý do để chơi.</h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Arcade dùng pressure + phản xạ; Challenge kiểm khả năng tổng hợp; Quick drill chỉ dùng khi muốn ôn nhanh. Tất cả cùng một learning policy và FSRS.</p>
          <div class="mt-6 flex flex-wrap gap-2 text-xs font-bold text-slate-600"><span class="rounded-full bg-slate-100 px-3 py-1.5">Quyển · Bài · Random</span><span class="rounded-full bg-slate-100 px-3 py-1.5">Weak · Favorite · SRS</span><span class="rounded-full bg-slate-100 px-3 py-1.5">Web · iPad · Mobile</span></div>
        </div>
        <div class="relative min-h-56 overflow-hidden bg-slate-900 p-6 text-white sm:p-8">
          <div class="absolute right-8 top-7 size-16 rounded-full bg-slate-200/90 shadow-[0_0_3rem_rgba(219,234,254,0.25)]"/>
          <div class="absolute inset-x-0 bottom-0 h-20 bg-slate-800"/>
          <div class="relative z-10 flex h-full items-end justify-between gap-5">
            <div><div class="text-xs font-black uppercase tracking-[0.12em] text-blue-200">Featured</div><div class="mt-2 text-2xl font-black">Panda Dojo</div><p class="mt-1 max-w-sm text-xs leading-5 text-slate-300">Gõ đúng pinyin, gấu trúc phóng phi tiêu hạ từ trước khi chạm đất.</p></div>
            <img src="/mascot/panda-ranger.svg" alt="Panda Dojo" class="h-28 w-28 shrink-0 object-contain"/>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div class="flex flex-wrap items-end justify-between gap-3"><div><div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-violet-700"><ListChecks size={16}/>Nhiệm vụ hôm nay</div><h2 class="mt-1 text-lg font-black text-slate-900">Chơi có mục tiêu, không grind vô nghĩa</h2></div><span class="text-xs font-bold text-slate-400">Reset theo ngày trên thiết bị</span></div>
      <div class="mt-3 grid gap-2 md:grid-cols-3">{missions().map((mission) => { const done = mission.current >= mission.target; const pct = Math.round((mission.current/mission.target)*100); return <div class={`rounded-2xl border p-3 ${done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div class="flex items-center gap-2 text-sm font-black text-slate-900">{done ? <CheckCircle2 size={17} class="text-emerald-600"/> : <Circle size={17} class="text-slate-400"/>}{mission.label}</div><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div class={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-violet-500"}`} style={{width:`${pct}%`}}/></div><div class="mt-1 text-[0.6875rem] font-bold text-slate-500">{mission.current}/{mission.target}</div></div>; })}</div>
    </section>

    <section class="mt-7">
      <div class="flex items-end justify-between gap-3"><div><div class="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Arcade</div><h2 class="mt-1 text-xl font-black text-slate-900">Game có nhịp, màn chơi và game feel</h2></div><span class="hidden text-xs text-slate-500 sm:block">Khởi động → Phản xạ → Bão chữ → Cao thủ</span></div>
      <div class="mt-3 grid gap-3 lg:grid-cols-3">
        <A href="/games/falling" class="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg lg:col-span-2">
          <img src="/mascot/panda-ranger.svg" alt="" aria-hidden="true" class="absolute -bottom-5 right-3 h-36 w-36 object-contain opacity-95 sm:right-6 sm:h-40 sm:w-40"/>
          <div class="relative z-10 max-w-xl"><div class="text-xs font-black uppercase tracking-[0.12em] text-blue-200">Flagship · Productive retrieval</div><h3 class="mt-3 text-2xl font-black">Falling Recall</h3><p class="mt-2 text-sm leading-6 text-slate-300">Hán / Audio → tự gõ pinyin. Đây là game production chính: không có đáp án 4 lựa chọn để dựa vào.</p><div class="mt-5 flex flex-wrap gap-2"><span class="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">4 màn</span><span class="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">2 mode</span><span class="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">Typing</span></div><div class="mt-6 text-sm font-black text-blue-200">Vào Panda Dojo →</div></div>
        </A>
        <div class="grid gap-3">
          <A href="/games/shooter" class="group rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div class="flex items-center justify-between"><span class="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Target size={22}/></span><span class="rounded-full bg-blue-50 px-2 py-1 text-[0.6875rem] font-black text-blue-700">Recall</span></div><h3 class="mt-4 text-lg font-black">Word Shooter</h3><p class="mt-2 text-xs leading-5 text-slate-500">Nghĩa → chọn Hán. Tap target hoặc 1–4; phi tiêu khóa mục tiêu đúng.</p><div class="mt-4 text-xs font-black text-blue-700">4 màn →</div></A>
          <A href="/games/shooter?mode=audio" class="group rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div class="flex items-center justify-between"><span class="grid size-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><AudioLines size={22}/></span><span class="rounded-full bg-indigo-50 px-2 py-1 text-[0.6875rem] font-black text-indigo-700">Listening</span></div><h3 class="mt-4 text-lg font-black">Audio Bomb</h3><p class="mt-2 text-xs leading-5 text-slate-500">Nghe → chọn Hán. Timer chỉ chạy sau khi audio prompt kết thúc.</p><div class="mt-4 text-xs font-black text-blue-700">4 màn →</div></A>
        </div>
      </div>
    </section>

    <section class="mt-8 rounded-3xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6">
      <div class="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Memory loop khuyên dùng</div>
      <h2 class="mt-1 text-xl font-black text-slate-900">Đừng chơi một game mãi — đổi hướng truy xuất</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Một vòng ngắn nên đi qua form → âm → nghĩa theo nhiều hướng. Pool ông chọn được giữ xuyên các game, nên không phải chọn lại quyển/bài mỗi lần.</p>
      <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {memoryLoopGames.map(([n,title,note,href]) => <A href={href} class="rounded-2xl border border-blue-100 bg-white p-3 text-slate-900 no-underline shadow-sm transition hover:border-blue-200"><div class="grid size-7 place-items-center rounded-lg bg-blue-600 text-xs font-black text-white">{n}</div><div class="mt-2 text-sm font-black">{title}</div><p class="mt-1 text-xs leading-5 text-slate-500">{note}</p></A>)}
      </div>
    </section>

    <section class="mt-8">
      <div><div class="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Challenge</div><h2 class="mt-1 text-xl font-black text-slate-900">Ít animation hơn, kiểm kiến thức mạnh hơn</h2></div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <A class="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 no-underline shadow-sm transition hover:border-slate-300" href="/games/boss"><div class="flex items-center gap-3"><div class="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><Crown size={21}/></div><div><b class="text-sm">Boss Battle</b><p class="mt-1 text-xs text-slate-500">Một từ · nhiều chiều</p></div></div></A>
        <A class="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 no-underline shadow-sm transition hover:border-slate-300" href="/games/speed"><div class="flex items-center gap-3"><div class="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Zap size={21}/></div><div><b class="text-sm">Speed 20</b><p class="mt-1 text-xs text-slate-500">20 câu · 9 giây/câu</p></div></div></A>
        <A class="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 no-underline shadow-sm transition hover:border-slate-300" href="/games/match"><div class="flex items-center gap-3"><div class="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Grid2X2 size={21}/></div><div><b class="text-sm">Match</b><p class="mt-1 text-xs text-slate-500">Warm-up · không tăng FSRS</p></div></div></A>
      </div>
    </section>

    <section class="mt-8 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div class={`rounded-2xl border p-4 ${contextCount() > 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div class="flex items-start gap-3"><div class="text-2xl">🧩</div><div><div class="font-black text-slate-900">Context Clash</div><p class="mt-1 text-xs leading-5 text-slate-500">Usage game chỉ mở khi có câu đã kiểm chứng. Hiện có <b>{contextCount()}</b> context verified — app không dùng tên bài hay câu AI chưa review để giả lập usage.</p></div></div></div>
      {contextCount() > 0 ? <A class="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-black text-white no-underline" href="/games/context">Mở Context Clash</A> : <span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">Đang khóa đúng cách</span>}
    </section>

    <details class="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary class="cursor-pointer list-none p-4 text-sm font-black text-slate-900 sm:p-5">Quick drills <span class="ml-2 text-xs font-medium text-slate-500">Nhận biết nhanh; không thay thế productive recall</span></summary>
      <div class="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">{quickGames.map(([icon,title,href,skill]) => <A class="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-slate-300 hover:bg-slate-50" href={href}><div class="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg font-black">{icon}</div><div><b class="text-sm">{title}</b><p class="mt-1 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">{skill}</p></div></A>)}</div>
    </details>

    <details class="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70">
      <summary class="cursor-pointer list-none p-4 text-sm font-black text-slate-800 sm:p-5">Reference drills <span class="ml-2 text-xs font-medium text-slate-500">Phụ trợ provenance; không tăng mastery</span></summary>
      <div class="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2 sm:p-5">{referenceGames.map(([icon,title,href,skill]) => <A class="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 no-underline transition hover:border-slate-300" href={href}><div class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg font-black text-amber-800">{icon}</div><div><b class="text-sm">{title}</b><p class="mt-1 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">{skill}</p></div></A>)}</div>
    </details>
  </>;
}
