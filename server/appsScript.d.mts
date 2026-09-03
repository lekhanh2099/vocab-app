export class VocabularySourceConfigError extends Error {}
export function isVocabularySourceConfigError(error: unknown): boolean;
export function valuesToCsv(values: string[][]): string;
export function fetchVocabularyCsv(options?: {
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string>;
