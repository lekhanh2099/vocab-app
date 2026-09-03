import { fetchVocabularyCsv, isVocabularySourceConfigError } from "../server/appsScript.mjs";

function sameOriginRequest(request) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  const forwardedHost = request.headers?.["x-forwarded-host"];
  const host = String(forwardedHost || request.headers?.host || "").split(",")[0].trim();
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!sameOriginRequest(request)) {
    response.status(403).json({ error: "Cross-origin vocabulary requests are not allowed" });
    return;
  }

  try {
    const csv = await fetchVocabularyCsv();
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(csv);
  } catch (error) {
    console.error("Apps Script vocabulary fetch failed", error);
    response.status(isVocabularySourceConfigError(error) ? 503 : 502).json({
      error: isVocabularySourceConfigError(error)
        ? "Apps Script vocabulary source is not configured"
        : "Apps Script vocabulary fetch failed"
    });
  }
}
