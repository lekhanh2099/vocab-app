import { db } from "../../db/database";
import { speakChinese, type SpeakOptions } from "./speech";

let cached: SpeakOptions | undefined;
let cachedAt = 0;
const CACHE_MS = 5000;

export function invalidateSpeechPreferences(): void {
  cached = undefined;
  cachedAt = 0;
}

export async function getAppSpeakOptions(): Promise<SpeakOptions> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const settings = await db.settings.get("app");
  cached = {
    rate: settings?.audioRate ?? 0.9,
    voiceURI: settings?.audioVoiceURI,
    strategy: settings?.audioStrategy ?? "offline"
  };
  cachedAt = Date.now();
  return cached;
}

export async function speakChineseApp(text: string): Promise<void> {
  if (!text || document.hidden) return;
  await speakChinese(text, await getAppSpeakOptions());
}
