const fieldPattern = (field: string) => new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)(\\\\?)`);

/** A string field written so far, read out of the model's unfinished JSON, so the text fills as it streams. */
export function partialField(buffer: string, field: string): string {
  const match = fieldPattern(field).exec(buffer);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

/** The explanation written so far, so the card fills as it streams. */
export const partialExplanation = (buffer: string): string => partialField(buffer, "explanation");
