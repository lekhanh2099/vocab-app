const toneMap: Record<string, readonly [string, string]> = {
  "ā":["a","1"],"á":["a","2"],"ǎ":["a","3"],"à":["a","4"],
  "ē":["e","1"],"é":["e","2"],"ě":["e","3"],"è":["e","4"],
  "ī":["i","1"],"í":["i","2"],"ǐ":["i","3"],"ì":["i","4"],
  "ō":["o","1"],"ó":["o","2"],"ǒ":["o","3"],"ò":["o","4"],
  "ū":["u","1"],"ú":["u","2"],"ǔ":["u","3"],"ù":["u","4"],
  "ǖ":["v","1"],"ǘ":["v","2"],"ǚ":["v","3"],"ǜ":["v","4"],"ü":["v",""]
};

const umlautMap = /[üǖǘǚǜ]/g;
const umlautToV: Record<string, string> = { "ü":"v", "ǖ":"v", "ǘ":"v", "ǚ":"v", "ǜ":"v" };

function preservePinyinUmlaut(value: string): string {
  // Do this BEFORE NFD stripping. Otherwise ü/ǜ decomposes to u + combining
  // diaeresis and is irreversibly normalized to `u` instead of pinyin `v`.
  return value.replace(umlautMap, (char) => umlautToV[char] ?? char);
}

export function stripDiacritics(value: string): string {
  return preservePinyinUmlaut(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeSearch(value: string): string {
  return stripDiacritics(value).toLowerCase().replace(/[\s\-·'’]+/g, "").trim();
}

/**
 * Tone-mode comparison deliberately ignores where a tone number is typed
 * inside a syllable. Source `qīxiàn` and user input `qi1xian4` both become
 * `qixian|14`. This preserves the tone sequence without needing to guess
 * syllable boundaries from joined pinyin strings.
 */
export function toneSignature(value: string): string {
  let letters = "";
  let tones = "";
  for (const raw of value.toLowerCase()) {
    const mapped = toneMap[raw];
    if (mapped) {
      letters += mapped[0];
      tones += mapped[1];
      continue;
    }
    if (/[1-5]/.test(raw)) { tones += raw; continue; }
    if (/[a-z]/.test(raw)) { letters += raw; continue; }
  }
  return `${letters}|${tones}`;
}

export function normalizeTyping(value: string, toneMode: "plain" | "numbers" = "plain"): string {
  if (toneMode === "numbers") return toneSignature(value);
  return normalizeSearch(value).replace(/[^a-zv]/g, "");
}

export function typingPrefixMatches(rawInput: string, expectedNormalized: string, toneMode: "plain" | "numbers" = "plain"): boolean {
  const typed = normalizeTyping(rawInput, toneMode);
  if (toneMode === "plain") return expectedNormalized.startsWith(typed);
  const [typedLetters = "", typedTones = ""] = typed.split("|");
  const [expectedLetters = "", expectedTones = ""] = expectedNormalized.split("|");
  return expectedLetters.startsWith(typedLetters) && expectedTones.startsWith(typedTones);
}
