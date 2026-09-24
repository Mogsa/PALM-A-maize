/** A collapsed piece shows how many marks and notes it holds (SPEC 5.1). */
export function Counts({ marks, unplaced = 0, notes }: { marks: number; unplaced?: number; notes: number }) {
  return (
    <>
      {marks > 0 && <span className="count" title={`${marks} highlight${marks === 1 ? "" : "s"} inside${unplaced ? `; ${unplaced} more not found in this text` : ""}`}>{marks}</span>}
      {notes > 0 && <span className="note-count" title={`${notes} note${notes === 1 ? "" : "s"}`}>✎ {notes}</span>}
    </>
  );
}
