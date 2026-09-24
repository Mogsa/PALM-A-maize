/** A card's own handles. An edge end with no handle is the card itself (addendum 4.0); React Flow still needs a handle
 *  id on both ends, and in Loose mode a target may be any handle. */
export const inHandle = (nodeId: string) => `${nodeId}-in`;
export const outHandle = (nodeId: string) => `${nodeId}-out`;
