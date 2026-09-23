"""Split a paper into its section and figure pieces (SPEC-ADDENDUM.md section 6,
`POST /split`, D16). The one implementation, used by first open and by the
Split button. Reads the source and the board as saved; writes nothing."""

from paperboard.board_model import Board
from paperboard.source_model import SourceDocument


def split(doc: SourceDocument, board: Board) -> list[dict]:
    """A draft node, `{type, position, data}` with no `id` and no `parentId`, for
    every section and figure whose id is not the `data.source_id` of a node on
    the board, in paper order.

    Stub: returns no drafts. The split task implements it."""
    return []
