import type { Ground } from "../types";

/** An earlier turn, sent back with the next question: the answer without its grounds (Ask spec). */
export type AskTurn = { question: string; answer: string };
/** `use_marks: false` leaves the reader's highlights and notes out of what is sent. */
export type AskRequest = { question: string; selection: string | null; history: AskTurn[]; use_marks: boolean };
/** `notes`: ids of the reader's notes the answer relies on. `trimmed`: the oldest turns were left out to fit. */
export type AskAnswer = { answer: string; grounds: Ground[]; notes: string[]; trimmed: boolean };
