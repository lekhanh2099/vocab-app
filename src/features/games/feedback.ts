let audioContext: AudioContext | undefined;

function context(): AudioContext | undefined {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext;
  if (!Ctor) return;
  audioContext ??= new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(frequency: number, duration: number, gainValue = 0.035, delay = 0, type: OscillatorType = "sine") {
  const ctx = context(); if (!ctx) return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination); osc.start(at); osc.stop(at + duration + 0.02);
}

function playSfx(kind: "correct" | "wrong" | "complete" | "powerup") {
  try {
    if (kind === "correct") { tone(660,.10,.025); tone(880,.12,.022,.055); }
    else if (kind === "wrong") { tone(190,.18,.025,0,"triangle"); }
    else if (kind === "powerup") { tone(740,.09,.024); tone(990,.11,.024,.06); tone(1320,.12,.02,.12); }
    else { tone(523,.12,.025); tone(659,.15,.024,.08); tone(784,.19,.022,.16); }
  } catch { /* sound is optional */ }
}

export function pulseGameFeedback(kind: "correct" | "wrong" | "complete" | "powerup"): void {
  playSfx(kind);
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    if (kind === "correct") navigator.vibrate(12);
    else if (kind === "wrong") navigator.vibrate([18,24,18]);
    else if (kind === "powerup") navigator.vibrate([10,16,10]);
    else navigator.vibrate([14,24,14,24,24]);
  } catch { /* haptics are optional */ }
}
