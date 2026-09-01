import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { createDexieQuery } from "../db/liveQuery";
import { db } from "../db/database";
import { createBackup, downloadJson, importContextPack, restoreBackup } from "../services/backup/backup";
import type { AppSettingsRecord } from "../domain/models";
import { getChineseVoiceInfos, onChineseVoicesChanged, speakChinese, stopChineseSpeech, type SpeechStrategy } from "../features/audio/speech";
import { invalidateSpeechPreferences } from "../features/audio/appSpeech";
import { AppSelect, buttonDanger, buttonGhost, buttonPrimary, buttonSecondary, Field, inputClass, PageHero, SectionHeader, surface } from "../components/ui";

export default function Settings() {
  const current = createDexieQuery(() => db.settings.get("app"), undefined);
  const meta = createDexieQuery(() => db.datasetMeta.get("dataset"), undefined);
  const contextCount = createDexieQuery(() => db.contexts.filter((item) => item.verified === true).count(), 0);
  const [newPerDay, setNewPerDay] = createSignal(20);
  const [reviewPerDay, setReviewPerDay] = createSignal(80);
  const [retention, setRetention] = createSignal(.9);
  const [audioRate, setAudioRate] = createSignal(.9);
  const [voiceURI, setVoiceURI] = createSignal("");
  const [audioStrategy, setAudioStrategy] = createSignal<SpeechStrategy>("offline");
  const [toneMode, setToneMode] = createSignal<"plain" | "numbers">("plain");
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const [voiceVersion, setVoiceVersion] = createSignal(0);
  const [status, setStatus] = createSignal("");
  const [testingVoice, setTestingVoice] = createSignal(false);

  const voiceInfos = () => { voiceVersion(); return getChineseVoiceInfos(audioStrategy()); };
  const selectedVoice = () => voiceURI() ? voiceInfos().find((info) => info.voice.voiceURI === voiceURI()) : voiceInfos()[0];

  createEffect(() => {
    const s = current(); if (!s) return;
    setNewPerDay(s.newPerDay); setReviewPerDay(s.reviewPerDay); setRetention(s.requestRetention); setAudioRate(s.audioRate ?? .9);
    setVoiceURI(s.audioVoiceURI ?? ""); setAudioStrategy(s.audioStrategy ?? "offline"); setToneMode(s.fallingToneMode); setReducedMotion(s.reducedMotion);
  });

  onMount(() => {
    const refresh = () => setVoiceVersion((value) => value + 1);
    refresh();
    const off = onChineseVoicesChanged(refresh);
    onCleanup(() => { off(); stopChineseSpeech(); });
  });

  const save = async () => {
    const value: AppSettingsRecord = {
      id: "app", newPerDay: Math.max(0, Math.min(100, newPerDay())), reviewPerDay: Math.max(5, Math.min(300, reviewPerDay())), requestRetention: Math.max(.7, Math.min(.98, retention())),
      audioRate: Math.max(.7, Math.min(1.12, audioRate())), audioVoiceURI: voiceURI() || undefined, audioStrategy: audioStrategy(), fallingToneMode: toneMode(), reducedMotion: reducedMotion()
    };
    await db.settings.put(value); invalidateSpeechPreferences(); setStatus("Đã lưu cài đặt.");
  };
  const testVoice = async () => {
    if (testingVoice()) return;
    setTestingVoice(true);
    try { await speakChinese("期限到了以后，合同还能继续吗？", { rate: audioRate(), voiceURI: voiceURI() || undefined, strategy: audioStrategy() }); }
    finally { setTestingVoice(false); }
  };
  const exportBackup = async () => downloadJson(await createBackup(), "vocab-universe-backup.json");
  const importBackupFile = async (file: File) => { try { const payload: unknown = JSON.parse(await file.text()); await restoreBackup(payload); invalidateSpeechPreferences(); setStatus("Đã restore backup và revive ngày FSRS."); } catch (error) { setStatus(`Backup lỗi: ${String(error)}`); } };
  const importContextFile = async (file: File) => { try { const value: unknown = JSON.parse(await file.text()); const items = Array.isArray(value) ? value : (typeof value === "object" && value !== null && "contexts" in value ? (value as { contexts?: unknown }).contexts : undefined); if (!Array.isArray(items)) throw new Error("Context JSON phải là một mảng hoặc { contexts: [...] }."); const count = await importContextPack(items); setStatus(`Đã nhập ${count} context verified.`); } catch (error) { setStatus(`Context pack lỗi: ${String(error)}`); } };
  const resetProgress = async () => { if (!confirm("Xóa toàn bộ FSRS cards, review logs, favorites và game history? Dataset vẫn giữ.")) return; await db.transaction("rw", [db.studyCards, db.reviewLogs, db.favorites, db.wordFlags, db.gameSessions, db.gameEvents], async () => { await Promise.all([db.studyCards.clear(), db.reviewLogs.clear(), db.favorites.clear(), db.wordFlags.clear(), db.gameSessions.clear(), db.gameEvents.clear()]); }); setStatus("Đã reset progress."); };

  return <>
    <PageHero eyebrow="Settings" title="Ít tuỳ chọn nhưng phải đáng tin." description="Dataset tách khỏi progress. Audio mặc định dùng Mandarin voice của chính hệ điều hành để ổn định trên web, iPad và iPhone." actions={<button class={buttonPrimary} onClick={() => void save()}>Lưu cài đặt</button>} />

    <SectionHeader title="Daily & FSRS" meta="request retention" />
    <section class={`${surface} mt-3 grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4`}>
      <Field label="Từ mới / ngày"><input class={inputClass} type="number" min="0" max="100" value={newPerDay()} onInput={(e) => setNewPerDay(Number(e.currentTarget.value))}/></Field>
      <Field label="Review tối đa / ngày"><input class={inputClass} type="number" min="5" max="300" value={reviewPerDay()} onInput={(e) => setReviewPerDay(Number(e.currentTarget.value))}/></Field>
      <Field label="FSRS retention"><input class={inputClass} type="number" min="0.7" max="0.98" step="0.01" value={retention()} onInput={(e) => setRetention(Number(e.currentTarget.value))}/></Field>
      <AppSelect label="Falling tone" value={toneMode()} options={[{ value: "plain", label: "qixian" }, { value: "numbers", label: "qi1xian4" }]} onChange={(value) => setToneMode(value as "plain" | "numbers")}/>
    </section>

    <SectionHeader title="Giọng đọc" meta="Mandarin Mainland" description="Mặc định dùng voice native của OS. Chế độ chất lượng ưu tiên Microsoft Natural nếu browser expose voice đó." />
    <section class={`${surface} mt-3 p-4 sm:p-5`}>
      <div class="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><b>Ổn định nhất:</b> chọn <b>Thiết bị / native</b>. Nếu Windows/Edge có Microsoft Xiaoxiao, Yunxi hoặc voice Natural tương đương, chọn <b>Browser / natural</b> để app ưu tiên voice đó.</div>
      <div class="mt-4 grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)_9rem_auto] lg:items-end">
        <AppSelect label="Nguồn giọng" value={audioStrategy()} options={[{ value: "offline", label: "Thiết bị · native OS" }, { value: "quality", label: "Browser · Microsoft/natural" }]} onChange={(value) => { if (value === "offline" || value === "quality") setAudioStrategy(value); setVoiceURI(""); setVoiceVersion((version) => version + 1); }}/>
        <AppSelect label="Voice" value={voiceURI()} options={[{ value: "", label: "Auto · voice Mainland tốt nhất" }, ...voiceInfos().map((info) => ({ value: info.voice.voiceURI, label: `${info.qualityHint === "preferred" ? "★ " : ""}${info.voice.name} · ${info.voice.lang}`, description: info.service === "device" ? "Device" : "Network" }))]} onChange={setVoiceURI}/>
        <Field label="Tốc độ"><input class={inputClass} type="number" min="0.7" max="1.12" step="0.05" value={audioRate()} onInput={(e) => setAudioRate(Number(e.currentTarget.value))}/></Field>
        <button class={buttonSecondary} type="button" disabled={testingVoice()} onClick={() => void testVoice()}>{testingVoice() ? "Đang đọc…" : "🔊 Nghe thử"}</button>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2"><div class="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><b class="text-slate-700">Đang chọn</b><br/><Show when={selectedVoice()} fallback="Browser chưa expose voice tiếng Trung.">{(voiceInfo) => `${voiceInfo().voice.name} · ${voiceInfo().voice.lang} · ${voiceInfo().service === "device" ? "Device" : "Network"}`}</Show></div><div class="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><b class="text-slate-700">Azure Neural TTS</b><br/>Free tier vẫn cần resource + credential bảo mật phía server. App không nhét API key vào frontend.</div></div>
    </section>

    <SectionHeader title="Motion" meta="accessibility" />
    <section class={`${surface} mt-3 p-4 sm:p-5`}><label class="flex min-h-12 cursor-pointer items-start gap-3"><input class="mt-1 size-5 accent-blue-600" type="checkbox" checked={reducedMotion()} onChange={(e) => setReducedMotion(e.currentTarget.checked)}/><span><b class="block text-sm text-slate-900">Giảm chuyển động</b><small class="mt-1 block text-xs leading-5 text-slate-500">Tắt Falling/Shooter/Audio Bomb và dùng Speed 20 thay thế.</small></span></label></section>

    <SectionHeader title="Context pack" meta={`${contextCount()} verified`} />
    <section class={`${surface} mt-3 p-4 sm:p-5`}><p class="text-xs leading-6 text-slate-500">Bốn tài liệu từ vựng hiện tại không chứa câu ví dụ đầy đủ, nên seed không giả lesson title thành context. Chỉ context pack đã kiểm chứng mới mở Usage / Context Clash.</p><label class={`${buttonSecondary} mt-3 cursor-pointer`} for="context-file">Nhập context JSON</label><input id="context-file" type="file" accept="application/json,.json" class="hidden" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void importContextFile(f); e.currentTarget.value = ""; }}/></section>

    <SectionHeader title="Backup" meta="progress + contexts" />
    <section class={`${surface} mt-3 flex flex-wrap gap-2 p-4 sm:p-5`}><button class={buttonSecondary} onClick={() => void exportBackup()}>Export backup</button><label class={`${buttonGhost} cursor-pointer`} for="backup-file">Import backup</label><input id="backup-file" type="file" accept="application/json,.json" class="hidden" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void importBackupFile(f); e.currentTarget.value = ""; }}/><button class={buttonDanger} onClick={() => void resetProgress()}>Reset progress</button></section>

    <SectionHeader title="Dataset" meta="canonical seed" />
    <section class={`${surface} mt-3 p-4 text-xs leading-6 text-slate-500 sm:p-5`}>Version: <b class="text-slate-700">{meta()?.version ?? "—"}</b><br/>Generated: {meta()?.generatedAt ?? "—"}<br/>Seeded: {meta()?.seededAt ?? "—"}<br/>2.300 lexeme · 2.302 reading · 2.463 sense · 2.475 occurrence.</section>
    <Show when={status()}><div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{status()}</div></Show>
  </>;
}
