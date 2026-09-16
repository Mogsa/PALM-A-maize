from paperboard.geometry import column_runs, midpoint, union

WIDTHS = {0: 612.0, 1: 612.0}
LEFT = (50.0, 0.0, 286.0, 0.0)     # x-span of the left column
RIGHT = (309.0, 0.0, 545.0, 0.0)   # x-span of the right column
FULL = (50.0, 0.0, 545.0, 0.0)     # a full-width figure


def _at(col, page, y0, y1):
    return (page, (col[0], y0, col[2], y1))


def test_union_and_midpoint():
    assert union((0.0, 0.0, 1.0, 1.0), (2.0, 3.0, 4.0, 5.0)) == (0.0, 0.0, 4.0, 5.0)
    assert midpoint((0.0, 0.0, 10.0, 4.0)) == (5.0, 2.0)


def test_same_column_stack_is_one_run():
    runs = column_runs([_at(LEFT, 0, 100, 200), _at(LEFT, 0, 210, 300)], WIDTHS)
    assert runs == [(0, (50.0, 100.0, 286.0, 300.0))]


def test_column_change_starts_a_new_run_even_without_an_upward_jump():
    # short left column ending at y=150, right column starting lower at y=160
    runs = column_runs([_at(LEFT, 0, 100, 150), _at(RIGHT, 0, 160, 400)], WIDTHS)
    assert len(runs) == 2


def test_full_width_figure_does_not_merge_with_the_column_beneath_it():
    runs = column_runs([_at(FULL, 0, 72, 173), _at(LEFT, 0, 393, 713)], WIDTHS)
    assert runs == [(0, (50.0, 72.0, 545.0, 173.0)), (0, (50.0, 393.0, 286.0, 713.0))]


def test_page_change_starts_a_new_run():
    runs = column_runs([_at(LEFT, 0, 600, 700), _at(LEFT, 1, 72, 200)], WIDTHS)
    assert [page for page, _ in runs] == [0, 1]


def test_upward_jump_on_the_same_page_starts_a_new_run():
    runs = column_runs([_at(LEFT, 0, 400, 700), _at(RIGHT, 0, 72, 300)], WIDTHS)
    assert len(runs) == 2
