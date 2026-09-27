"""Headings the layout model buried inside another region (ross11a page 6)."""

import pytest

from paperboard.extract.inline_headings import Line, accepted_headings, allowed_next


def _line(text, y, bold=True, size=10.0):
    return Line(rect=(76.0, y, 300.0, y + size), text=text, bold=bold, size=size)


BODY = 10.0


@pytest.mark.parametrize(("last", "number", "ok"), [
    ("4.2", "5", True),       # next top level
    ("5", "5.1", True),       # child
    ("5.1", "5.2", True),     # sibling
    ("3.2.1", "3.3", True),   # sibling of an ancestor
    ("3.2", "9", False),      # breaks the sequence
    ("3.2", "3.2", False),    # repeats
    ("3.2", "3.4", False),    # skips
    (None, "1", True),
    (None, "4", False),
])
def test_a_number_must_fit_the_sequence(last, number, ok):
    assert (number in allowed_next(last)) is ok


def test_bold_numbered_line_fitting_the_sequence_is_a_heading():
    lines = [_line("some body text above", 0, bold=False), _line("5 EXPERIMENTS", 20, size=12.0),
             _line("To demonstrate the efficacy", 40, bold=False), _line("5.1 Super Tux Kart", 60)]
    assert accepted_headings(lines, BODY, "4.2") == [1, 2 + 1]


@pytest.mark.parametrize("lines", [
    [_line("1. Foo the bar", 0), _line("2. Bar the foo", 12)],           # a numbered list
    [_line("5 Where the loss is minimised (3)", 0)],                     # an equation number
    [_line("5 0.12 0.34", 0)],                                           # a table row
    [_line("[5] Smith et al. A paper", 0)],                              # a reference
    [_line("9 Foo", 0)],                                                 # breaks the sequence after 4.2
    [_line("5 Experiments", 0, bold=False)],                             # neither bold nor large
    [_line("5 " + "Long " * 20, 0)],                                     # too long for a heading
    [_line("5 lower case sentence", 0)],                                 # a sentence
])
def test_lines_that_are_not_headings_are_rejected(lines):
    assert accepted_headings(lines, BODY, "4.2") == []


def test_a_larger_than_body_line_need_not_be_bold():
    assert accepted_headings([_line("5 Experiments", 0, bold=False, size=12.0)], BODY, "4.2") == [0]


def test_nothing_is_accepted_after_references():
    assert accepted_headings([_line("5 Experiments", 0)], BODY, "4.2", after_references=True) == []
