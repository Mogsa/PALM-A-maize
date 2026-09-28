const FIELD = /"explanation"\s*:\s*"((?:[^"\\]|\\.)*)(\\?)/;

/** The explanation written so far, read out of the model's unfinished JSON, so the card fills as it streams. */
export function partialExplanation(buffer: string): string {
  const match = FIELD.exec(buffer);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}
