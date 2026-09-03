const DEFAULT_TIMEOUT_MS = 10000;

export class VocabularySourceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "VocabularySourceConfigError";
  }
}

export function isVocabularySourceConfigError(error) {
  return error instanceof VocabularySourceConfigError;
}

function readAppsScriptConfig(env) {
  const urlValue = String(env.APPS_SCRIPT_VOCAB_URL ?? "").trim();
  const secret = String(env.APPS_SCRIPT_VOCAB_SECRET ?? "").trim();
  if (!urlValue || !secret) {
    throw new VocabularySourceConfigError(
      "Missing Apps Script configuration. Set APPS_SCRIPT_VOCAB_URL and APPS_SCRIPT_VOCAB_SECRET."
    );
  }
  if (secret.length < 24) {
    throw new VocabularySourceConfigError("APPS_SCRIPT_VOCAB_SECRET must be at least 24 characters");
  }

  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new VocabularySourceConfigError("APPS_SCRIPT_VOCAB_URL is not a valid URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.startsWith("/macros/s/") || !url.pathname.endsWith("/exec")) {
    throw new VocabularySourceConfigError(
      "APPS_SCRIPT_VOCAB_URL must be an HTTPS Apps Script Web App /exec URL"
    );
  }
  return { url: url.toString(), secret };
}

function csvField(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function valuesToCsv(values) {
  return values.map((row) => row.map(csvField).join(",")).join("\n");
}

function normalizeValues(payload) {
  if (!payload || payload.ok !== true) {
    const message = payload && typeof payload.error === "string" ? payload.error : "Apps Script rejected the vocabulary request";
    throw new Error(message);
  }
  if (!Array.isArray(payload.values) || !payload.values.length) {
    throw new Error("Apps Script returned no vocabulary rows");
  }
  return payload.values.map((row) => {
    if (!Array.isArray(row)) throw new Error("Apps Script returned an invalid row shape");
    return row.map((cell) => String(cell ?? ""));
  });
}

export async function fetchVocabularyCsv({
  env = process.env,
  signal,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const { url, secret } = readAppsScriptConfig(env);
  const controller = signal ? undefined : new AbortController();
  const effectiveSignal = signal ?? controller.signal;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      signal: effectiveSignal,
      redirect: "follow",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ token: secret }).toString()
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Apps Script request failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Apps Script did not return JSON: ${text.slice(0, 200)}`);
    }
    return valuesToCsv(normalizeValues(payload));
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
