export type SpeechStrategy = "quality" | "offline";

export interface SpeakOptions {
  rate?: number;
  voiceURI?: string;
  strategy?: SpeechStrategy;
  /** @deprecated migration compatibility */
  preferLocal?: boolean;
}

export interface ChineseVoiceInfo {
  voice: SpeechSynthesisVoice;
  score: number;
  region: "mainland" | "other";
  service: "device" | "network";
  qualityHint: "preferred" | "standard";
}

const MAINLAND_LANG = /^(zh[-_]?CN|zh[-_]?Hans|cmn[-_]?CN)/i;
const OTHER_ZH_LANG = /^(zh|cmn)([-_]|$)/i;
const MAINLAND_NAME = /(ting[- ]?ting|tingting|xiaoxiao|xiaoyi|yunxi|yunyang|yunfan|普通话|putonghua|mandarin.*(?:china|chinese)|chinese.*(?:china|mandarin))/i;
const NATURAL_PROVIDER_NAME = /(google.*(?:普通话|中文|mandarin|chinese)|microsoft.*(?:xiaoxiao|xiaoyi|yunxi|yunyang|yunfan)|siri|premium|enhanced|natural|neural)/i;
const MICROSOFT_NATURAL_NAME = /microsoft.*(?:xiaoxiao|xiaoyi|yunxi|yunyang|yunfan|natural|neural)/i;

function resolveStrategy(options: SpeakOptions): SpeechStrategy {
  if (options.strategy) return options.strategy;
  if (typeof options.preferLocal === "boolean") return options.preferLocal ? "offline" : "quality";
  return "offline";
}

function voiceScore(voice: SpeechSynthesisVoice, strategy: SpeechStrategy): number {
  let score = 0;
  if (MAINLAND_LANG.test(voice.lang)) score += 220;
  else if (OTHER_ZH_LANG.test(voice.lang)) score += 40;
  else return -1000;

  if (MAINLAND_NAME.test(voice.name)) score += 45;
  if (NATURAL_PROVIDER_NAME.test(voice.name)) score += 35;
  if (MICROSOFT_NATURAL_NAME.test(voice.name)) score += 25;
  if (voice.default) score += 8;

  // "offline" means native OS/device voice. This is the default because it is
  // predictable on Safari/iPad/iPhone and avoids Chrome choosing a random
  // network Mandarin voice with a different timbre.
  if (strategy === "offline") score += voice.localService ? 140 : -80;
  else score += voice.localService ? 45 : 65;

  if (/zh[-_]?(TW|HK)|cmn[-_]?TW/i.test(voice.lang)) score -= 120;
  return score;
}

function rawVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function getChineseVoiceInfos(strategy: SpeechStrategy = "offline"): ChineseVoiceInfo[] {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const effective: SpeechStrategy = offline ? "offline" : strategy;
  const chinese = rawVoices().filter((voice) => OTHER_ZH_LANG.test(voice.lang));
  const localMainland = chinese.filter((voice) => voice.localService && MAINLAND_LANG.test(voice.lang));
  const anyMainland = chinese.filter((voice) => MAINLAND_LANG.test(voice.lang));
  const localChinese = chinese.filter((voice) => voice.localService);
  const candidates = effective === "offline"
    ? (localMainland.length ? localMainland : anyMainland.length ? anyMainland : localChinese.length ? localChinese : chinese)
    : chinese;
  return candidates
    .map((voice) => ({
      voice,
      score: voiceScore(voice, effective),
      region: MAINLAND_LANG.test(voice.lang) ? "mainland" as const : "other" as const,
      service: voice.localService ? "device" as const : "network" as const,
      qualityHint: MAINLAND_NAME.test(voice.name) || NATURAL_PROVIDER_NAME.test(voice.name) ? "preferred" as const : "standard" as const
    }))
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name));
}

export function getChineseVoices(strategy: SpeechStrategy = "offline"): SpeechSynthesisVoice[] {
  return getChineseVoiceInfos(strategy).map((item) => item.voice);
}

export function getRecommendedChineseVoice(strategy: SpeechStrategy = "offline"): SpeechSynthesisVoice | undefined {
  return getChineseVoiceInfos(strategy)[0]?.voice;
}

async function waitForVoiceList(timeoutMs = 700): Promise<void> {
  if (rawVoices().length) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; window.speechSynthesis.removeEventListener("voiceschanged", done); resolve(); };
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, timeoutMs);
  });
}

let generation = 0;
let activeUtterance: SpeechSynthesisUtterance | undefined;
let activeFinish: (() => void) | undefined;

export function stopChineseSpeech(): void {
  generation += 1;
  // Chromium/Safari do not consistently fire end/error after cancel(). Resolve
  // our own promise first so game prompt/pause state can never remain busy.
  const finish = activeFinish;
  activeFinish = undefined;
  activeUtterance = undefined;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  finish?.();
}

export async function speakChinese(text: string, options: SpeakOptions = {}): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text || document.hidden) return;
  await waitForVoiceList();
  if (document.hidden) return;

  const synth = window.speechSynthesis;
  const request = ++generation;
  // Starting a new utterance supersedes the previous one. Resolve its promise
  // explicitly; cancel() alone is not a reliable completion signal on WebKit.
  const previousFinish = activeFinish;
  activeFinish = undefined;
  synth.cancel();
  previousFinish?.();

  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  utterance.lang = "zh-CN";
  utterance.rate = Math.max(0.7, Math.min(1.12, options.rate ?? 0.9));
  utterance.pitch = 1;
  utterance.volume = 1;

  const strategy = resolveStrategy(options);
  const ranked = getChineseVoiceInfos(strategy);
  const explicit = options.voiceURI ? ranked.find((item) => item.voice.voiceURI === options.voiceURI)?.voice : undefined;
  const selected = explicit ?? ranked[0]?.voice;
  if (selected) { utterance.voice = selected; utterance.lang = selected.lang || "zh-CN"; }

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (activeUtterance === utterance) activeUtterance = undefined;
      if (activeFinish === finish) activeFinish = undefined;
      resolve();
    };
    activeFinish = finish;
    utterance.onend = finish;
    utterance.onerror = finish;
    // Chromium and Safari occasionally drop cancel→speak in the same task.
    window.setTimeout(() => {
      if (request !== generation || document.hidden) { finish(); return; }
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    }, 32);
    window.setTimeout(finish, Math.max(5000, text.length * 700));
  });
}

export function onChineseVoicesChanged(callback: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback);
}
