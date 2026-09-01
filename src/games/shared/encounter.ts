/**
 * Convert a whole game encounter into one FSRS-compatible outcome.
 * Intermediate misses are game events, not separate reviews.
 */
export function encounterOutcome(solved: boolean, failedAttempts: number): { correct: boolean; hinted: boolean } {
  if (!solved) return { correct: false, hinted: false };
  return { correct: true, hinted: failedAttempts > 0 };
}
